import type { SystemOneAnswer, SystemOneQuestion, SystemOneResponse } from '@genoffice/ai-provider'
import type { GroupRenderNode, RenderNode, RenderSlide, ShapeRenderNode } from '@genoffice/pptx-render'

/** Below this, Jev is not sure enough that a layout change is warranted. */
export const JEV_CHANGE_MIN = 0.62
/** Below this, the proposed fix is not sure enough to apply. */
export const JEV_PLAN_MIN = 0.55

export type LayoutApproach = 'leave' | 'widen' | 'grow_container' | 'separate' | 'vision'

export interface LayoutProposal {
  approach: LayoutApproach
  plan: string
}

/**
 * Code picks the candidate fix from measured geometry. Jev only judges whether
 * that fix is warranted and reasonable — it does not write the plan.
 */
export function proposeLayoutPlan(issues: string[]): LayoutProposal {
  if (issues.length === 0) {
    return {
      approach: 'leave',
      plan: 'No measured geometry defect. Leave the page unchanged.',
    }
  }
  const overflow = issues.some((issue) => /overflow/i.test(issue))
  const overlap = issues.some((issue) => /overlap/i.test(issue))
  const outside = issues.some((issue) => /out of bounds/i.test(issue))
  if (overflow && !overlap && !outside) {
    return {
      approach: 'widen',
      plan: 'Widen the text box, and the card or banner behind it, so a short wrapped tail stays on one line and the text remains inside the shape. Do not restyle or rewrite.',
    }
  }
  if ((outside || overflow) && !overlap) {
    return {
      approach: 'grow_container',
      plan: 'Grow the decorative shape so the text sits fully inside it, and shift only the content that would be covered. Do not restyle or rewrite.',
    }
  }
  if (overlap && !overflow && !outside) {
    return {
      approach: 'separate',
      plan: 'Separate the overlapping elements with the smallest move that clears the intersection. Do not restyle or rewrite.',
    }
  }
  return {
    approach: 'vision',
    plan: `Apply only the smallest geometry fix for these measured issues: ${issues.slice(0, 6).join(' | ')}. Do not restyle or rewrite.`,
  }
}

export function layoutJudgementQuestions(): Record<string, SystemOneQuestion> {
  return {
    needs_change: {
      type: 'noul',
      instructions:
        'Does this slide need a layout fix for an objective defect: text hanging outside a card, pill, or banner; the last few characters of a line sitting alone on the next line; overflow; overlap; or clipping? Ignore taste and copy edits.',
      criteria: {
        true: 'A reader would see a broken or overflowing layout',
        false: 'The page is readable and text stays inside its shapes',
      },
    },
    plan_ok: {
      type: 'noul',
      instructions:
        'Is the proposed fix in the state a reasonable minimal layout correction? It must keep every fact, name, and number, and must not restyle the page or rewrite the copy.',
      criteria: {
        true: 'The proposal matches the defect and changes only geometry',
        false: 'The proposal is unnecessary, restyles the page, or would not fix the defect',
      },
    },
  }
}

export function layoutJudgementState(dump: string, issues: string[], plan: string): string {
  const body = dump.length > 3500 ? `${dump.slice(0, 3500)}\n…` : dump
  const measured = issues.length > 0 ? issues.slice(0, 8).join('\n') : 'None measured.'
  return `Slide geometry\n${body}\n\nMeasured issues\n${measured}\n\nProposed fix\n${plan}`
}

const VISION_PLAN =
  'Fix only an objective layout defect: text outside a card, pill, or banner; a line whose last few characters sit alone on the next line; overlap; or clipping. Do not restyle or rewrite.'

