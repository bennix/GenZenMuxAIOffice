import { useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ConnectButton, Markdown, copyTextToClipboard } from '@genoffice/ui'
import {
  REVIEW_PROFILES,
  assignReviewModels,
  availableReviewModels,
  chairSystemPrompt,
  noveltyQuerySystemPrompt,
  reviewerSystemPrompt,
  settingsForReviewModel,
  supportsLiteratureReview,
  type AiSettings,
  type ReviewLanguage,
} from '@genoffice/ai-provider'
import { LANGUAGE_OPTIONS, type Lang } from '@genoffice/i18n'
import { parseNoveltyQueries, searchNoveltyEvidence } from '@genoffice/citations'
import type { SearchIndex } from './search'

interface ReviewResult {
  role: string
  model: string
  status: 'pending' | 'running' | 'done' | 'error'
  content?: string
  error?: string
}

const MAX_DOCUMENT_CHARS = 120_000
const MAX_VISUAL_PAGES = 5
const PDF_REVIEW_PROFILES = REVIEW_PROFILES.filter((profile) => profile.category !== 'composition')

function representativePageNumbers(pageCount: number): number[] {
  if (pageCount <= MAX_VISUAL_PAGES)
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  return [
    ...new Set([
      1,
      ...[0.25, 0.5, 0.75].map((p) => Math.round(1 + p * (pageCount - 1))),
      pageCount,
    ]),
  ]
}

