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
  /**
   * Extra width (px) the browser needs so a soft-wrapped tail, or a line that
   * already fills its box, does not drop the last few characters onto a new line
   * once PowerPoint measures the same run.
   */
  widenPx?: number
  /** How many short soft-wrapped tail lines `widenPx` is meant to pull back up. */
  unwrapLines?: number
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

const FIT_GAP = 8

function overlapLen(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0)
}

function isDecorShape(node: EditableHtmlNode): boolean {
  if (node.kind !== 'shape') return false
  if (node.h < 12 || node.w < 12) return false
  const filled = Boolean(node.fill) && (node.fillTransparency ?? 0) < 92
  const stroked =
    Boolean(node.lineColor) && (node.lineWidth ?? 0) > 0 && (node.lineTransparency ?? 0) < 92
  return filled || stroked
}

function isBackdrop(node: EditableHtmlNode, pageWidth: number, pageHeight: number): boolean {
  return node.w * node.h >= pageWidth * pageHeight * 0.7
}

/** Smallest card / pill / bar that this text is sitting on (not the page background). */
function pickContainer(
  text: EditableHtmlNode,
  shapes: EditableHtmlNode[],
  pageWidth: number,
  pageHeight: number,
): EditableHtmlNode | undefined {
  let best: EditableHtmlNode | undefined
  let bestArea = Infinity
  const font = text.fontSize || 18
  for (const shape of shapes) {
    if (isBackdrop(shape, pageWidth, pageHeight)) continue
    const xOverlap = overlapLen(text.x, text.x + text.w, shape.x, shape.x + shape.w)
    if (xOverlap < Math.min(text.w, shape.w) * 0.55) continue
    const yOverlap = overlapLen(text.y, text.y + text.h, shape.y, shape.y + shape.h)
    const mostlyInside = yOverlap > text.h * 0.4
    const spilling =
      yOverlap > 0 && text.y <= shape.y + shape.h + Math.min(12, font * 0.4) && text.y >= shape.y - 8
    if (!mostlyInside && !spilling) continue
    if (shape.w + 4 < text.w * 0.7) continue
    const area = shape.w * shape.h
    if (area < bestArea) {
      best = shape
      bestArea = area
    }
  }
  return best
}

function edgeLimit(
  node: EditableHtmlNode,
  nodes: EditableHtmlNode[],
  ignore: Set<EditableHtmlNode>,
  pageWidth: number,
  pageHeight: number,
  side: 'left' | 'right',
): number {
  let limit = side === 'right' ? pageWidth - 12 : 12
  for (const other of nodes) {
    if (other === node || ignore.has(other)) continue
    if (isBackdrop(other, pageWidth, pageHeight)) continue
    const yOverlap = overlapLen(node.y, node.y + node.h, other.y, other.y + other.h)
    if (yOverlap < 6) continue
    if (side === 'right' && other.x >= node.x + node.w - 2) limit = Math.min(limit, other.x - FIT_GAP)
    if (side === 'left' && other.x + other.w <= node.x + 2) limit = Math.max(limit, other.x + other.w + FIT_GAP)
  }
  return limit
}

/**
 * Generated slides measure text in Chromium, then PowerPoint wraps it again.
 * A box that is only a few characters short drops that tail onto its own line,
 * and the extra line hangs out of the card or banner behind it. Widen those
 * runs (or, if a neighbor blocks the widen, shrink the font just enough) and
 * keep each run inside its decorative shape.
 */
