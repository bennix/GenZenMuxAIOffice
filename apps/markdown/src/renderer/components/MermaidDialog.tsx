import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { generateMermaidWithZenMux } from '../mermaid-ai'

const SAMPLE = `flowchart TD
  A[开始] --> B{条件}
  B -->|是| C[处理]
  B -->|否| D[结束]`

export function MermaidDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [source, setSource] = useState(SAMPLE)
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
          const result = await mermaid.render(`md-mermaid-dialog-${Date.now()}`, source)
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

  const chinese = navigator.language.startsWith('zh')
  const runAi = async (mode: 'generate' | 'modify') => {
    if (!aiPrompt.trim() || aiBusy) return
    setAiBusy(true)
    setAiError('')
    try {
      setSource(
        await generateMermaidWithZenMux({
          instruction: aiPrompt.trim(),
          currentSource: mode === 'modify' ? source.trim() || undefined : undefined,
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
        <h2>{chinese ? '插入 Mermaid 图形' : 'Insert Mermaid diagram'}</h2>
        <div className="md-mermaid-ai-box">
          <label>
            {chinese ? '用自然语言让 AI 生成或修改' : 'Generate or modify with AI'}
            <textarea
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder={
                chinese
                  ? '例如：生成一个包含需求分析、开发、测试和发布的流程图；将判断节点改为菱形并增加失败分支'
                  : 'For example: create a release workflow; add a failure branch to the decision node'
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
                ? '全部通过 ZenMux；AI 功能可能受网络或代理状态影响。'
                : 'Powered by ZenMux; network or proxy conditions may affect AI.'}
            </span>
            <button type="button" disabled={!aiPrompt.trim() || aiBusy} onClick={() => void runAi('generate')}>
              {aiBusy
                ? chinese
                  ? 'AI 处理中…'
                  : 'Working…'
                : chinese
                  ? 'AI 生成'
                  : 'AI Generate'}
            </button>
            <button type="button" className="btn-primary" disabled={!aiPrompt.trim() || !source.trim() || aiBusy} onClick={() => void runAi('modify')}>
              {chinese ? 'AI 修改当前源码' : 'AI Modify Source'}
            </button>
          </div>
          {aiError ? <div className="md-mermaid-error">{aiError}</div> : null}
        </div>
        <label>
          {chinese ? 'Mermaid 源码' : 'Mermaid source'}
          <textarea value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} />
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
      </div>
    </div>
  )
}
