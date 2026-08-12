import { useEffect, useId, useState } from 'react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { t } from '../i18n/locale'

const LANGUAGES = [
  'plaintext',
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'markdown',
  'mermaid',
  'objectivec',
  'php',
  'python',
  'r',
  'ruby',
  'rust',
  'scala',
  'scss',
  'sql',
  'swift',
  'typescript',
  'xml',
  'yaml',
]

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [diagram, setDiagram] = useState('')
  const [renderError, setRenderError] = useState('')
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const language = String(node.attrs.language ?? '') || 'plaintext'
  const isMermaid = language === 'mermaid'

  useEffect(() => {
    if (!isMermaid || editing || !node.textContent.trim()) return
    let cancelled = false
    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
      })
      try {
        const result = await mermaid.render(`md-mermaid-${renderId}`, node.textContent)
        if (!cancelled) {
          setDiagram(result.svg)
          setRenderError('')
        }
      } catch (error) {
        if (!cancelled) {
          setDiagram('')
          setRenderError(error instanceof Error ? error.message : String(error))
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [editing, isMermaid, node.textContent, renderId])

  const copy = () => {
    void navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <NodeViewWrapper className={`md-codeblock${isMermaid ? ' md-mermaid-block' : ''}`}>
      <div className="md-codeblock-bar" contentEditable={false}>
        <select
          className="md-codeblock-lang"
          value={LANGUAGES.includes(language) ? language : 'plaintext'}
          disabled={!editor.isEditable}
          onChange={(e) =>
            updateAttributes({ language: e.target.value === 'plaintext' ? null : e.target.value })
          }
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button type="button" className="md-codeblock-copy" onClick={copy}>
          {copied ? t('codeCopied') : t('codeCopy')}
        </button>
        {isMermaid && (
          <button
            type="button"
            className="md-codeblock-copy"
            onClick={() => setEditing((value) => !value)}
          >
            {editing
              ? navigator.language.startsWith('zh')
                ? '预览'
                : 'Preview'
              : navigator.language.startsWith('zh')
                ? '编辑'
                : 'Edit'}
          </button>
        )}
      </div>
      {isMermaid && !editing && (
        <div
          className="md-mermaid-preview"
          contentEditable={false}
          onDoubleClick={() => editor.isEditable && setEditing(true)}
        >
          {renderError ? <div className="md-mermaid-error">{renderError}</div> : null}
          {!renderError && diagram ? <div dangerouslySetInnerHTML={{ __html: diagram }} /> : null}
          {!renderError && !diagram ? <div className="md-mermaid-empty">Mermaid</div> : null}
        </div>
      )}
      <pre style={isMermaid && !editing ? { display: 'none' } : undefined}>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  )
}