export function shouldApplyLayoutFix(
  approach: LayoutApproach,
  answers: {
    needs_change?: { noul?: number }
    plan_ok?: { noul?: number }
  },
): { apply: boolean; rejected: boolean; vision: boolean } {
  const needs = answers.needs_change?.noul ?? 0
  const ok = answers.plan_ok?.noul ?? 0
  if (needs < JEV_CHANGE_MIN) return { apply: false, rejected: false, vision: false }
  if (approach === 'leave') {
    // No measured defect. A high plan score means leaving the page is reasonable.
    if (ok >= JEV_PLAN_MIN) return { apply: false, rejected: false, vision: false }
    return { apply: true, rejected: false, vision: true }
  }
  if (ok < JEV_PLAN_MIN) return { apply: false, rejected: true, vision: false }
  return { apply: true, rejected: false, vision: false }
}

export type JevLayoutAction = 'leave' | 'widen' | 'grow_container' | 'separate' | 'both'

export interface LayoutPatch {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface LayoutTarget {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  text: string
  fontPx: number
  filled: boolean
  orphanPx: number
  spillPx: number
  containerId?: string
}

const ACTIONS = new Set<JevLayoutAction>(['leave', 'widen', 'grow_container', 'separate', 'both'])

function walkShapes(nodes: RenderNode[], out: ShapeRenderNode[]) {
  for (const node of nodes) {
    if (node.decoration || node.background) continue
    if (node.type === 'shape' || node.type === 'text') out.push(node as ShapeRenderNode)
    else if (node.type === 'group') walkShapes((node as GroupRenderNode).children, out)
  }
}

function measureLine(line: { runs: Array<{ widthPx: number; fontSizePx: number; text: string; isBullet?: boolean }> }) {
  let width = 0
  let font = 0
  let chars = ''
  for (const run of line.runs) {
    if (run.isBullet) continue
    width += run.widthPx
    font = Math.max(font, run.fontSizePx)
    chars += run.text
  }
  return { width, font, chars }
}

/** Facts measured from the already laid-out slide. Jev chooses the remedy; it does not measure. */
export function measureLayoutTargets(slide: RenderSlide): LayoutTarget[] {
  const shapes = [] as ShapeRenderNode[]
  walkShapes(slide.nodes, shapes)
  const pageArea = slide.widthPx * slide.heightPx
  const targets: Array<LayoutTarget & { contentBottom: number }> = shapes
    .filter((shape) => shape.text?.lines?.some((line) => line.runs.some((run) => run.text.trim())))
    .map((shape) => {
      const lines = shape.text!.lines
      const fontPx = Math.max(12, ...lines.flatMap((line) => line.runs.map((run) => run.fontSizePx)))
      let orphanPx = 0
      const innerW = Math.max(1, shape.box.w - shape.text!.insets.l - shape.text!.insets.r)
      for (let i = 1; i < lines.length; i++) {
        const prev = measureLine(lines[i - 1]!)
        const cur = measureLine(lines[i]!)
        const wrapped = !lines[i]!.paraStart
        const prevFilled = prev.width >= innerW - fontPx * 1.15
        const shortTail = cur.width > 0 && cur.width <= fontPx * 4.5 && cur.width < prev.width * 0.55
        if (wrapped && prevFilled && shortTail) orphanPx = Math.max(orphanPx, cur.width)
      }
      const last = lines[lines.length - 1]!
      const contentBottom = shape.box.y + shape.text!.insets.t + last.top + last.height
      return {
        id: shape.sourceId,
        x: shape.box.x,
        y: shape.box.y,
        w: shape.box.w,
        h: shape.box.h,
        rotation: shape.box.rotationDeg,
        text: lines.map((line) => measureLine(line).chars).join('\n').slice(0, 80),
        fontPx,
        filled: shape.fill?.kind === 'solid',
        orphanPx: Math.round(orphanPx),
        spillPx: 0,
        contentBottom,
      }
    })
  const cards = shapes.filter(
    (shape) =>
      shape.fill?.kind === 'solid' &&
      !shape.text?.lines?.some((line) => line.runs.some((run) => run.text.trim())) &&
      shape.box.w * shape.box.h < pageArea * 0.7 &&
      shape.box.w >= 12 &&
      shape.box.h >= 12,
  )
  for (const target of targets) {
    if (!target.text) continue
    let best: ShapeRenderNode | undefined
    let bestArea = Infinity
    for (const card of cards) {
      const xOverlap = Math.min(target.x + target.w, card.box.x + card.box.w) - Math.max(target.x, card.box.x)
      if (xOverlap < target.w * 0.55) continue
      if (target.y < card.box.y - 8 || target.y > card.box.y + card.box.h + 12) continue
      const area = card.box.w * card.box.h
      if (area < bestArea) {
        best = card
        bestArea = area
      }
    }
    if (!best) continue
    target.containerId = best.sourceId
    const spill = target.contentBottom + 8 - (best.box.y + best.box.h)
    if (spill > 6) target.spillPx = Math.round(spill)
    if (!targets.some((item) => item.id === best.sourceId)) {
      targets.push({
        id: best.sourceId,
        x: best.box.x,
        y: best.box.y,
        w: best.box.w,
        h: best.box.h,
        rotation: best.box.rotationDeg,
        text: '',
        fontPx: 16,
        filled: true,
        orphanPx: 0,
        spillPx: 0,
        contentBottom: best.box.y + best.box.h,
      })
    }
  }
  return targets.map(({ contentBottom: _contentBottom, ...target }) => target)
}

export function layoutActionQuestions(): Record<string, SystemOneQuestion> {
  return {
    action: {
      type: 'choice',
      instructions:
        'The state lists measured layout defects. Choose the smallest geometry correction. Do not restyle or rewrite the copy.',
      criteria: {
        leave: 'No correction is worth applying',
        widen: 'A line dropped only a few characters onto the next line; widen that text and its card',
        grow_container: 'Text hangs below the card, pill, or banner behind it; grow that shape',
        separate: 'Elements overlap; move the lower one just clear of the one above',
        both: 'Both a short wrapped tail and text outside its decorative shape need fixing',
      },
    },
  }
}

export function layoutActionState(slide: RenderSlide, issues: string[]): string {
  const targets = measureLayoutTargets(slide)
  const defects = targets.filter((target) => target.orphanPx > 0 || target.spillPx > 0)
  const lines = defects.map((target) => {
    const bits = [`text ${target.id} "${target.text.replace(/\n/g, ' / ')}"`]
    if (target.orphanPx) bits.push(`short wrapped tail ${target.orphanPx}px`)
    if (target.spillPx) bits.push(`extends ${target.spillPx}px below shape ${target.containerId}`)
    return `- ${bits.join('; ')}`
  })
  const audit = issues.length ? issues.slice(0, 6).map((issue) => `- ${issue}`).join('\n') : '- none'
  return `Canvas ${slide.widthPx}×${slide.heightPx}\nMeasured defects\n${lines.join('\n') || '- none'}\nGeometry audit\n${audit}`
}

export function readLayoutAction(answers: Record<string, SystemOneAnswer>): JevLayoutAction | null {
  const answer = answers.action
  if (!answer || answer.type !== 'choice' || !ACTIONS.has(answer.choice as JevLayoutAction)) return null
  const action = answer.choice as JevLayoutAction
  const probability = answer.probabilities?.[action] ?? 0
  if (action !== 'leave' && probability < 0.4 && (answer.confidence ?? 0) < 0.35) return 'leave'
  return action
}

function rightLimit(target: LayoutTarget, all: LayoutTarget[], pageWidth: number): number {
  let limit = pageWidth - 12
  for (const other of all) {
    if (other.id === target.id || other.id === target.containerId) continue
    const yOverlap = Math.min(target.y + target.h, other.y + other.h) - Math.max(target.y, other.y)
    if (yOverlap < 6) continue
    if (other.x >= target.x + target.w - 2) limit = Math.min(limit, other.x - 8)
  }
  return limit
}

/** Turn Jev's chosen action into box edits. Empty means that action has nothing to change. */
export function patchesForLayoutAction(
  targets: LayoutTarget[],
  action: JevLayoutAction,
  pageWidth: number,
  pageHeight: number,
): LayoutPatch[] {
  if (action === 'leave') return []
  const boxes = new Map(targets.map((target) => [target.id, { ...target }]))
  const patch = (id: string) => boxes.get(id)
  if (action === 'widen' || action === 'both') {
    for (const target of targets) {
      if (target.orphanPx <= 0) continue
      const box = patch(target.id)
      if (!box) continue
      const grow = Math.min(target.orphanPx + target.fontPx * 0.4, rightLimit(target, targets, pageWidth) - (box.x + box.w))
      if (grow < 4) continue
      box.w += grow
      const card = target.containerId ? patch(target.containerId) : undefined
      if (card) {
        const need = box.x + box.w + Math.max(8, target.x - card.x)
        const room = rightLimit(card, targets, pageWidth)
        card.w = Math.max(card.w, Math.min(need, room) - card.x)
      }
    }
  }
  if (action === 'grow_container' || action === 'both') {
    for (const target of targets) {
      if (target.spillPx <= 0 || !target.containerId) continue
      const card = patch(target.containerId)
      if (!card) continue
      const grow = Math.min(target.spillPx, pageHeight - 8 - (card.y + card.h))
      if (grow < 4) continue
      const oldBottom = card.y + card.h
      card.h += grow
      for (const other of boxes.values()) {
        if (other.id === card.id || other.id === target.id) continue
        const xOverlap = Math.min(card.x + card.w, other.x + other.w) - Math.max(card.x, other.x)
        if (xOverlap < 8 || other.y < oldBottom - 4) continue
        other.y = Math.min(other.y + grow, pageHeight - other.h - 4)
      }
    }
  }
  if (action === 'separate') {
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const a = patch(targets[i]!.id)!
        const b = patch(targets[j]!.id)!
        const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (xOverlap < 8 || yOverlap < 8) continue
        const lower = a.y >= b.y ? a : b
        lower.y = Math.min(lower.y + yOverlap + 8, pageHeight - lower.h - 4)
      }
    }
  }
  return [...boxes.values()]
    .filter((box) => {
      const original = targets.find((target) => target.id === box.id)!
      return box.x !== original.x || box.y !== original.y || box.w !== original.w || box.h !== original.h
    })
    .map((box) => ({ id: box.id, x: box.x, y: box.y, w: box.w, h: box.h, rotation: box.rotation }))
}

