import type {
  GroupRenderNode,
  RenderNode,
  RenderSlide,
  ShapeRenderNode,
} from '@genoffice/pptx-render'

/**
 * Deterministic layout audit (modeled on the Google Slides add-in review_google_slides_addin geometry-only checks):
 * pure geometric computation, no LLM calls, no screenshots. Checks three kinds of problems:
 *  1. Elements extending past the canvas
 *  2. Pairwise overlap of content elements (text-text / text-image/media)
 *  3. Text overflowing its text box (uses the render layer's already-laid-out text.contentHeight — exact, not estimated)
 * Results are appended to layout tools' return values so the AI "sees" the real post-edit state (write → verify → fix loop).
 */

interface AuditEntry {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  hasText: boolean
  preview: string
  /** Pixels by which the text content height exceeds the box height (only meaningful when >0) */
  overflowPx: number
  /** Actual laid-out glyph rectangles, in the same slide coordinates as shape boxes. */
  ink: Array<{ x: number; y: number; w: number; h: number }>
}

const PREVIEW_MAX = 18

function textPreview(node: ShapeRenderNode): string {
  const t = (node.text?.lines ?? [])
    .map((l) => l.runs.map((r) => r.text).join(''))
    .join(' ')
    .trim()
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX)}…` : t
}

/** Collect the top-level nodes that take part in the audit (skip master/layout decoration; a group counts as one box). */
function collectEntries(nodes: RenderNode[]): AuditEntry[] {
  const out: AuditEntry[] = []
  for (const n of nodes) {
    if (n.decoration) continue
    const { x, y, w, h } = n.box
    let hasText = false
    let preview = ''
    let overflowPx = 0
    let ink: AuditEntry['ink'] = []
    if (n.type === 'shape' || n.type === 'text') {
      const sn = n as ShapeRenderNode
      preview = textPreview(sn)
      hasText = preview.length > 0
      if (sn.text && hasText) {
        const inner = h - sn.text.insets.t - sn.text.insets.b
        overflowPx = Math.round(sn.text.contentHeight - inner)
        if (Math.abs(n.box.rotationDeg) < 1 && !sn.text.vert) {
          ink = sn.text.lines.flatMap((line) =>
            line.runs
              .filter((run) => run.text.trim() && run.widthPx > 0)
              .map((run) => ({
                x: x + run.x,
                y: y + run.baselineY - (run.ascentPx ?? run.fontSizePx * 0.8),
                w: run.widthPx,
                h: run.fontSizePx,
              })),
          )
        }
      }
    } else if (n.type === 'group') {
      // If any child in the group has text, treat it as text content for overlap detection
      hasText = groupHasText(n as GroupRenderNode)
      preview = '(group)'
    }
    out.push({ id: n.sourceId, type: n.type, x, y, w, h, hasText, preview, overflowPx, ink })
  }
  return out
}

function groupHasText(g: GroupRenderNode): boolean {
  for (const c of g.children) {
    if (c.type === 'group') {
      if (groupHasText(c as GroupRenderNode)) return true
    } else if (c.type === 'shape' || c.type === 'text') {
      const t = (c as ShapeRenderNode).text?.lines ?? []
      if (t.some((l) => l.runs.some((r) => r.text.trim()))) return true
    }
  }
  return false
}

const MEDIA_TYPES = new Set(['picture', 'table', 'chart', 'placeholder-chip'])

/** Whether it's a content element (participates in overlap detection): has text, or is a picture/table/chart. */
function isContent(e: AuditEntry): boolean {
  return e.hasText || MEDIA_TYPES.has(e.type)
}

function label(e: AuditEntry): string {
  return e.preview && e.preview !== '(group)' ? `${e.id}"${e.preview}"` : `${e.id}(${e.type})`
}

const EDGE_TOLERANCE_PX = 8
const OVERFLOW_TOLERANCE_PX = 4
/** Threshold for overlap area as a fraction of the smaller element's area */
const OVERLAP_RATIO = 0.12
/** Absolute overlap area floor (px²), filtering out noise like touching trims */
const OVERLAP_MIN_AREA = 400
/** Background color blocks (≥70% of canvas area) don't participate in overlap detection */
const BACKGROUND_AREA_RATIO = 0.7
const MAX_ISSUES = 30

/**
 * Audit one page's layout and return the list of problems (empty array = pass).
 */
export function auditSlideLayout(slide: RenderSlide): string[] {
  const entries = collectEntries(slide.nodes)
  const issues: string[] = []
  const W = slide.widthPx
  const H = slide.heightPx

  // 1. Out of bounds
  for (const e of entries) {
    const parts: string[] = []
    if (e.x < -EDGE_TOLERANCE_PX) parts.push(`${Math.round(-e.x)}px past the left edge`)
    if (e.y < -EDGE_TOLERANCE_PX) parts.push(`${Math.round(-e.y)}px past the top edge`)
    if (e.x + e.w > W + EDGE_TOLERANCE_PX)
      parts.push(`${Math.round(e.x + e.w - W)}px past the right edge`)
    if (e.y + e.h > H + EDGE_TOLERANCE_PX)
      parts.push(`${Math.round(e.y + e.h - H)}px past the bottom edge`)
    if (parts.length) issues.push(`Out of bounds: ${label(e)} ${parts.join(', ')}`)
  }

  // 2. Text overflow
  for (const e of entries) {
    if (e.overflowPx > OVERFLOW_TOLERANCE_PX) {
      issues.push(
        `Text overflow: ${label(e)} content exceeds the box height by ${e.overflowPx}px (make the box taller or reduce the font size)`,
      )
    }
    if (
      e.ink.some(
        (r) =>
          r.x < e.x - 4 || r.y < e.y - 4 || r.x + r.w > e.x + e.w + 4 || r.y + r.h > e.y + e.h + 4,
      )
    ) {
      issues.push(
        `Glyph overflow: ${label(e)} rendered text extends beyond its shape; widen or grow the text box`,
      )
    }
  }

  // A short label inside a pill can have no overflow at all while visibly
  // hugging the top edge. Compare rendered glyphs with the pill's actual bounds.
  for (const node of slide.nodes) {
    if (node.decoration || (node.type !== 'shape' && node.type !== 'text')) continue
    const pill = node as ShapeRenderNode
    const isPill =
      (pill.cornerRadiusPx ?? 0) >= pill.box.h * 0.25 &&
      pill.box.h >= 24 &&
      pill.box.h <= 90 &&
      pill.box.w >= pill.box.h * 2
    const isIconCircle =
      (pill.presetGeometry === 'ellipse' || (pill.cornerRadiusPx ?? 0) >= pill.box.h * 0.4) &&
      pill.box.h >= 40 &&
      Math.abs(pill.box.w - pill.box.h) <= pill.box.h * 0.12
    if (!isPill && !isIconCircle) continue
    const labels = entries.filter(
      (e) =>
        e.ink.length > 0 &&
        e.preview.length <= (isPill ? 30 : 8) &&
        (isPill || /\p{Extended_Pictographic}/u.test(e.preview)) &&
        e.x >= pill.box.x - 2 &&
        e.x + e.w <= pill.box.x + pill.box.w + 2 &&
        e.y >= pill.box.y - 4 &&
        e.y + e.h <= pill.box.y + pill.box.h + 4,
    )
    if (labels.length !== 1) continue
    const label = labels[0]!
    const inkTop = Math.min(...label.ink.map((r) => r.y))
    const inkBottom = Math.max(...label.ink.map((r) => r.y + r.h))
    const offset = (inkTop + inkBottom - 2 * pill.box.y - pill.box.h) / 2
    if (Math.abs(offset) > 7 && Math.abs(offset) > pill.box.h * 0.14)
      issues.push(
        `${isPill ? 'Pill label' : 'Circle icon'} off-center: ${label.id} in ${pill.sourceId} is ${Math.round(Math.abs(offset))}px too ${offset < 0 ? 'high' : 'low'}`,
      )
  }

  // 3. Pairwise overlap of content elements
  const content = entries.filter((e) => isContent(e) && e.w * e.h < W * H * BACKGROUND_AREA_RATIO)
  for (let i = 0; i < content.length; i++) {
    for (let j = i + 1; j < content.length; j++) {
      const a = content[i]!
      const b = content[j]!
      // Only report text<->text and text<->media; media-on-media (e.g. a chart on an image) is often intentional design, don't report
      if (!a.hasText && !b.hasText) continue
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ix <= 0 || iy <= 0) continue
      const inter = ix * iy
      const minArea = Math.min(a.w * a.h, b.w * b.h)
      if (inter < OVERLAP_MIN_AREA || inter < minArea * OVERLAP_RATIO) continue
      issues.push(
        `Overlap: ${label(a)} and ${label(b)} intersect by ${Math.round(ix)}×${Math.round(iy)}px`,
      )
      if (issues.length >= MAX_ISSUES) break
    }
    if (issues.length >= MAX_ISSUES) break
  }

  // Text can collide even when its parent shapes overlap by too little for the broad box check.
  // Compare rendered glyph spans, as in ZenCode's DOM Range based audit.
  for (let i = 0; i < content.length && issues.length < MAX_ISSUES; i++) {
    const a = content[i]!
    if (!a.ink.length) continue
    for (let j = i + 1; j < content.length && issues.length < MAX_ISSUES; j++) {
      const b = content[j]!
      if (!b.ink.length) continue
      const collided = a.ink.some((ra) =>
        b.ink.some((rb) => {
          const ix = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x)
          const iy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y)
          return ix > 3 && iy > 3 && ix * iy > 24
        }),
      )
      if (
        collided &&
        !issues.some(
          (issue) =>
            issue.startsWith('Overlap:') && issue.includes(label(a)) && issue.includes(label(b)),
        )
      )
        issues.push(`Glyph overlap: ${label(a)} and ${label(b)} have rendered text crossing`)
    }
  }

  // A separate horizontal rule through the middle of glyphs is usually an accidental overlay.
  for (const n of slide.nodes) {
    if (issues.length >= MAX_ISSUES) break
    if (n.decoration || (n.type !== 'shape' && n.type !== 'text') || !n.line) continue
    const points = n.line.points
    if (points.length < 4) continue
    const x1 = n.box.x + points[0]!
    const y1 = n.box.y + points[1]!
    const x2 = n.box.x + points[points.length - 2]!
    const y2 = n.box.y + points[points.length - 1]!
    if (Math.abs(y2 - y1) > 3 || Math.abs(x2 - x1) < 50) continue
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)
    for (const e of content) {
      if (e.id === n.sourceId || !e.ink.length) continue
      if (
        e.ink.some(
          (r) =>
            y1 > r.y + r.h * 0.15 &&
            y1 < r.y + r.h * 0.8 &&
            Math.min(right, r.x + r.w) - Math.max(left, r.x) > 12,
        )
      ) {
        issues.push(`Line crosses text: ${n.sourceId} passes through ${label(e)}`)
        break
      }
    }
  }

  return issues.slice(0, MAX_ISSUES)
}

/** Format the audit result as trailing text for a tool's return value. */
export function formatAudit(issues: string[], round?: string): string {
  if (issues.length === 0)
    return '\n<layout-audit>✅ Passed: no overlap/out-of-bounds/text overflow.</layout-audit>'
  const head = `\n<layout-audit>⚠️ Found ${issues.length} issue(s):\n`
  const body = issues.map((s) => `- ${s}`).join('\n')
  const tail = round
    ? `\n${round}\n</layout-audit>`
    : "\n→ Immediately write another execute_slide_script to fix these issues (don't stop, don't ask the user, don't declare completion). Preserve all content. els reflects the new positions after the last apply; compute from it directly. At most 5 fix rounds; if still unresolved tell the user honestly.\n</layout-audit>"
  return head + body + tail
}
