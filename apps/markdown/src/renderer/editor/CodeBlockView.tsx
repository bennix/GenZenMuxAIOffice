import { useEffect, useId, useState } from 'react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { t } from '../i18n/locale'
import { generateMermaidWithZenMux } from '../mermaid-ai'
import { InfographicPreview } from '@genoffice/ui'
import {
  PRETTY_MERMAID_THEMES,
  readPrettyTheme,
  sourceForMermaidRender,
  writePrettyTheme,
} from '../mermaid-themes'

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
  'infographic',
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

export function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [diagram, setDiagram] = useState('')
  const [renderError, setRenderError] = useState('')
  const [aiEditing, setAiEditing] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const language = String(node.attrs.language ?? '') || 'plaintext'
  const isMermaid = language === 'mermaid'
  const isInfographic = language === 'infographic'
  const isVisual = isMermaid || isInfographic

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
        const result = await mermaid.render(
          `md-mermaid-${renderId}`,
          sourceForMermaidRender(node.textContent),
        )
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

  const modifyWithAi = async () => {
    if (!aiPrompt.trim() || aiBusy) return
    setAiBusy(true)
    setAiError('')
    try {
      const source = await generateMermaidWithZenMux({
        instruction: aiPrompt.trim(),
        currentSource: node.textContent,
      })
      const pos = typeof getPos === 'function' ? getPos() : undefined
      if (typeof pos !== 'number') throw new Error('Mermaid 图形位置已变化，请重试')
      const replacement = node.type.create(node.attrs, editor.schema.text(source))
      editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, replacement))
      setAiPrompt('')
      setAiEditing(false)
      setEditing(false)
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <NodeViewWrapper className={`md-codeblock${isVisual ? ' md-mermaid-block' : ''}`}>
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
          <select
            className="md-codeblock-lang"
            aria-label={navigator.language.startsWith('zh') ? 'Mermaid 主题' : 'Mermaid theme'}
            value={readPrettyTheme(node.textContent)}
            disabled={!editor.isEditable}
            onChange={(event) => {
              const pos = typeof getPos === 'function' ? getPos() : undefined
              if (typeof pos !== 'number') return
              const next = writePrettyTheme(node.textContent, event.target.value)
              const replacement = node.type.create(node.attrs, editor.schema.text(next))
              editor.view.dispatch(
                editor.state.tr.replaceWith(pos, pos + node.nodeSize, replacement),
              )
            }}
          >
            {PRETTY_MERMAID_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        )}
        {isVisual && (
          <button
            type="button"
            className="md-codeblock-copy md-mermaid-ai-button"
            disabled={!editor.isEditable || aiBusy}
            onClick={() => {
              setAiEditing((value) => !value)
              setAiError('')
            }}
          >
            {navigator.language.startsWith('zh') ? 'AI 修改' : 'AI Modify'}
          </button>
        )}
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
      {isMermaid && aiEditing && (
        <div className="md-mermaid-inline-ai" contentEditable={false}>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder={
              navigator.language.startsWith('zh')
                ? '描述需要修改的节点、关系、样式或布局…'
                : 'Describe changes to nodes, relationships, style, or layout…'
            }
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void modifyWithAi()
            }}
          />
          <div className="md-mermaid-ai-row">
            <span>
              {navigator.language.startsWith('zh')
                ? '通过 ZenMux 处理；结果仍是可编辑 Mermaid 源码。'
                : 'Processed through ZenMux; the result remains editable Mermaid source.'}
            </span>
            <button type="button" onClick={() => setAiEditing(false)} disabled={aiBusy}>
              {navigator.language.startsWith('zh') ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!aiPrompt.trim() || aiBusy}
              onClick={() => void modifyWithAi()}
            >
              {aiBusy
                ? navigator.language.startsWith('zh')
                  ? '修改中…'
                  : 'Modifying…'
                : navigator.language.startsWith('zh')
                  ? '应用 AI 修改'
                  : 'Apply AI changes'}
            </button>
          </div>
          {aiError ? <div className="md-mermaid-error">{aiError}</div> : null}
        </div>
      )}
      {isInfographic && !editing && (
        <div
          className="md-mermaid-preview"
          contentEditable={false}
          onDoubleClick={() => editor.isEditable && setEditing(true)}
        >
          <InfographicPreview syntax={node.textContent} className="md-infographic-preview" />
        </div>
      )}
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
      <pre style={isVisual && !editing ? { display: 'none' } : undefined}>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  )
}