export function describeLayoutAction(action: JevLayoutAction): string {
  switch (action) {
    case 'widen':
      return '加宽了行尾被挤到下一行的文字'
    case 'grow_container':
      return '把文字收回了装饰块里面'
    case 'separate':
      return '分开了重叠的元素'
    case 'both':
      return '加宽了行尾，并把文字收回装饰块'
    default:
      return '保持原样'
  }
}

export type LayoutJudgement =
  | { status: 'unavailable' }
  | { status: 'skip' }
  | { status: 'vision' }
  | { status: 'apply'; action: JevLayoutAction; ops: LayoutPatch[] }

/**
 * Jev picks the layout correction. Code applies that choice directly.
 * A failed call is `unavailable` so the existing visual check can still run.
 */
export async function judgeGeneratedLayout(
  slide: RenderSlide,
  issues: string[],
  ask: (state: string, questions: Record<string, SystemOneQuestion>) => Promise<SystemOneResponse>,
): Promise<LayoutJudgement> {
  const targets = measureLayoutTargets(slide)
  const hasDefect = targets.some((target) => target.orphanPx > 0 || target.spillPx > 0) || issues.length > 0
  if (!hasDefect) return { status: 'skip' }
  let response: SystemOneResponse
  try {
    response = await ask(layoutActionState(slide, issues), layoutActionQuestions())
  } catch {
    return { status: 'unavailable' }
  }
  if (!response.ok) return { status: 'unavailable' }
  const action = readLayoutAction(response.answers)
  if (!action || action === 'leave') return { status: 'skip' }
  const ops = patchesForLayoutAction(targets, action, slide.widthPx, slide.heightPx)
  if (!ops.length) return { status: 'vision' }
  return { status: 'apply', action, ops }
}
