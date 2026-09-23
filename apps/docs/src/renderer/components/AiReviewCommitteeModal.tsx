import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Markdown, ReviewRoleModels } from '@genoffice/ui'
import { LANGUAGE_OPTIONS } from '@genoffice/i18n'
import { parseNoveltyQueries, searchNoveltyEvidence } from '@genoffice/citations'
import {
  REVIEW_PROFILES,
  availableReviewModels,
  runDocumentReview,
  supportsLiteratureReview,
  type ReviewLanguage,
} from '@genoffice/ai-provider'
import type { AiSettings } from '../../shared/ipc'
import { serializeRangeToHtml } from '../ai/protocol'
import { collectReviewDocumentMaterial } from '../ai-review-committee'
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
  mode = 'review',
  onClose,
}: {
  editor: Editor
  settings: AiSettings
  mode?: 'review' | 'composition'
  onClose: () => void
}) {
  const { lang } = useI18n()
  const chineseUi = lang === 'zh' || lang === 'zh-TW'
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
  const [language, setLanguage] = useState<ReviewLanguage>(lang)
  const [members, setMembers] = useState<MemberResult[]>([])
  const [chair, setChair] = useState<MemberResult | null>(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [literatureEnabled, setLiteratureEnabled] = useState(true)
  const [literatureStatus, setLiteratureStatus] = useState('')
  const defaultModel = settings.providers.zenmux.model
  const modelSuggestions = useMemo(() => availableReviewModels(settings), [settings])
  const [roleModels, setRoleModels] = useState<string[]>(() => Array(4).fill(defaultModel))
  const profile = profileOptions.find((item) => item.id === profileId) ?? profileOptions[0]!
  const roleLabels = [
    ...profile.members.map((member) => (chineseUi ? member.roleZh : member.roleEn)),
    chineseUi ? '委员会主席' : 'Committee Chair',
  ]
  useEffect(() => {
    const count = profile.members.length + 1
    setRoleModels((current) => {
      const next = Array.from({ length: count }, (_, index) => current[index]?.trim() || defaultModel)
      if (next.length === current.length && next.every((model, index) => model === current[index]))
        return current
      return next
    })
  }, [profile, defaultModel])
  const hasKey = !!settings.providers.zenmux.apiKey
  useEffect(() => {
    setMembers([])
    setChair(null)
    setCopied(false)
    setLiteratureStatus('')
  }, [profileId, language, literatureEnabled])

  const start = async () => {
    if (!hasKey || running) return
    setRunning(true)
    setCopied(false)
    setMembers([])
    setChair(null)
    setLiteratureStatus('')
    try {
      const html = editor.state.doc.childCount
        ? serializeRangeToHtml(editor, 0, editor.state.doc.childCount - 1)
        : ''
      const material = collectReviewDocumentMaterial(editor)
      const text =
        html.slice(0, MAX_DOCUMENT_CHARS) +
        '\nOBJECT CATALOG:\n' +
        material.objectCatalog +
        (html.length > MAX_DOCUMENT_CHARS
          ? '\n[Document truncated; disclose this limitation.]'
          : '') +
        (material.omittedImageCount ? '\n[Some images omitted; disclose this limitation.]' : '')
      await runDocumentReview({
        settings,
        profileId,
        language,
        text,
        images: material.images,
        literature: literatureEnabled,
        roleModels,
        chat: (request) => window.desktop.aiChat(request),
        searchEvidence: async (raw, fallback) =>
          (await searchNoveltyEvidence(parseNoveltyQueries(raw, fallback))).evidence,
        onMember: (index, result) =>
          setMembers((current) => {
            const next = [...current]
            next[index] = result
            return next
          }),
        onChair: setChair,
        onLiterature: setLiteratureStatus,
      })
    } catch (error) {
      setLiteratureStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
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
      <div
        className="modal ai-review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI 审稿工作台"
      >
        <div className="ai-review-header">
          <div>
            <h2>
              {mode === 'composition'
                ? chineseUi
                  ? '作文评价与润色'
                  : 'Essay Assessment & Polishing'
                : chineseUi
                  ? 'AI 审稿委员会'
                  : 'AI Review Committee'}
            </h2>
            <p>
              {chineseUi
                ? mode === 'composition'
                  ? '3 名分项评委 + 1 名主席，按考试或竞赛标准评分、定位问题并生成保留原意的完整润色稿。全部通过 ZenMux。'
                  : '3 名独立委员 + 1 名委员会主席，可为每个角色指定 ZenMux 模型名。学术类可检索真实文献核验创新性。网络可能影响结果。'
                : '3 independent reviewers + 1 chair. Name a ZenMux model for each role. Network or proxy conditions may affect AI.'}
            </p>
          </div>
          <button
            className="ai-review-close"
            aria-label={chineseUi ? '关闭' : 'Close'}
            disabled={running}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="ai-review-options">
          <p>
            {chineseUi
              ? '确认当前文档 → 选择审稿标准 → 审阅报告。不会自动改写正文。'
              : 'Confirm document → choose criteria → review report. The source is not rewritten automatically.'}
          </p>
          <label>
            {chineseUi
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
              {profileOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {chineseUi ? item.labelZh : item.labelEn}
                </option>
              ))}
            </select>
          </label>
          {mode === 'review' && supportsLiteratureReview(profile) && (
            <label className="ai-review-literature-toggle">
              <input
                type="checkbox"
                checked={literatureEnabled}
                disabled={running}
                onChange={(event) => setLiteratureEnabled(event.target.checked)}
              />
              <span>{chineseUi ? '文献核验创新性' : 'Verify novelty with literature'}</span>
            </label>
          )}
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
          <ReviewRoleModels
            label={chineseUi ? '各角色模型' : 'Model for each role'}
            roles={roleLabels}
            values={roleModels}
            suggestions={modelSuggestions}
            disabled={running}
            onChange={(index, value) =>
              setRoleModels((current) => current.map((item, i) => (i === index ? value : item)))
            }
          />
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
                ? mode === 'composition'
                  ? '开始评价与润色'
                  : '开始严格审稿'
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
        {literatureStatus && <div className="ai-review-literature-status">{literatureStatus}</div>}
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
