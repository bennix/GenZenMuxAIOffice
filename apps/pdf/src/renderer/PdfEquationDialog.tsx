import { useMemo, useState } from 'react'
import { latexToOmml, ommlToMathML } from '@genoffice/docx-engine'
import { cleanRecognizedLatex, formulaRecognitionRequest } from '@genoffice/ai-provider'
import { FormulaImageRecognition, type FormulaImageData } from '@genoffice/ui'

function latexToMathML(latex: string): string {
  const inner = latexToOmml(latex.trim())
  return ommlToMathML(`<m:oMath>${inner}</m:oMath>`)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not render the equation'))
    image.src = src
  })
}

/** PDF has no native LaTeX object. Render Chromium's native MathML at 4× output
    density; the LaTeX remains editable in the dialog until placement. */
async function renderEquation(
  latex: string,
): Promise<{ base64: string; width: number; height: number }> {
  const mathml = latexToMathML(latex)
  const probe = document.createElement('div')
  probe.className = 'pdf-equation-raster-probe'
  probe.innerHTML = mathml
  document.body.appendChild(probe)
  try {
    await document.fonts?.ready
    const box = probe.getBoundingClientRect()
    const width = Math.max(64, Math.ceil(box.width))
    const height = Math.max(48, Math.ceil(box.height))
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" ` +
      `style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:10px 14px;font:36px/1.3 'STIX Two Math','Cambria Math',serif;color:#111">${mathml}</div>` +
      '</foreignObject></svg>'
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    const ratio = 4
    const canvas = document.createElement('canvas')
    canvas.width = width * ratio
    canvas.height = height * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    ctx.scale(ratio, ratio)
    ctx.drawImage(image, 0, 0, width, height)
    return {
      base64: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    probe.remove()
  }
}

export function PdfEquationDialog({
  onClose,
  onPlace,
}: {
  onClose: () => void
  onPlace: (equation: { latex: string; base64: string; width: number; height: number }) => void
}) {
  const zh = navigator.language.toLowerCase().startsWith('zh')
  const [latex, setLatex] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => {
    if (!latex.trim()) return null
    try {
      return { mathml: latexToMathML(latex) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [latex])
  const valid = preview !== null && 'mathml' in preview

  const recognize = async (image: FormulaImageData) => {
    const settings = await window.pdfApi.getAiSettings()
    const response = await window.pdfApi.aiChat(formulaRecognitionRequest(settings, image))
    if (!response.ok) throw new Error(response.error || 'ZenMux formula recognition failed')
    const value = cleanRecognizedLatex(response.content ?? '')
    if (!value) throw new Error('ZenMux returned no formula')
    setLatex(value)
  }

  const place = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      onPlace({ latex: latex.trim(), ...(await renderEquation(latex)) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="pdf-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="pdf-equation-dialog" role="dialog" aria-modal="true">
        <h2>{zh ? '识别、编辑并插入公式' : 'Recognize, edit and insert equation'}</h2>
        <label>
          LaTeX
          <textarea
            autoFocus
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder={String.raw`\begin{aligned} E &= mc^2 \\ F &= ma \end{aligned}`}
          />
        </label>
        <div className="pdf-equation-preview">
          {preview === null ? (
            zh ? (
              '输入 LaTeX，或从图片/剪贴板识别公式'
            ) : (
              'Enter LaTeX or recognize an image/clipboard formula'
            )
          ) : 'error' in preview ? (
            <span className="pdf-equation-error">{preview.error}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: preview.mathml }} />
          )}
        </div>
        <FormulaImageRecognition onRecognize={recognize} />
        <p className="pdf-equation-note">
          {zh
            ? '识别通过 ZenMux 视觉模型完成；网络状况可能影响速度。插入后点击页面放置公式。'
            : 'Recognition uses the ZenMux vision model and may be affected by network conditions. Click the page to place the result.'}
        </p>
        <div className="pdf-equation-actions">
          <button onClick={onClose}>{zh ? '取消' : 'Cancel'}</button>
          <button className="primary" disabled={!valid || busy} onClick={() => void place()}>
            {busy ? (zh ? '渲染中…' : 'Rendering…') : zh ? '放入 PDF' : 'Place in PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
