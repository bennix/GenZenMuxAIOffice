import { latexToOmml, ommlToMathML } from '@genoffice/docx-engine'

const LATEX_DESCR_PREFIX = 'genoffice-latex:'

export function latexEquationDescr(latex: string): string {
  return `${LATEX_DESCR_PREFIX}${encodeURIComponent(latex.trim())}`
}

export function latexFromEquationDescr(descr?: string): string | null {
  if (!descr?.startsWith(LATEX_DESCR_PREFIX)) return null
  try {
    return decodeURIComponent(descr.slice(LATEX_DESCR_PREFIX.length)) || null
  } catch {
    return null
  }
}

export function latexToMathML(latex: string): string {
  const inner = latexToOmml(latex.trim())
  return ommlToMathML(`<m:oMath>${inner}</m:oMath>`)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not rasterize the equation preview'))
    image.src = url
  })
}

/** Render native Chromium MathML to a transparent, high-resolution PNG for PPTX compatibility. */
export async function renderLatexEquationPng(
  latex: string,
): Promise<{ base64: string; widthPx: number; heightPx: number; mathml: string }> {
  const mathml = latexToMathML(latex)
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;left:-100000px;top:0;display:inline-block;width:max-content;padding:12px 16px;' +
    'font:36px/1.25 "STIX Two Math","Cambria Math",serif;color:#111;background:transparent;'
  probe.innerHTML = mathml
  document.body.appendChild(probe)
  try {
    await document.fonts?.ready
    const rect = probe.getBoundingClientRect()
    const widthPx = Math.max(48, Math.ceil(rect.width))
    const heightPx = Math.max(48, Math.ceil(rect.height))
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">` +
      `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" ` +
      `style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:100%;` +
      `padding:12px 16px;font:36px/1.25 'STIX Two Math','Cambria Math',serif;color:#111;">${mathml}</div>` +
      '</foreignObject></svg>'
    // A blob-backed SVG containing foreignObject taints Chromium's canvas and blocks PNG export.
    // An encoded local data URL remains origin-clean while preserving native MathML rendering.
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    const pixelRatio = 2
    const canvas = document.createElement('canvas')
    canvas.width = widthPx * pixelRatio
    canvas.height = heightPx * pixelRatio
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    context.scale(pixelRatio, pixelRatio)
    context.drawImage(image, 0, 0, widthPx, heightPx)
    return {
      base64: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
      widthPx,
      heightPx,
      mathml,
    }
  } finally {
    probe.remove()
  }
}
