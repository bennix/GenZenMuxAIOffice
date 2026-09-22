import type { SystemOneQuestion, SystemOneResponse } from '@genoffice/ai-provider'

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

export type LayoutJudgement =
  | { status: 'unavailable' }
  | { status: 'skip' }
  | { status: 'rejected'; plan: string }
  | { status: 'apply'; plan: string }

/**
 * Ask Jev, in one call, whether the page should change and whether the
 * code-proposed fix is reasonable. A failed call is `unavailable` so the
 * existing layout check can still run.
 */
export async function judgeGeneratedLayout(
  issues: string[],
  dump: string,
  ask: (state: string, questions: Record<string, SystemOneQuestion>) => Promise<SystemOneResponse>,
): Promise<LayoutJudgement> {
  const proposal = proposeLayoutPlan(issues)
  let response: SystemOneResponse
  try {
    response = await ask(
      layoutJudgementState(dump, issues, proposal.plan),
      layoutJudgementQuestions(),
    )
  } catch {
    return { status: 'unavailable' }
  }
  if (!response.ok) return { status: 'unavailable' }
  const decision = shouldApplyLayoutFix(proposal.approach, response.answers)
  if (!decision.apply) {
    return decision.rejected ? { status: 'rejected', plan: proposal.plan } : { status: 'skip' }
  }
  return { status: 'apply', plan: decision.vision ? VISION_PLAN : proposal.plan }
}
