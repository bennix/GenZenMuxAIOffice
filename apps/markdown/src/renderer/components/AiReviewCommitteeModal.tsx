import { useMemo, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Markdown } from '@genoffice/ui'
import { LANGUAGE_OPTIONS } from '@genoffice/i18n'
import { parseNoveltyQueries, searchNoveltyEvidence } from '@genoffice/citations'
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
import { useI18n } from '../i18n/locale'

interface Result {
  role: string
  model: string
  status: 'pending' | 'running' | 'done' | 'error'
  content?: string
  error?: string
}

function selectedMarkdown(editor: Editor): string {
  const { from, to } = editor.state.selection
  if (from === to) return editor.getMarkdown()
  const content = editor.state.selection.content().content.toJSON() as JSONContent[]
  return (
    editor.markdown?.serialize({ type: 'doc', content }) ??
    editor.state.doc.textBetween(from, to, '\n')
  )
}

async function documentImages(editor: Editor): Promise<{ mime: string; base64: string }[]> {
  const sources: string[] = []
  const visit = (node: JSONContent): void => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') sources.push(node.attrs.src)
    node.content?.forEach(visit)
  }
  visit(editor.getJSON())
  const images = await Promise.all(
    [...new Set(sources)].slice(0, 5).map(async (source) => {
      const image = await window.markdownApi.readImage(source).catch(() => null)
      return image ? { mime: image.mime, base64: image.base64 } : null
    }),
  )
  return images.flatMap((image) => (image ? [image] : []))
}

