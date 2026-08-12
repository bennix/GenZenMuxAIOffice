import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'

const SAMPLE = `flowchart TD
  A[开始] --> B{条件}
  B -->|是| C[处理]
  B -->|否| D[结束]`

export function MermaidDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [source, setSource] = useState(SAMPLE)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

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
  return (
    <div
      className="md-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="md-equation-dialog md-mermaid-dialog">
        <h2>{chinese ? '插入 Mermaid 图形' : 'Insert Mermaid diagram'}</h2>
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
            disabled={!source.trim() || !!error}
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
