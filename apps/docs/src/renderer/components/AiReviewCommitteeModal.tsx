import { useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Markdown } from '@genoffice/ui'
import { LANGUAGE_OPTIONS } from '@genoffice/i18n'
import type { AiSettings } from '../../shared/ipc'
import { serializeRangeToHtml } from '../ai/protocol'
import {
  REVIEW_PROFILES,
  assignReviewModels,
  availableReviewModels,
  chairSystemPrompt,
  collectReviewDocumentMaterial,
  reviewerSystemPrompt,
  settingsForReviewModel,
  type ReviewLanguage,
} from '../ai-review-committee'
import { useI18n } from '../i18n/locale'

interface MemberResult {
  role: string
  model: string
  status: 'pending' | 'running' | 'done' | 'error'
  content?: string
  error?: string
}

const MAX_DOCUMENT_CHARS = 120_000

export function AiReviewCommitteeModal({
  editor,
  settings,
  onClose,
}: {
  editor: Editor
  settings: AiSettings
  onClose: () => void
}) {
  const { lang } = useI18n()
  const chineseUi = lang === 'zh' || lang === 'zh-TW'
  const [profileId, setProfileId] = useState('science')
  const [language, setLanguage] = useState<ReviewLanguage>(lang)
  const [members, setMembers] = useState<MemberResult[]>([])
  const [chair, setChair] = useState<MemberResult | null>(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const runRef = useRef(0)
  const profile = REVIEW_PROFILES.find((item) => item.id === profileId) ?? REVIEW_PROFILES[0]!
  const models = useMemo(() => availableReviewModels(settings), [settings])
  const hasKey = !!settings.providers.zenmux.apiKey

  const start = async () => {
    if (!hasKey || running) return
    const runId = ++runRef.current
    setRunning(true)
    setCopied(false)
    setChair(null)
    const assignments = assignReviewModels(models, profile.members.length + 1)
    const initial = profile.members.map((member, index) => ({
      role: language === 'zh' || language === 'zh-TW' ? member.roleZh : member.roleEn,
      model: assignments[index]!,
      status: 'pending' as const,
    }))
    setMembers(initial)

    try {
      const fullDocument = editor.state.doc.childCount
        ? serializeRangeToHtml(editor, 0, editor.state.doc.childCount - 1)
        : ''
      const truncated = fullDocument.length > MAX_DOCUMENT_CHARS
      const documentHtml = fullDocument.slice(0, MAX_DOCUMENT_CHARS)
      const material = collectReviewDocumentMaterial(editor)
      const sharedUser = `Review target: ${profile.labelEn}\n\nDOCUMENT (restricted HTML; formulas use <formula>LaTeX</formula>):\n${documentHtml}\n\nFORMULA / TABLE / IMAGE / CHART / SHAPE CATALOG:\n${material.objectCatalog}\n\n${truncated ? '[The document text was truncated at the review safety limit; explicitly state this limitation.]' : ''}${material.omittedImageCount ? `\n[${material.omittedImageCount} additional visual attachment(s) were omitted because of size limits; explicitly state this limitation.]` : ''}`

      const results = await Promise.all(
        profile.members.map(async (member, index): Promise<MemberResult> => {
          setMembers((current) =>
            current.map((item, i) => (i === index ? { ...item, status: 'running' } : item)),
          )
          let result: MemberResult
          try {
            const response = await window.desktop.aiChat({
              settings: settingsForReviewModel(settings, assignments[index]!),
              system: reviewerSystemPrompt(profile, member, language),
              user: sharedUser,
              images: material.images,
            })
            result = response.ok
              ? { ...initial[index]!, status: 'done', content: response.content ?? '' }
              : {
                  ...initial[index]!,
                  status: 'error',
                  error: response.error ?? 'Unknown error',
                }
          } catch (error) {
            result = {
              ...initial[index]!,
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            }
          }
          if (runRef.current === runId) {
            setMembers((current) => current.map((item, i) => (i === index ? result : item)))
          }
          return result
        }),
      )
      if (runRef.current !== runId) return
      const successful = results.filter((result) => result.status === 'done' && result.content)
      if (successful.length === 0) return
      const chairModel = assignments.at(-1)!
      const chairRole = language === 'zh' || language === 'zh-TW' ? '委员会主席' : 'Committee Chair'
      setChair({ role: chairRole, model: chairModel, status: 'running' })
      try {
        const chairResponse = await window.desktop.aiChat({
          settings: settingsForReviewModel(settings, chairModel),
          system: chairSystemPrompt(profile, language),
          user:
            `Independent reviews for ${profile.labelEn}:\n\n` +
            successful
              .map((result, index) => `## Reviewer ${index + 1}: ${result.role}\n${result.content}`)
              .join('\n\n'),
        })
        if (runRef.current !== runId) return
        setChair(
          chairResponse.ok
            ? {
                role: chairRole,
                model: chairModel,
                status: 'done',
                content: chairResponse.content ?? '',
              }
            : {
                role: chairRole,
                model: chairModel,
                status: 'error',
                error: chairResponse.error ?? 'Unknown error',
              },
        )
      } catch (error) {
        if (runRef.current === runId) {
          setChair({
            role: chairRole,
            model: chairModel,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } finally {
      if (runRef.current === runId) setRunning(false)
    }
  }

  const copyReport = async () => {
    const text = [
      chair?.content ? `# ${chair.role}\n${chair.content}` : '',
      ...members.map((member) =>
        member.content ? `# ${member.role} (${member.model})\n${member.content}` : '',
      ),
    ]
      .filter(Boolean)
      .join('\n\n')
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <div
      className="modal-backdrop ai-review-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}
    >
      <div className="modal ai-review-modal">
        <div className="ai-review-header">
          <div>
            <h2>{chineseUi ? 'AI 审稿委员会' : 'AI Review Committee'}</h2>
            <p>
              {chineseUi
                ? '3 名独立委员 + 1 名委员会主席，模型随机分配，全部通过 ZenMux。AI 功能依赖网络，连接或代理状态可能影响速度与结果。'
                : '3 independent reviewers + 1 committee chair, randomly assigned models, all through ZenMux. AI depends on network access; connection or proxy conditions may affect speed and results.'}
            </p>
          </div>
          <button className="ai-review-close" disabled={running} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="ai-review-options">
          <label>
            {chineseUi ? '审稿类型' : 'Review type'}
            <select
              value={profileId}
              disabled={running}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {REVIEW_PROFILES.map((item) => (
                <option key={item.id} value={item.id}>
                  {chineseUi ? item.labelZh : item.labelEn}
                </option>
              ))}
            </select>
          </label>
          <label>
            {chineseUi ? '意见语言' : 'Report language'}
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
          <button
            className="btn-primary"
            disabled={running || !hasKey}
            onClick={() => void start()}
          >
            {running
              ? chineseUi
                ? '委员会审阅中…'
                : 'Committee reviewing…'
              : chineseUi
                ? '开始严格审稿'
                : 'Start strict review'}
          </button>
          {(chair?.content || members.some((member) => member.content)) && (
            <button className="btn-ghost" onClick={() => void copyReport()}>
              {copied
                ? chineseUi
                  ? '已复制'
                  : 'Copied'
                : chineseUi
                  ? '复制完整报告'
                  : 'Copy full report'}
            </button>
          )}
        </div>
        {!hasKey && (
          <div className="ai-review-warning">
            {chineseUi
              ? '请先在设置中配置 ZenMux API Key。'
              : 'Configure a ZenMux API key in Settings first.'}
          </div>
        )}
        <div className="ai-review-results">
          {chair && <ReviewCard member={chair} featured />}
          {members.map((member, index) => (
            <ReviewCard key={`${member.role}-${index}`} member={member} />
          ))}
          {!chair && members.length === 0 && (
            <div className="ai-review-empty">
              {chineseUi
                ? '委员将审阅正文、LaTeX/OMML 公式、表格，以及可读取的图片、图表和图形。'
                : 'Reviewers inspect text, LaTeX/OMML equations, tables, and available images, charts, and shapes.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewCard({ member, featured = false }: { member: MemberResult; featured?: boolean }) {
  return (
    <section className={`ai-review-card${featured ? ' featured' : ''}`}>
      <header>
        <strong>{member.role}</strong>
        <span>{member.model}</span>
        <em className={`status-${member.status}`}>{member.status}</em>
      </header>
      {member.content && <Markdown text={member.content} />}
      {member.error && <div className="ai-review-error">{member.error}</div>}
    </section>
  )
}