async function renderPagePreviews(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
): Promise<{ images: { mime: string; base64: string }[]; renderedPages: number[] }> {
  const images: { mime: string; base64: string }[] = []
  const renderedPages: number[] = []
  for (const pageNumber of pageNumbers.slice(0, MAX_VISUAL_PAGES)) {
    try {
      const page = await doc.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(1.75, 1400 / baseViewport.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      await page.render({ canvas, viewport }).promise
      images.push({
        mime: 'image/png',
        base64: canvas.toDataURL('image/png').split(',')[1] ?? '',
      })
      renderedPages.push(pageNumber)
      canvas.width = 0
      canvas.height = 0
    } catch {
      // Text review remains useful when an individual page cannot be rasterized.
    }
  }
  return { images: images.filter((image) => image.base64), renderedPages }
}

function documentText(index: SearchIndex): string {
  return index.map((page, i) => `[Page ${i + 1}]\n${page.text}`).join('\n\n')
}

export function PdfReviewCommitteeModal({
  doc,
  language: uiLanguage,
  getSearchIndex,
  onClose,
}: {
  doc: PDFDocumentProxy
  language: Lang
  getSearchIndex: () => Promise<SearchIndex> | null
  onClose: () => void
}) {
  const chinese = uiLanguage === 'zh' || uiLanguage === 'zh-TW'
  const [profileId, setProfileId] = useState('science')
  const [language, setLanguage] = useState<ReviewLanguage>(uiLanguage)
  const [members, setMembers] = useState<ReviewResult[]>([])
  const [chair, setChair] = useState<ReviewResult | null>(null)
  const [running, setRunning] = useState(false)
  const [keyMissing, setKeyMissing] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [reportCopyStatus, setReportCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [reportSendStatus, setReportSendStatus] = useState<'idle' | 'sent' | 'failed'>('idle')
  const [literatureEnabled, setLiteratureEnabled] = useState(true)
  const [literatureStatus, setLiteratureStatus] = useState('')
  const runRef = useRef(0)
  const profile = useMemo(
    () => PDF_REVIEW_PROFILES.find((item) => item.id === profileId) ?? PDF_REVIEW_PROFILES[0]!,
    [profileId],
  )

  const start = async (): Promise<void> => {
    if (running || preparing) return
    const settings: AiSettings = await window.pdfApi.getAiSettings()
    if (!settings.providers.zenmux.apiKey) {
      setKeyMissing(true)
      return
    }
    setKeyMissing(false)
    setPreparing(true)
    setChair(null)
    setMembers([])
    setLiteratureStatus('')
    const runId = ++runRef.current
    try {
      const indexPromise = getSearchIndex()
      if (!indexPromise)
        throw new Error(chinese ? '无法读取 PDF 文本。' : 'Unable to read PDF text.')
      const [index, preview] = await Promise.all([
        indexPromise,
        renderPagePreviews(doc, representativePageNumbers(doc.numPages)),
      ])
      if (runRef.current !== runId) return
      const fullText = documentText(index)
      const truncated = fullText.length > MAX_DOCUMENT_CHARS
      const visualPages = preview.renderedPages.join(', ') || (chinese ? '无' : 'none')
      const material = fullText.slice(0, MAX_DOCUMENT_CHARS)
      const userMaterial = [
        `PDF DOCUMENT (${doc.numPages} pages):`,
        material,
        truncated
          ? '\n[The extracted text was truncated at 120,000 characters. Disclose this limitation.]'
          : '',
        `\nVISUAL PAGE PREVIEWS PROVIDED: ${visualPages}.`,
        'Inspect formulas, charts, tables, diagrams, figures, labels, and visual consistency on the supplied previews. Explicitly disclose that pages without a preview were reviewed from extracted text only and could not be fully visually verified.',
      ].join('\n\n')
      const assignments = assignReviewModels(
        availableReviewModels(settings),
        profile.members.length + 1,
      )
      const initial = profile.members.map((member, index) => ({
        role: language === 'zh' || language === 'zh-TW' ? member.roleZh : member.roleEn,
        model: assignments[index]!,
        status: 'pending' as const,
      }))
      setMembers(initial)
      let noveltyEvidence = ''
      if (literatureEnabled && supportsLiteratureReview(profile)) {
        try {
          setLiteratureStatus(
            chinese ? '创新性委员正在提取检索式…' : 'Novelty reviewer is preparing search queries…',
          )
          const queryResponse = await window.pdfApi.aiChat({
            settings: settingsForReviewModel(settings, assignments[0]!),
            system: noveltyQuerySystemPrompt(language),
            user: material.slice(0, 30_000),
          })
          if (queryResponse.ok) {
            const queries = parseNoveltyQueries(queryResponse.content ?? '', material.slice(0, 240))
            setLiteratureStatus(
              chinese
                ? `正在检索 OpenAlex、Crossref、Semantic Scholar、PubMed 与 arXiv（${queries.length} 组）…`
                : `Searching scholarly sources (${queries.length} queries)…`,
            )
            noveltyEvidence = (await searchNoveltyEvidence(queries)).evidence
            setLiteratureStatus(
              chinese
                ? '文献证据已交给创新性委员'
                : 'Literature evidence supplied to the novelty reviewer',
            )
          } else {
            noveltyEvidence = `LIVE SCHOLARLY SEARCH FAILED: ${queryResponse.error ?? 'query generation failed'}. External novelty was not verified.`
            setLiteratureStatus(
              chinese
                ? '文献检索未完成，将披露限制'
                : 'Literature search incomplete; limitation will be disclosed',
            )
          }
        } catch (error) {
          noveltyEvidence = `LIVE SCHOLARLY SEARCH FAILED: ${error instanceof Error ? error.message : String(error)}. External novelty was not verified.`
          setLiteratureStatus(
            chinese
              ? '文献检索未完成，将披露限制'
              : 'Literature search incomplete; limitation will be disclosed',
          )
        }
      }
      setPreparing(false)
      setRunning(true)
      const reviews = await Promise.all(
        profile.members.map(async (member, index): Promise<ReviewResult> => {
          setMembers((old) =>
            old.map((item, i) => (i === index ? { ...item, status: 'running' } : item)),
          )
          let result: ReviewResult
          try {
            const response = await window.pdfApi.aiChat({
              settings: settingsForReviewModel(settings, assignments[index]!),
              system: reviewerSystemPrompt(profile, member, language),
              user: `${userMaterial}${member.literatureReviewer && noveltyEvidence ? `\n\n${noveltyEvidence}` : ''}`,
              images: preview.images,
            })
            result = response.ok
              ? { ...initial[index]!, status: 'done', content: response.content ?? '' }
              : { ...initial[index]!, status: 'error', error: response.error ?? 'Unknown error' }
          } catch (error) {
            result = {
              ...initial[index]!,
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            }
          }
          if (runRef.current === runId)
            setMembers((old) => old.map((item, i) => (i === index ? result : item)))
          return result
        }),
      )
      const successful = reviews.filter((review) => review.content)
      if (!successful.length || runRef.current !== runId) return
      const model = assignments.at(-1)!
      const role = language === 'zh' || language === 'zh-TW' ? '委员会主席' : 'Committee Chair'
      setChair({ role, model, status: 'running' })
      const response = await window.pdfApi.aiChat({
        settings: settingsForReviewModel(settings, model),
        system: chairSystemPrompt(profile, language),
        user: [
          `PDF scope: ${doc.numPages} pages; visual previews: ${visualPages}; text truncated: ${truncated ? 'yes' : 'no'}.`,
          ...successful.map(
            (review, index) => `## Reviewer ${index + 1}: ${review.role}\n${review.content}`,
          ),
        ].join('\n\n'),
      })
      if (runRef.current === runId)
        setChair(
          response.ok
            ? { role, model, status: 'done', content: response.content ?? '' }
            : { role, model, status: 'error', error: response.error ?? 'Unknown error' },
        )
    } catch (error) {
      if (runRef.current === runId)
        setMembers([
          {
            role: chinese ? '准备文档' : 'Prepare document',
            model: 'ZenMux',
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        ])
    } finally {
      if (runRef.current === runId) {
        setPreparing(false)
        setRunning(false)
      }
    }
  }

  const report = [chair, ...members]
    .filter((result): result is ReviewResult => Boolean(result?.content))
    .map((result) => `# ${result.role} (${result.model})\n${result.content}`)
    .join('\n\n')
  const busy = preparing || running

  const copyCompleteReport = async (): Promise<void> => {
    const copied = await copyTextToClipboard(report)
    setReportCopyStatus(copied ? 'copied' : 'failed')
    window.setTimeout(() => setReportCopyStatus('idle'), 1600)
  }

  const reportCopyLabel =
    reportCopyStatus === 'copied'
      ? chinese
        ? '已复制完整报告 ✓'
        : 'Report copied ✓'
      : reportCopyStatus === 'failed'
        ? chinese
          ? '复制失败，请重试'
          : 'Copy failed; retry'
        : chinese
          ? '复制完整报告'
          : 'Copy report'
  const reportSendLabel =
    reportSendStatus === 'sent'
      ? chinese
        ? '完整报告已发送 ✓'
        : 'Report sent ✓'
      : reportSendStatus === 'failed'
        ? chinese
          ? '发送失败，请重试'
          : 'Send failed; retry'
        : chinese
          ? '发送完整报告'
          : 'Connect report'

  return (
    <div
      className="pdf-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div className="pdf-review-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>{chinese ? 'PDF AI 审稿委员会' : 'PDF AI Review Committee'}</h2>
            <p>
              {chinese
                ? '3 名独立委员 + 1 名主席；模型随机分配，全部通过 ZenMux。AI 功能可能受网络或代理状态影响。'
                : '3 independent reviewers + 1 chair; models are randomly assigned, all through ZenMux. Network or proxy conditions may affect AI.'}
            </p>
          </div>
          <button disabled={busy} aria-label={chinese ? '关闭' : 'Close'} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pdf-review-options">
          <label>
            {chinese ? '审稿类型' : 'Review type'}
            <select
              value={profileId}
              disabled={busy}
              onChange={(event) => setProfileId(event.target.value)}
            >
              {PDF_REVIEW_PROFILES.map((item) => (
                <option key={item.id} value={item.id}>
                  {chinese ? item.labelZh : item.labelEn}
                </option>
              ))}
            </select>
          </label>
          {supportsLiteratureReview(profile) && (
            <label className="pdf-review-literature-toggle">
              <input
                type="checkbox"
                checked={literatureEnabled}
                disabled={busy}
                onChange={(event) => setLiteratureEnabled(event.target.checked)}
              />
              <span>{chinese ? '文献核验创新性' : 'Verify novelty with literature'}</span>
            </label>
          )}
          <label>
            {chinese ? '意见语言' : 'Language'}
            <select
              value={language}
              disabled={busy}
              onChange={(event) => setLanguage(event.target.value as ReviewLanguage)}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy} onClick={() => void start()}>
            {preparing
              ? chinese
                ? '正在读取 PDF…'
                : 'Reading PDF…'
              : running
                ? chinese
                  ? '审阅中…'
                  : 'Reviewing…'
                : chinese
                  ? '开始严格审稿'
                  : 'Start strict review'}
          </button>
          {report && (
            <>
              <button type="button" onClick={() => void copyCompleteReport()}>
                {reportCopyLabel}
              </button>
              <ConnectButton
                api={window.pdfApi}
                text={report}
                language={uiLanguage}
                className="pdf-review-connect-report"
                label={<span>{reportSendLabel}</span>}
                onSendResult={(ok) => {
                  setReportSendStatus(ok ? 'sent' : 'failed')
                  window.setTimeout(() => setReportSendStatus('idle'), 1600)
                }}
              />
            </>
          )}
        </div>
        {literatureStatus && <div className="pdf-review-literature-status">{literatureStatus}</div>}
        {keyMissing && (
          <div className="pdf-review-error">
            {chinese
              ? '请先在设置中配置 ZenMux API Key。'
              : 'Configure a ZenMux API key in Settings first.'}
          </div>
        )}
        <div className="pdf-review-results">
          {chair && <ReviewCard result={chair} language={uiLanguage} featured />}
          {members.map((result, index) => (
            <ReviewCard key={`${result.role}-${index}`} result={result} language={uiLanguage} />
          ))}
          {!members.length && (
            <div className="pdf-review-empty">
              {chinese
                ? '审稿会读取全文，并抽取最多 5 个代表性页面检查公式、图表、表格和图形。审稿报告不会修改原 PDF。'
                : 'The full text and up to five representative page previews are reviewed for formulas, charts, tables, and figures. The report never changes the PDF.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewCard({
  result,
  language,
  featured = false,
}: {
  result: ReviewResult
  language: Lang
  featured?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copyReply = async (): Promise<void> => {
    if (!(await copyTextToClipboard(result.content ?? ''))) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section className={`pdf-review-card${featured ? ' featured' : ''}`}>
      <header>
        <strong>{result.role}</strong>
        <span>{result.model}</span>
        <em>{result.status}</em>
      </header>
      {result.content && <Markdown text={result.content} />}
      {result.content && result.status === 'done' && (
        <div className="ai-msg-toolbar pdf-review-reply-actions">
          <ConnectButton api={window.pdfApi} text={result.content} language={language} />
          <button
            type="button"
            className="ai-msg-tool-btn"
            onClick={() => void copyReply()}
            aria-label="复制回复 / Copy reply"
            data-tip="复制回复 / Copy reply"
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      )}
      {result.error && <div className="pdf-review-error">{result.error}</div>}
    </section>
  )
}