export function fitTextInsideDecorations(
  nodes: EditableHtmlNode[],
  pageWidth: number,
  pageHeight: number,
): EditableHtmlNode[] {
  const fitted = nodes.map((node) => ({ ...node }))
  const texts = fitted.filter((node) => node.kind === 'text' && node.text?.trim())
  const shapes = fitted.filter(isDecorShape)
  const containerOf = new Map<EditableHtmlNode, EditableHtmlNode | undefined>()
  const padOf = new Map<EditableHtmlNode, { l: number; r: number; t: number; b: number }>()
  for (const text of texts) containerOf.set(text, pickContainer(text, shapes, pageWidth, pageHeight))
  for (const shape of shapes) {
    if (isBackdrop(shape, pageWidth, pageHeight)) continue
    const members = texts.filter((text) => containerOf.get(text) === shape)
    if (!members.length) continue
    const contentLeft = Math.min(...members.map((text) => text.x))
    const contentRight = Math.max(...members.map((text) => text.x + text.w))
    const contentTop = Math.min(...members.map((text) => text.y))
    const contentBottom = Math.max(...members.map((text) => text.y + text.h))
    padOf.set(shape, {
      l: Math.max(8, contentLeft - shape.x),
      r: Math.max(8, shape.x + shape.w - contentRight),
      t: Math.max(6, contentTop - shape.y),
      b: Math.max(8, shape.y + shape.h - contentBottom),
    })
  }

  const readingOrder = [...texts].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const text of readingOrder) {
    const widen = text.widenPx ?? 0
    const unwrap = text.unwrapLines ?? 0
    if (widen <= 0) continue
    const font = text.fontSize || 18
    const container = containerOf.get(text)
    const ignore = new Set<EditableHtmlNode>([text])
    if (container) ignore.add(container)
    const right = edgeLimit(text, fitted, ignore, pageWidth, pageHeight, 'right')
    const left = edgeLimit(text, fitted, ignore, pageWidth, pageHeight, 'left')
    let grow = Math.max(0, Math.min(widen, right - (text.x + text.w)))
    if (text.align === 'right') {
      grow = Math.min(grow, text.x - left)
      text.x -= grow
      text.w += grow
    } else if (text.align === 'center') {
      const leftGrow = Math.min(grow / 2, text.x - left)
      const rightGrow = Math.min(grow - leftGrow, right - (text.x + text.w))
      text.x -= leftGrow
      text.w += leftGrow + rightGrow
      grow = leftGrow + rightGrow
    } else {
      text.w += grow
    }
    const room = text.w
    const needed = text.w - grow + widen
    let scale = 1
    if (unwrap > 0 && room + 1 < needed) {
      scale = Math.max(0.72, room / needed)
      text.fontSize = Math.max(10, Math.round(font * scale * 10) / 10)
      if (text.lineHeight) text.lineHeight = Math.round(text.lineHeight * scale * 10) / 10
    }
    const absorbed = unwrap > 0 && room + 1 >= needed * scale
    if (!absorbed) continue
    const lineH =
      text.lineHeight && text.lineHeight > font * 0.55 ? text.lineHeight / scale : font * 1.35
    const drop = Math.min(lineH * unwrap, Math.max(0, text.h - lineH))
    if (drop < 1) continue
    const oldBottom = text.y + text.h
    text.h -= drop
    const newBottom = text.y + text.h
    for (const other of texts) {
      if (other === text || containerOf.get(other) !== container) continue
      if (overlapLen(text.x, text.x + text.w, other.x, other.x + other.w) < 8) continue
      if (other.y < oldBottom - 6) continue
      other.y = Math.max(newBottom, other.y - drop)
    }
  }

  const orderedShapes = shapes
    .filter((shape) => !isBackdrop(shape, pageWidth, pageHeight) && padOf.has(shape))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  for (const shape of orderedShapes) {
    const members = texts.filter((text) => containerOf.get(text) === shape)
    if (!members.length) continue
    const pad = padOf.get(shape)!
    const contentRight = Math.max(...members.map((text) => text.x + text.w))
    const contentBottom = Math.max(...members.map((text) => text.y + text.h))
    const ignore = new Set<EditableHtmlNode>([shape, ...members])
    const needRight = contentRight + pad.r
    if (shape.x + shape.w + 1 < needRight) {
      const limit = edgeLimit(shape, fitted, ignore, pageWidth, pageHeight, 'right')
      shape.w = Math.max(shape.w, Math.min(needRight, limit) - shape.x)
    }
    const targetBottom = contentBottom + pad.b
    const overflow = targetBottom - (shape.y + shape.h)
    if (overflow <= 3) {
      const foreignTop = fitted.reduce((top, node) => {
        if (ignore.has(node) || isBackdrop(node, pageWidth, pageHeight)) return top
        if (node.y <= contentBottom + 2) return top
        const xOverlap = overlapLen(shape.x, shape.x + shape.w, node.x, node.x + node.w)
        const yOverlap = overlapLen(shape.y, shape.y + shape.h, node.y, node.y + node.h)
        if (xOverlap < 8) return top
        if (xOverlap > node.w * 0.7 && yOverlap > node.h * 0.7) return top
        return Math.min(top, node.y)
      }, Infinity)
      const yielded = Number.isFinite(foreignTop) ? Math.min(targetBottom, foreignTop - 4) : targetBottom
      const shrunk = Math.max(contentBottom + 8, yielded) - shape.y
      if (shrunk < shape.h - 2 && shrunk > 16) shape.h = shrunk
      continue
    }
    const blockers = fitted.filter((node) => {
      if (ignore.has(node) || isBackdrop(node, pageWidth, pageHeight)) return false
      if (node.y < shape.y + shape.h - 4) return false
      return overlapLen(shape.x, shape.x + shape.w, node.x, node.x + node.w) > 8
    })
    const lowest = blockers.reduce((max, node) => Math.max(max, node.y + node.h), shape.y + shape.h)
    const roomBelow = pageHeight - 4 - lowest
    const shift = Math.max(0, Math.min(overflow, roomBelow))
    if (shift > 0) {
      for (const node of blockers) node.y += shift
      shape.h += shift
    }
    const contentTop = Math.min(...members.map((text) => text.y))
    const contentBottomNow = Math.max(...members.map((text) => text.y + text.h))
    const still = contentBottomNow + Math.min(pad.b, 12) - (shape.y + shape.h)
    if (still <= 3) continue
    const used = Math.max(1, contentBottomNow - contentTop)
    const avail = Math.max(1, shape.y + shape.h - Math.min(pad.b, 12) - contentTop)
    const scale = Math.min(1, avail / used)
    for (const text of members) {
      text.y = contentTop + (text.y - contentTop) * scale
      text.h *= scale
      if (text.fontSize) text.fontSize = Math.max(6, Math.round(text.fontSize * scale * 10) / 10)
      if (text.lineHeight)
        text.lineHeight = Math.round((text.lineHeight || text.fontSize || 18) * scale * 10) / 10
    }
  }

  return fitted
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

  for (const node of orderEditableHtmlNodes(
    fitTextInsideDecorations(page.nodes, width, height).slice(0, 500),
  )) {
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
