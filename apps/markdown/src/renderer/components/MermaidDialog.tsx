import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { EDITORIAL_DIAGRAM_TYPES } from '../diagram-design'
import { generateMermaidWithZenMux, type MermaidStudioMode } from '../mermaid-ai'
import {
  DEFAULT_PRETTY_THEME,
  PRETTY_MERMAID_THEMES,
  PRETTY_MERMAID_TYPES,
  readPrettyTheme,
  sourceForMermaidRender,
  writePrettyTheme,
} from '../mermaid-themes'
import { WechatExportPanel } from './WechatExportDialog'
import { useI18n } from '../i18n/locale'

type StudioTab = MermaidStudioMode | 'wechat'

export function MermaidDialog({
  editor,
  onClose,
  initialTab = 'pretty',
}: {
  editor: Editor
  onClose: () => void
  initialTab?: StudioTab
}) {
  const { lang } = useI18n()
  const [tab, setTab] = useState<StudioTab>(initialTab)
  const [themeId, setThemeId] = useState(DEFAULT_PRETTY_THEME)
  const [source, setSource] = useState(() =>
    writePrettyTheme(PRETTY_MERMAID_TYPES[0]!.source, DEFAULT_PRETTY_THEME),
  )
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void import('mermaid').then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
        })
        try {
          const result = await mermaid.render(
            `md-mermaid-dialog-${Date.now()}`,
            sourceForMermaidRender(source),
          )
          if (!cancelled) {
            setSvg(result.svg)
            setError('')
          }
        } catch (reason) {
          if (!cancelled) {
            setSvg('')
            setError(reason instanceof Error ? reason.message : String(reason))
          }
        }
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [source])

  const chinese = lang === 'zh' || lang === 'zh-TW'
  const applyTheme = (next: string) => {
    setThemeId(next)
    setSource((current) => writePrettyTheme(current, next))
  }
  const applyType = (starter: string, nextTheme = themeId) => {
    setSource(writePrettyTheme(starter, nextTheme))
  }
  const runAi = async (kind: 'generate' | 'modify') => {
    if (!aiPrompt.trim() || aiBusy) return
    setAiBusy(true)
    setAiError('')
    try {
      setSource(
        await generateMermaidWithZenMux({
          instruction: aiPrompt.trim(),
          currentSource: kind === 'modify' ? source.trim() || undefined : undefined,
          mode: tab === 'editorial' ? 'editorial' : 'pretty',
          themeId: tab === 'editorial' ? 'editorial' : themeId,
        }),
      )
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div
      className="md-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="md-equation-dialog md-mermaid-dialog">
        <h2>{chinese ? '图表与排版' : 'Diagrams and typesetting'}</h2>
        <div className="md-studio-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pretty'}
            className={tab === 'pretty' ? 'active' : ''}
            onClick={() => {
              setTab('pretty')
              applyTheme(readPrettyTheme(source) === 'editorial' ? DEFAULT_PRETTY_THEME : themeId)
            }}
          >
            <strong>Pretty Mermaid</strong>
            <span>{chinese ? '15 主题 · 6 类型' : '15 themes · 6 types'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'editorial'}
            className={tab === 'editorial' ? 'active' : ''}
            onClick={() => {
              setTab('editorial')
              applyTheme('editorial')
            }}
          >
            <strong>{chinese ? '编辑级图表' : 'Editorial'}</strong>
            <span>Diagram Design</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'wechat'}
            className={tab === 'wechat' ? 'active' : ''}
            onClick={() => setTab('wechat')}
          >
            <strong>{chinese ? '公众号排版' : 'WeChat'}</strong>
            <span>Mars Editor</span>
          </button>
        </div>
        {tab === 'wechat' ? (
          <WechatExportPanel editorRoot={editor.view.dom} onClose={onClose} embedded />
        ) : (
          <>
            <p className="md-mermaid-mode-hint">
              {tab === 'pretty'
                ? chinese
                  ? 'Pretty Mermaid：选类型与主题，源码仍是标准 Mermaid。'
                  : 'Pretty Mermaid: pick a type and theme. Source stays standard Mermaid.'
                : chinese
                  ? 'Diagram Design：选编辑级类型，克制密度，焦点色只给 1–2 个节点。'
                  : 'Diagram Design: editorial types, sparse density, accent on 1–2 nodes.'}
            </p>
            {tab === 'pretty' ? (
              <>
                <div className="md-mermaid-chips">
                  {PRETTY_MERMAID_TYPES.map((item) => (
                    <button key={item.id} type="button" onClick={() => applyType(item.source)}>
                      {chinese ? item.labelZh : item.labelEn}
                    </button>
                  ))}
                </div>
                <label>
                  {chinese ? '主题' : 'Theme'}
                  <select value={themeId} onChange={(event) => applyTheme(event.target.value)}>
                    {PRETTY_MERMAID_THEMES.filter((theme) => theme.id !== 'editorial').map(
                      (theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </>
            ) : (
              <div className="md-mermaid-chips md-mermaid-chips-wrap">
                {EDITORIAL_DIAGRAM_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={chinese ? item.hintZh : item.hintEn}
                    onClick={() => applyType(item.source, 'editorial')}
                  >
                    {chinese ? item.labelZh : item.labelEn}
                  </button>
                ))}
              </div>
            )}
            <div className="md-mermaid-ai-box">
              <label>
                {chinese ? '用自然语言让 AI 生成或修改' : 'Generate or modify with AI'}
                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder={
                    tab === 'editorial'
                      ? chinese
                        ? '例如：画一个从需求到发布的架构，只保留四个节点'
                        : 'For example: architecture from request to release, four nodes only'
                      : chinese
                        ? '例如：生成一个包含需求分析、开发、测试和发布的流程图'
                        : 'For example: create a release workflow with a failure branch'
                  }
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
                      void runAi('generate')
                  }}
                />
              </label>
              <div className="md-mermaid-ai-row">
                <span>
                  {chinese
                    ? '全部通过当前 AI 网关；结果仍是可编辑 Mermaid 源码。'
                    : 'Uses the current AI gateway; the result remains editable Mermaid source.'}
                </span>
                <button
                  type="button"
                  disabled={!aiPrompt.trim() || aiBusy}
                  onClick={() => void runAi('generate')}
                >
                  {aiBusy
                    ? chinese
                      ? 'AI 处理中…'
                      : 'Working…'
                    : chinese
                      ? 'AI 生成'
                      : 'AI Generate'}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!aiPrompt.trim() || !source.trim() || aiBusy}
                  onClick={() => void runAi('modify')}
                >
                  {chinese ? 'AI 修改当前源码' : 'AI Modify Source'}
                </button>
              </div>
              {aiError ? <div className="md-mermaid-error">{aiError}</div> : null}
            </div>
            <label>
              {chinese ? 'Mermaid 源码' : 'Mermaid source'}
              <textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="md-mermaid-preview">
              {error ? (
                <div className="md-mermaid-error">{error}</div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: svg }} />
              )}
            </div>
            <div className="md-modal-actions">
              <button type="button" onClick={onClose}>
                {chinese ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!source.trim() || !!error || aiBusy}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: 'codeBlock',
                      attrs: { language: 'mermaid' },
                      content: [{ type: 'text', text: source }],
                    })
                    .run()
                  onClose()
                }}
              >
                {chinese ? '插入图形' : 'Insert diagram'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
