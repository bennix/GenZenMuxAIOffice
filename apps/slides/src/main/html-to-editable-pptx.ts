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
  /** Explicit CSS layer, when supplied by the generated page. */
  zIndex?: number
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

/** PPTX paints later objects on top. Repair implicit card/background ordering
 * without sorting all objects by size (which breaks charts and image overlays).
 * Explicit CSS layers take precedence; within a layer only containing filled
 * shapes are moved behind their contents. Unrelated objects retain DOM order.
 */
export function orderEditableHtmlNodes(nodes: EditableHtmlNode[]): EditableHtmlNode[] {
  const layer = (node: EditableHtmlNode) => (Number.isFinite(node.zIndex) ? node.zIndex! : 0)
  const sorted = [...nodes].sort((a, b) => layer(a) - layer(b))
  const result: EditableHtmlNode[] = []
  const emitted = new Set<EditableHtmlNode>()
  const contains = (back: EditableHtmlNode, front: EditableHtmlNode) => {
    if (back.kind !== 'shape' || !back.fill || (back.fillTransparency ?? 0) >= 99) return false
    if (layer(back) !== layer(front)) return false
    if (
      ![back.x, back.y, back.w, back.h, front.x, front.y, front.w, front.h].every(Number.isFinite)
    )
      return false
    // Strictly larger area makes containment acyclic; equal-sized overlays
    // keep their original order. A same-sized text box still belongs on top.
    const larger = back.w * back.h > front.w * front.h
    if (!larger && !(front.kind === 'text' && back.w === front.w && back.h === front.h))
      return false
    return (
      back.x <= front.x + 1 &&
      back.y <= front.y + 1 &&
      back.x + back.w >= front.x + front.w - 1 &&
      back.y + back.h >= front.y + front.h - 1
    )
  }
  const emit = (node: EditableHtmlNode) => {
    if (emitted.has(node)) return
    emitted.add(node)
    for (const background of sorted) {
      if (background !== node && contains(background, node)) emit(background)
    }
    result.push(node)
  }
  for (const node of sorted) emit(node)
  return result
}

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

  for (const node of orderEditableHtmlNodes(page.nodes.slice(0, 500))) {
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
