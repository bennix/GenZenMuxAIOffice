import { useEffect, useRef, useState } from 'react'
import {
  searchPromptSources,
  suggestPromptDetails,
  type PromptSuggestion,
  type ResearchField,
  type ResearchSource,
} from '../services/promptResearch'
import { useSettings } from '../store/settingsStore'

export default function PromptResearchPanel({
  brief,
  template,
  fields,
  values,
  constraints,
  onAccept,
  onSource,
  onApplySources,
  appliedUrls = [],
}: {
  brief: string
  template: string
  fields: ResearchField[]
  values: Record<string, string>
  constraints: string
  onAccept: (suggestion: PromptSuggestion, sources: ResearchSource[]) => void
  onSource: (source: ResearchSource) => void
  onApplySources?: (sources: ResearchSource[]) => void
  appliedUrls?: string[]
}) {
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [recentNews, setRecentNews] = useState(false)
  const [sources, setSources] = useState<ResearchSource[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])
  const [pending, setPending] = useState<'search' | 'ai' | null>(null)
  const [status, setStatus] = useState('')
  const controller = useRef<AbortController | undefined>(undefined)
  const adopting = useRef(false)
  const apiKey = useSettings((s) => s.apiKey)
  const chatModel = useSettings((s) => s.defaultModel('chat'))
  const context = JSON.stringify({
    brief,
    template,
    values,
    constraints,
    query,
    language,
    recentNews,
  })
  useEffect(() => {
    controller.current?.abort()
    setPending(null)
    if (!adopting.current) setSuggestions([])
    adopting.current = false
    setStatus('')
    return () => controller.current?.abort()
  }, [context])
  useEffect(() => {
    setSources([])
    setSelected([])
  }, [query, language, recentNews, brief, template])
  const begin = (kind: 'search' | 'ai') => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setPending(kind)
    setStatus('')
    setSuggestions([])
    return next
  }
  const search = async () => {
    const request = begin('search')
    setSources([])
    setSelected([])
    try {
      const result = await searchPromptSources(query || brief, language, request.signal, recentNews)
      if (request.signal.aborted) return
      setSources(result.sources)
      setSelected(result.sources.map((source) => source.id))
      setStatus(
        [
          result.sources.length
            ? `本次检索 ${new Date().toLocaleTimeString()}：找到 ${result.sources.length} 条公开资料，可勾选后补全。`
            : '没有找到资料，请尝试更短的主题词或切换语言。',
          ...result.warnings,
        ].join(' '),
      )
    } catch (error) {
      if (!request.signal.aborted)
        setStatus(error instanceof Error ? error.message : '检索失败，请重试。')
    } finally {
      if (!request.signal.aborted) setPending(null)
    }
  }
  const propose = async () => {
    const request = begin('ai')
    const timer = setTimeout(() => {
      if (request.signal.aborted) return
      request.abort()
      setPending(null)
      setStatus('AI 补全超时，请重试。')
    }, 45000)
    try {
      const result = await suggestPromptDetails(
        {
          brief,
          template,
          fields,
          values,
          constraints,
          sources: sources.filter((source) => selected.includes(source.id)),
        },
        request.signal,
      )
      if (request.signal.aborted) return
      setSuggestions(result)
      setStatus(
        result.length
          ? '建议不会自动写入，可逐条采用。'
          : '没有足够依据补充，请调整关键词或继续手动填写。',
      )
    } catch (error) {
      if (!request.signal.aborted)
        setStatus(error instanceof Error ? error.message : '补全失败，请重试。')
    } finally {
      clearTimeout(timer)
      if (!request.signal.aborted) setPending(null)
    }
  }
  return (
    <details className="wizard-research">
      <summary>✦ 联网补充灵感与空白项</summary>
      <p className="muted">
        免费检索 DuckDuckGo 即时答案、Wikipedia、Open Library；可加入近 7
        天资讯。只发送检索词，搜索不需要 API Key。
      </p>
      <label>
        检索关键词
        <input
          maxLength={120}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={brief.slice(0, 120) || '例如：咖啡文化、Art Deco、宋代建筑'}
        />
      </label>
      <div className="wizard-actions">
        <label>
          百科语言
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'zh' | 'en')}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <button disabled={Boolean(pending) || !(query || brief).trim()} onClick={search}>
          {pending === 'search' ? '正在检索…' : '免费检索公开资料'}
        </button>
      </div>
      <label style={{ display: 'flex' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={recentNews}
          onChange={(event) => setRecentNews(event.target.checked)}
        />
        加入近期资讯（GDELT，近7天，建议使用英文关键词）
      </label>
      <p className="muted">
        即时答案不包含完整网页搜索结果。
        <a
          href={`https://duckduckgo.com/?q=${encodeURIComponent((query || brief).trim().slice(0, 120))}`}
          target="_blank"
          rel="noreferrer"
        >
          打开 DuckDuckGo 网页搜索 ↗
        </a>
      </p>
      {status && <p role="status">{status}</p>}
      {!!sources.length && onApplySources && (
        <div className="wizard-research-apply">
          <div>
            <strong>把搜索结果写入提示词</strong>
            <p>勾选相关资料，应用后查看新增内容，再确认发送到主页。</p>
          </div>
          <button
            className="btn-accent"
            disabled={Boolean(pending) || !selected.length || !brief.trim()}
            onClick={() => onApplySources(sources.filter((source) => selected.includes(source.id)))}
          >
            应用选中 {selected.length} 条资料到提示词 →
          </button>
        </div>
      )}
      <div className="wizard-research-results">
        {sources.map((source) => (
          <article key={source.id}>
            <label style={{ display: 'flex' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={selected.includes(source.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, source.id]
                      : current.filter((id) => id !== source.id),
                  )
                  setSuggestions([])
                  controller.current?.abort()
                  setPending(null)
                }}
              />
              {source.title}
            </label>
            <p>{source.summary}</p>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.provider} · 查看来源 ↗
            </a>
            <button
              disabled={appliedUrls.includes(source.url) || !brief.trim()}
              onClick={() => onSource(source)}
            >
              {appliedUrls.includes(source.url) ? '✓ 已应用' : '应用这条到提示词'}
            </button>
          </article>
        ))}
      </div>
      {!!sources.length && (
        <>
          <p className="muted">
            AI 补全使用 {chatModel?.name ?? '当前对话模型'}，按模型计费；只建议空白项和遗漏细节。
            {!apiKey && '配置 API Key 后可启用，当前仍可手动加入资料。'}
          </p>
          <button
            className="chip"
            disabled={
              Boolean(pending) || !apiKey || !chatModel || !selected.length || !brief.trim()
            }
            onClick={propose}
          >
            {pending === 'ai' ? '正在整理建议…' : 'AI 建议空白项与遗漏细节'}
          </button>
        </>
      )}
      {suggestions.map((suggestion, index) => (
        <article key={`${suggestion.fieldKey}-${index}`} className="wizard-suggestion">
          <strong>
            {suggestion.fieldKey === '_idea'
              ? '额外灵感'
              : fields.find((field) => field.key === suggestion.fieldKey)?.label}{' '}
            · {suggestion.kind === 'creative' ? '设计建议' : '资料依据'}
          </strong>
          <p>{suggestion.value}</p>
          <p className="muted">{suggestion.reason}</p>
          {suggestion.sourceIds.map((id) => {
            const source = sources.find((item) => item.id === id)
            return (
              source && (
                <a key={id} href={source.url} target="_blank" rel="noreferrer">
                  {source.title} ↗{' '}
                </a>
              )
            )
          })}
          <button
            disabled={
              suggestion.fieldKey !== '_idea' && Boolean(values[suggestion.fieldKey]?.trim())
            }
            onClick={() => {
              adopting.current = true
              onAccept(
                suggestion,
                sources.filter((source) => suggestion.sourceIds.includes(source.id)),
              )
              setSuggestions((current) => current.filter((_, i) => i !== index))
            }}
          >
            采用建议
          </button>
        </article>
      ))}
    </details>
  )
}
