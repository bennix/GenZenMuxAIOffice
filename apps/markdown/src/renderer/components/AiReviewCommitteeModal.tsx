import { useMemo, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Markdown } from '@genoffice/ui'
import {
  REVIEW_PROFILES,
  assignReviewModels,
  availableReviewModels,
  chairSystemPrompt,
  reviewerSystemPrompt,
  settingsForReviewModel,
  type AiSettings,
  type ReviewLanguage,
} from '@genoffice/ai-provider'

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
  onClose,
}: {
  editor: Editor
  onClose: () => void
}) {
  const chinese = navigator.language.startsWith('zh')
  const [profileId, setProfileId] = useState('science')
  const [language, setLanguage] = useState<ReviewLanguage>('zh')
  const [members, setMembers] = useState<Result[]>([])
  const [chair, setChair] = useState<Result | null>(null)
  const [running, setRunning] = useState(false)
  const [keyMissing, setKeyMissing] = useState(false)
  const runRef = useRef(0)
  const profile = useMemo(
    () => REVIEW_PROFILES.find((p) => p.id === profileId) ?? REVIEW_PROFILES[0]!,
    [profileId],
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
    const runId = ++runRef.current
    const assignments = assignReviewModels(
      availableReviewModels(settings),
      profile.members.length + 1,
    )
    const initial = profile.members.map((member, i) => ({
      role: language === 'zh' ? member.roleZh : member.roleEn,
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
              user: `${selected ? 'SELECTED MARKDOWN' : 'MARKDOWN DOCUMENT'}:\n\n${material}${limit}`,
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
      const role = language === 'zh' ? '委员会主席' : 'Committee Chair'
      setChair({ role, model, status: 'running' })
      const response = await window.markdownApi.aiChat({
        settings: settingsForReviewModel(settings, model),
        system: chairSystemPrompt(profile, language),
        user: successful
          .map((r, i) => `## Reviewer ${i + 1}: ${r.role}\n${r.content}`)
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
            <h2>{chinese ? 'AI 审稿委员会' : 'AI Review Committee'}</h2>
            <p>
              {chinese
                ? '3 名独立委员 + 1 名主席；模型随机分配，全部通过 ZenMux。AI 功能可能受网络或代理状态影响。'
                : '3 independent reviewers + 1 chair; models are randomly assigned, all through ZenMux. Network or proxy conditions may affect AI.'}
            </p>
          </div>
          <button disabled={running} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="md-review-options">
          <label>
            {chinese ? '审稿类型' : 'Review type'}
            <select
              value={profileId}
              disabled={running}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {REVIEW_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {chinese ? p.labelZh : p.labelEn}
                </option>
              ))}
            </select>
          </label>
          <label>
            {chinese ? '意见语言' : 'Language'}
            <select
              value={language}
              disabled={running}
              onChange={(e) => setLanguage(e.target.value as ReviewLanguage)}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <button className="btn-primary" disabled={running} onClick={() => void start()}>
            {running
              ? chinese
                ? '审阅中…'
                : 'Reviewing…'
              : chinese
                ? '开始严格审稿'
                : 'Start strict review'}
          </button>
          {report && (
            <button onClick={() => void navigator.clipboard.writeText(report)}>
              {chinese ? '复制完整报告' : 'Copy report'}
            </button>
          )}
        </div>
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
