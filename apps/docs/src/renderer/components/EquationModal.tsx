import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { replaceEquationXml } from '../editor/legacy-equation'
import { latexToOmml, ommlToMathML } from '@genoffice/docx-engine'
import { cleanRecognizedLatex, formulaRecognitionRequest } from '@genoffice/ai-provider'
import { FormulaImageRecognition, type FormulaImageData } from '@genoffice/ui'
import { t, useI18n, type StringKey } from '../i18n/locale'
import { equationBlockJson, inlineEquationNodeJson } from '../editor/equation'
import { useModalKeys } from './modal-keys'

/** Built-in equation library (the common preset set for the "Insert Equation" dropdown) */
export const BUILTIN_EQUATIONS: Array<{ name: string; nameKey: StringKey; latex: string }> = [
  { name: 'Area of Circle', nameKey: 'appEqCircleArea', latex: 'A = \\pi r^2' },
  {
    name: 'Binomial Theorem',
    nameKey: 'appEqBinomial',
    latex: '(x+a)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^k a^{n-k}',
  },
  {
    name: 'Expansion of a Sum',
    nameKey: 'appEqSumExpansion',
    latex: '(1+x)^n = 1 + \\frac{nx}{1!} + \\frac{n(n-1)x^2}{2!} + \\cdots',
  },
  {
    name: 'Fourier Series',
    nameKey: 'appEqFourier',
    latex:
      'f(x) = a_0 + \\sum_{n=1}^{\\infty} \\left( a_n \\cos \\frac{n\\pi x}{L} + b_n \\sin \\frac{n\\pi x}{L} \\right)',
  },
  { name: 'Pythagorean Theorem', nameKey: 'appEqPythagorean', latex: 'a^2 + b^2 = c^2' },
  {
    name: 'Quadratic Formula',
    nameKey: 'appEqQuadratic',
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  },
  {
    name: 'Taylor Expansion',
    nameKey: 'appEqTaylor',
    latex:
      'e^x = 1 + \\frac{x}{1!} + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots, -\\infty < x < \\infty',
  },
  {
    name: 'Trig Identity',
    nameKey: 'appEqTrigIdentity',
    latex:
      '\\sin \\alpha \\pm \\sin \\beta = 2 \\sin \\frac{1}{2} (\\alpha \\pm \\beta) \\cos \\frac{1}{2} (\\alpha \\mp \\beta)',
  },
]

/** Build an equation block from LaTeX and insert it (protected block, genXml goes through the save path) */
export function insertEquationFromLatex(editor: Editor, latex: string): void {
  editor.chain().focus().insertContent(equationBlockJson(latex)).run()
}

/** Insert an inline equation at the cursor that flows with the text */
export function insertInlineEquationFromLatex(editor: Editor, latex: string): void {
  editor.chain().focus().insertContent(inlineEquationNodeJson(latex)).run()
}

/** Equation re-edit target (inline = inline node; block = standalone protected equation block) */
export interface MathEditTarget {
  pos: number
  latex: string
  kind: 'inline' | 'block'
  legacy?: boolean
  sourceXml?: string
  originalImage?: string
  context?: string
  caption?: string
  originalNode?: ProseMirrorNode
}