export function AiReviewCommitteeModal({
  editor,
  mode = 'review',
  onClose,
}: {
  editor: Editor
  mode?: 'review' | 'composition'
  onClose: () => void
}) {
  const { lang: uiLanguage } = useI18n()
  const chinese = uiLanguage === 'zh' || uiLanguage === 'zh-TW'
  const profileOptions = useMemo(
    () =>
      REVIEW_PROFILES.filter(
        (item) => (mode === 'composition') === (item.category === 'composition'),
      ),
    [mode],
  )
  const [profileId, setProfileId] = useState(
    mode === 'composition' ? 'zhongkao-composition' : 'science',
  )
  const [language, setLanguage] = useState<ReviewLanguage>(uiLanguage)
  const [members, setMembers] = useState<Result[]>([])
  const [chair, setChair] = useState<Result | null>(null)
  const [running, setRunning] = useState(false)
  const [keyMissing, setKeyMissing] = useState(false)
  const [literatureEnabled, setLiteratureEnabled] = useState(true)
  const [literatureStatus, setLiteratureStatus] = useState('')
  const runRef = useRef(0)
  const profile = useMemo(
    () => profileOptions.find((p) => p.id === profileId) ?? profileOptions[0]!,
    [profileId, profileOptions],
  )

  const start = async () => {
    if (running) return
    const settings: AiSettings = await window.markdownApi.getAiSettings()
    if (!settings.providers.zenmux.apiKey) {
      setKeyMissing(true)
      return
    }
    setKeyMissing(false)
    setRunning(true)
    setChair(null)
    setLiteratureStatus('')
    const runId = ++runRef.current
    const assignments = assignReviewModels(
      availableReviewModels(settings),
      profile.members.length + 1,
    )
    const initial = profile.members.map((member, i) => ({
      role: language === 'zh' || language === 'zh-TW' ? member.roleZh : member.roleEn,
      model: assignments[i]!,
      status: 'pending' as const,
    }))
    setMembers(initial)
    const { from, to } = editor.state.selection
    const selected = from !== to
    const document = selectedMarkdown(editor)
    const images = await documentImages(editor)
    const material = document.slice(0, 120_000)
    const limit =
      document.length > 120_000
        ? '\n[Content was truncated at 120,000 characters; disclose this limitation.]'
        : ''
    let noveltyEvidence = ''
    if (literatureEnabled && supportsLiteratureReview(profile)) {
      try {
        setLiteratureStatus(
          chinese ? '创新性委员正在提取检索式…' : 'Novelty reviewer is preparing search queries…',
        )
        const queryResponse = await window.markdownApi.aiChat({
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
    try {
      const reviews = await Promise.all(
        profile.members.map(async (member, index): Promise<Result> => {
          setMembers((old) =>
            old.map((item, i) => (i === index ? { ...item, status: 'running' } : item)),
          )
          let result: Result
          try {
            const response = await window.markdownApi.aiChat({
              settings: settingsForReviewModel(settings, assignments[index]!),
              system: reviewerSystemPrompt(profile, member, language),
              user: `${selected ? 'SELECTED MARKDOWN' : 'MARKDOWN DOCUMENT'}:\n\n${material}${limit}${member.literatureReviewer && noveltyEvidence ? `\n\n${noveltyEvidence}` : ''}`,
              images,
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
      const successful = reviews.filter((r) => r.content)
      if (!successful.length || runRef.current !== runId) return
      const model = assignments.at(-1)!
      const role = language === 'zh' || language === 'zh-TW' ? '委员会主席' : 'Committee Chair'
      setChair({ role, model, status: 'running' })
      const response = await window.markdownApi.aiChat({
        settings: settingsForReviewModel(settings, model),
        system: chairSystemPrompt(profile, language),
        user: [
          mode === 'composition' ? `ORIGINAL ESSAY:\n${material}` : '',
          ...successful.map((r, i) => `## Reviewer ${i + 1}: ${r.role}\n${r.content}`),
        ]
          .filter(Boolean)
          .join('\n\n'),
      })
      if (runRef.current === runId)
        setChair(
          response.ok
            ? { role, model, status: 'done', content: response.content ?? '' }
            : { role, model, status: 'error', error: response.error ?? 'Unknown error' },
        )
    } finally {
      if (runRef.current === runId) setRunning(false)
    }
  }

  const report = [chair, ...members]
    .filter((r): r is Result => !!r?.content)
    .map((r) => `# ${r.role} (${r.model})\n${r.content}`)
    .join('\n\n')
  return (
    <div
      className="md-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}
    >
      <div className="md-review-dialog">
        <header>
          <div>
            <h2>
              {mode === 'composition'
                ? chinese
                  ? '作文评价与润色'
                  : 'Essay Assessment & Polishing'
                : chinese
                  ? 'AI 审稿委员会'
                  : 'AI Review Committee'}
            </h2>
            <p>
              {chinese
                ? mode === 'composition'
                  ? '3 名分项评委 + 1 名主席，按指定考试或竞赛标准评分，并给出保留原意的完整润色稿。'
                  : '3 名独立委员 + 1 名主席；学术类可检索真实文献核验创新性。全部通过 ZenMux，网络可能影响结果。'
                : '3 independent reviewers + 1 chair; models are randomly assigned, all through ZenMux. Network or proxy conditions may affect AI.'}
            </p>
          </div>
          <button disabled={running} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="md-review-options">
          <label>
            {chinese
              ? mode === 'composition'
                ? '作文标准'
                : '审稿类型'
              : mode === 'composition'
                ? 'Writing standard'
                : 'Review type'}
            <select
              value={profileId}
              disabled={running}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {profileOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {chinese ? p.labelZh : p.labelEn}
                </option>
              ))}
            </select>
          </label>
          {mode === 'review' && supportsLiteratureReview(profile) && (
            <label className="md-review-literature-toggle">
              <input
                type="checkbox"
                checked={literatureEnabled}
                disabled={running}
                onChange={(event) => setLiteratureEnabled(event.target.checked)}
              />
              <span>{chinese ? '文献核验创新性' : 'Verify novelty with literature'}</span>
            </label>
          )}
          <label>
            {chinese ? '意见语言' : 'Language'}
            <select
              value={language}
              disabled={running}
              onChange={(e) => setLanguage(e.target.value as ReviewLanguage)}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" disabled={running} onClick={() => void start()}>
            {running
              ? chinese
                ? '审阅中…'
                : 'Reviewing…'
              : chinese
                ? mode === 'composition'
                  ? '开始评价与润色'
                  : '开始严格审稿'
                : 'Start strict review'}
          </button>
          {report && (
            <button onClick={() => void navigator.clipboard.writeText(report)}>
              {chinese ? '复制完整报告' : 'Copy report'}
            </button>
          )}
        </div>
        {literatureStatus && <div className="md-review-literature-status">{literatureStatus}</div>}
        {keyMissing && (
          <div className="md-mermaid-error">
            {chinese
              ? '请先在设置中配置 ZenMux API Key。'
              : 'Configure a ZenMux API key in Settings first.'}
          </div>
        )}
        <div className="md-review-results">
          {chair && <ReviewCard result={chair} featured />}
          {members.map((result, i) => (
            <ReviewCard key={i} result={result} />
          ))}
          {!members.length && (
            <div className="md-review-empty">
              {chinese
                ? '默认审阅全文；如已选择内容，则只审阅选中部分。委员会会检查 Markdown、公式、表格、图片引用及 Mermaid 图形源码。'
                : 'Reviews the full document, or only the current selection. Markdown, formulas, tables, image references, and Mermaid source are inspected.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewCard({ result, featured = false }: { result: Result; featured?: boolean }) {
  return (
    <section className={`md-review-card${featured ? ' featured' : ''}`}>
      <header>
        <strong>{result.role}</strong>
        <span>{result.model}</span>
        <em>{result.status}</em>
      </header>
      {result.content && <Markdown text={result.content} />}
      {result.error && <div className="md-mermaid-error">{result.error}</div>}
    </section>
  )
}
