import PptxGenJS from 'pptxgenjs'

export interface EditableHtmlNode {
  kind: 'shape' | 'text' | 'image'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  fillTransparency?: number
  lineColor?: string
  lineTransparency?: number
  lineWidth?: number
  radius?: number
  opacity?: number
  text?: string
  color?: string
  fontFace?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  charSpacing?: number
  src?: string
  objectFit?: 'cover' | 'contain' | 'fill'
}

export interface EditableHtmlPage {
  width: number
  height: number
  background?: string
  nodes: EditableHtmlNode[]
}

export type HtmlImageLoader = (src: string) => Promise<string | null>

const asHex = (value: string | undefined, fallback: string): string => {
  const match = value?.replace('#', '').match(/^[0-9a-f]{6}$/i)
  return match ? match[0].toUpperCase() : fallback
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Convert one browser-laid-out HTML page into native PowerPoint objects. */
export async function buildEditableSlidePptx(
  page: EditableHtmlPage,
  loadImage: HtmlImageLoader,
): Promise<{ bytes: Uint8Array; imageFailures: string[] }> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'GenZenMux AI Office'
  pptx.subject = 'Generated locally with ZenMux as editable PowerPoint objects'
  const slide = pptx.addSlide()
  slide.background = { color: asHex(page.background, 'FFFFFF') }

  const width = Math.max(1, page.width || 1280)
  const height = Math.max(1, page.height || 720)
  const sx = 13.333333 / width
  const sy = 7.5 / height
  const imageFailures: string[] = []

  for (const node of page.nodes.slice(0, 500)) {
    if (![node.x, node.y, node.w, node.h].every(Number.isFinite)) continue
    const x = clamp(node.x, 0, width) * sx
    const y = clamp(node.y, 0, height) * sy
    const w = clamp(node.w, 0, width - clamp(node.x, 0, width)) * sx
    const h = clamp(node.h, 0, height - clamp(node.y, 0, height)) * sy
    if (w < 0.01 || h < 0.01) continue

    if (node.kind === 'shape') {
      const hasLine = Boolean(node.lineColor && (node.lineWidth ?? 0) > 0)
      slide.addShape(
        node.radius && node.radius > 2 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
        {
          x,
          y,
          w,
          h,
          fill: node.fill
            ? {
                color: asHex(node.fill, 'FFFFFF'),
                transparency: clamp(node.fillTransparency ?? 0, 0, 100),
              }
            : { color: 'FFFFFF', transparency: 100 },
          line: hasLine
            ? {
                color: asHex(node.lineColor, '000000'),
                transparency: clamp(node.lineTransparency ?? 0, 0, 100),
                width: Math.max(0.25, (node.lineWidth ?? 1) * 0.75),
              }
            : { color: 'FFFFFF', transparency: 100 },
          rectRadius: node.radius ? clamp((node.radius * sx) / Math.min(w, h), 0, 1) : 0,
        },
      )
      continue
    }

    if (node.kind === 'text' && node.text?.trim()) {
      slide.addText(node.text.trim(), {
        x,
        y,
        w,
        h,
        margin: 0,
        isTextBox: true,
        fit: 'shrink',
        breakLine: false,
        color: asHex(node.color, '1A1A1A'),
        fontFace: node.fontFace || 'Arial',
        fontSize: clamp((node.fontSize || 18) * 0.75, 6, 72),
        bold: node.bold,
        italic: node.italic,
        underline: node.underline ? { style: 'sng' } : undefined,
        align: node.align ?? 'left',
        valign: node.valign ?? 'top',
        lineSpacing: node.lineHeight ? Math.max(6, node.lineHeight * 0.75) : undefined,
        charSpacing: node.charSpacing ? node.charSpacing * 0.75 : undefined,
        transparency: clamp(100 - (node.opacity ?? 1) * 100, 0, 100),
      })
      continue
    }

    if (node.kind === 'image' && node.src) {
      const data = await loadImage(node.src).catch(() => null)
      if (!data) {
        imageFailures.push(node.src)
        continue
      }
      slide.addImage({
        data,
        x,
        y,
        w,
        h,
        sizing:
          node.objectFit === 'cover' || node.objectFit === 'contain'
            ? { type: node.objectFit, w, h }
            : undefined,
        transparency: clamp(100 - (node.opacity ?? 1) * 100, 0, 100),
        altText: 'AI-generated slide image',
      })
    }
  }

  const bytes = await pptx.write({ outputType: 'nodebuffer' })
  return { bytes: new Uint8Array(bytes as Buffer), imageFailures }
}