/** MathML preview (returns null with an error message when the LaTeX is invalid) */
function previewOf(latex: string): { mathml: string } | { error: string } | null {
  if (!latex.trim()) return null
  try {
    const omml = latexToOmml(latex)
    const mathml = ommlToMathML(`<m:oMath>${omml}</m:oMath>`)
    return mathml ? { mathml } : { error: t('appPreviewUnavailable') }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Insert Equation dialog: LaTeX input + live MathML preview, shared by the ribbon and the native menu */
export function EquationModal({
  editor,
  onClose,
  editTarget,
}: {
  editor: Editor
  onClose: () => void
  /** When provided, "re-edit equation" mode: update that node instead of inserting */
  editTarget?: MathEditTarget
}) {
  const { lang, t } = useI18n()
  const modalKeys = useModalKeys(onClose)
  const [latex, setLatex] = useState(editTarget?.latex ?? '')
  const [conversionAccepted, setConversionAccepted] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [error, setError] = useState('')
  const zh = lang === 'zh' || lang === 'zh-TW'
  const [inline, setInline] = useState(editTarget?.kind === 'inline')
  const preview = useMemo(() => previewOf(latex), [latex])
  const canInsert =
    preview !== null &&
    'mathml' in preview &&
    !recognizing &&
    (!editTarget?.legacy || conversionAccepted)

  const recognizeImage = async (image: FormulaImageData) => {
    const settings = await window.desktop.getAiSettings()
    const request = formulaRecognitionRequest(settings, image)
    if (editTarget?.context)
      request.user += `\n\n文稿上下文（仅用于识别符号，请勿改写原公式）：\n${editTarget.context}`
    const response = await window.desktop.aiChat(request)
    if (!response.ok) throw new Error(response.error || 'ZenMux formula recognition failed')
    const recognized = cleanRecognizedLatex(response.content ?? '')
    if (!recognized) throw new Error('ZenMux returned no formula')
    setLatex(recognized)
  }

  const recognizeCurrent = async () => {
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(editTarget?.originalImage ?? '')
    if (!match) return
    setRecognizing(true)
    setError('')
    try {
      await recognizeImage({ mime: match[1], base64: match[2] })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRecognizing(false)
    }
  }

  const insert = () => {
    if (!canInsert || !editor.isEditable) return
    setError('')
    if (editTarget) {
      const node = editor.state.doc.nodeAt(editTarget.pos)
      if (!node || (editTarget.originalNode && !node.eq(editTarget.originalNode))) {
        setError(
          zh
            ? '公式已变化，请关闭后重新选择。'
            : 'The equation changed. Close and select it again.',
        )
        return
      }
      if (editTarget.kind === 'inline' && node?.type.name === 'docInlineMath') {
        const next = inlineEquationNodeJson(latex)
        editor.view.dispatch(editor.state.tr.setNodeMarkup(editTarget.pos, undefined, next.attrs))
      } else if (editTarget.kind === 'block' && node?.type.name === 'docProtected') {
        // rebuilt from LaTeX: the block loses its original anchor and saves as
        // freshly generated OMML (that is the point of a full re-edit)
        const json = equationBlockJson(latex)
        if (editTarget.sourceXml) {
          try {
            json.attrs!.genXml = replaceEquationXml(editTarget.sourceXml, latex)
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason))
            return
          }
        } else if (editTarget.legacy) {
          setError(
            zh
              ? '无法定位原始对象；文稿未修改。'
              : 'Original object unavailable; document unchanged.',
          )
          return
        }
        if (editTarget.caption) json.attrs!.formulaCaption = editTarget.caption
        const next = editor.schema.nodeFromJSON(json)
        editor.view.dispatch(
          editor.state.tr.replaceWith(editTarget.pos, editTarget.pos + node.nodeSize, next),
        )
      }
    } else if (inline) {
      insertInlineEquationFromLatex(editor, latex)
    } else {
      insertEquationFromLatex(editor, latex)
    }
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      ref={modalKeys.ref}
      onKeyDown={modalKeys.onKeyDown}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal equation-modal">
        <h2>{editTarget ? t('editorEditFormulaLatex') : t('appInsertEquation')}</h2>
        {editTarget?.originalImage && (
          <div className="equation-source-preview">
            <img src={editTarget.originalImage} alt={zh ? '原公式' : 'Original equation'} />
            <button
              className="btn-ghost"
              disabled={recognizing}
              onClick={() => void recognizeCurrent()}
            >
              {recognizing
                ? zh
                  ? '正在识别…'
                  : 'Recognizing…'
                : zh
                  ? 'AI 识别当前公式'
                  : 'Recognize this equation with AI'}
            </button>
          </div>
        )}
        {editTarget?.legacy && (
          <label className="equation-conversion-warning">
            <input
              type="checkbox"
              checked={conversionAccepted}
              onChange={(event) => setConversionAccepted(event.target.checked)}
            />
            <span>
              {zh
                ? '我已了解：应用后将转换为系统公式。保存前可撤销；保存并重新打开后，无法还原为原 MathType 嵌入对象，请保留原文件。'
                : 'I understand: applying converts this object to a native equation. Undo is available before saving; after saving and reopening, the original MathType object cannot be restored. Keep the original file.'}
            </span>
          </label>
        )}
        <label>
          LaTeX
          <input
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder={t('appLatexPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && insert()}
            autoFocus
          />
        </label>
        <div className="equation-preview">
          {preview === null && (
            <span className="equation-preview-hint">{t('appLatexPreviewHint')}</span>
          )}
          {preview !== null && 'error' in preview && (
            <span className="equation-preview-error">{preview.error}</span>
          )}
          {preview !== null && 'mathml' in preview && (
            <span dangerouslySetInnerHTML={{ __html: preview.mathml }} />
          )}
        </div>
        <FormulaImageRecognition language={lang} onRecognize={recognizeImage} />
        {error && (
          <p className="equation-preview-error" role="alert">
            {error}
          </p>
        )}
        {editTarget?.context && (
          <details className="equation-context-preview">
            <summary>{zh ? '查看文稿上下文' : 'Document context'}</summary>
            <pre>{editTarget.context}</pre>
          </details>
        )}
        {editTarget && (
          <button
            className="btn-ghost"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('ai-docs-ask-formula', { detail: { pos: editTarget.pos } }),
              )
              onClose()
            }}
          >
            {zh ? '将公式图片和上下文添加到 AI 对话' : 'Add equation image and context to AI chat'}
          </button>
        )}
        {!editTarget && (
          <label className="equation-inline-toggle">
            <input type="checkbox" checked={inline} onChange={(e) => setInline(e.target.checked)} />
            {t('appInlineEquationToggle')}
          </label>
        )}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            {t('appCancel')}
          </button>
          <button className="btn-primary" disabled={!canInsert} onClick={insert}>
            {editTarget ? t('appUpdate') : t('appInsert')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Built-in equation gallery (ribbon Equation ▾ dropdown), with MathML thumbnail previews */
export function EquationGallery({
  editor,
  onPick,
  onCustom,
}: {
  editor: Editor
  onPick: () => void
  onCustom: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="equation-gallery">
      {BUILTIN_EQUATIONS.map((eq) => {
        const preview = previewOf(eq.latex)
        return (
          <button
            key={eq.nameKey}
            className="equation-gallery-item"
            title={t(eq.nameKey)}
            onClick={() => {
              insertEquationFromLatex(editor, eq.latex)
              onPick()
            }}
          >
            <span className="equation-gallery-name">{t(eq.nameKey)}</span>
            {preview !== null && 'mathml' in preview && (
              <span
                className="equation-gallery-preview"
                dangerouslySetInnerHTML={{ __html: preview.mathml }}
              />
            )}
          </button>
        )
      })}
      <button className="equation-gallery-custom" onClick={onCustom}>
        {t('appInsertNewEquation')}
      </button>
    </div>
  )
}
