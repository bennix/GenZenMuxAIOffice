import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { latexToOmml, ommlToMathML } from '@genoffice/docx-engine'
import { cleanRecognizedLatex, formulaRecognitionRequest } from '@genoffice/ai-provider'
import { FormulaImageRecognition, type FormulaImageData } from '@genoffice/ui'

export interface MarkdownEquationTarget {
  pos: number
  latex: string
  kind: 'inline' | 'block'
}

export function EquationDialog({
  editor,
  target,
  onClose,
}: {
  editor: Editor
  target?: MarkdownEquationTarget
  onClose: () => void
}) {
  const zh = navigator.language.toLowerCase().startsWith('zh')
  const [latex, setLatex] = useState(target?.latex ?? '')
  const [inline, setInline] = useState(target?.kind === 'inline')
  const preview = useMemo(() => {
    if (!latex.trim()) return null
    try {
      const omml = latexToOmml(latex)
      return { mathml: ommlToMathML(`<m:oMath>${omml}</m:oMath>`) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [latex])
  const valid = preview !== null && 'mathml' in preview && Boolean(preview.mathml)

  const recognize = async (image: FormulaImageData) => {
    const settings = await window.markdownApi.getAiSettings()
    const response = await window.markdownApi.aiChat(formulaRecognitionRequest(settings, image))
    if (!response.ok) throw new Error(response.error || 'ZenMux formula recognition failed')
    const value = cleanRecognizedLatex(response.content ?? '')
    if (!value) throw new Error('ZenMux returned no formula')
    setLatex(value)
  }

  const apply = () => {
    if (!valid) return
    if (target) {
      const node = editor.state.doc.nodeAt(target.pos)
      if (node)
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(target.pos, undefined, { latex: latex.trim() }),
        )
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: inline ? 'inlineEquation' : 'blockEquation',
          attrs: { latex: latex.trim() },
        })
        .run()
    }
    onClose()
  }

  return (
    <div
      className="md-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="md-equation-dialog" role="dialog">
        <h2>
          {zh ? (target ? '编辑公式' : '插入公式') : target ? 'Edit equation' : 'Insert equation'}
        </h2>
        <label>
          LaTeX
          <textarea autoFocus value={latex} onChange={(event) => setLatex(event.target.value)} />
        </label>
        <div className="md-equation-preview">
          {preview === null ? (
            zh ? (
              '输入 LaTeX 查看预览'
            ) : (
              'Enter LaTeX to preview'
            )
          ) : 'error' in preview ? (
            <span className="formula-image-error">{preview.error}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: preview.mathml }} />
          )}
        </div>
        <FormulaImageRecognition onRecognize={recognize} />
        {!target && (
          <label className="md-equation-inline-toggle">
            <input
              type="checkbox"
              checked={inline}
              onChange={(event) => setInline(event.target.checked)}
            />
            {zh ? '行内公式' : 'Inline equation'}
          </label>
        )}
        <div className="md-modal-actions">
          <button onClick={onClose}>{zh ? '取消' : 'Cancel'}</button>
          <button className="primary" disabled={!valid} onClick={apply}>
            {zh ? (target ? '更新' : '插入') : target ? 'Update' : 'Insert'}
          </button>
        </div>
      </div>
    </div>
  )
}
