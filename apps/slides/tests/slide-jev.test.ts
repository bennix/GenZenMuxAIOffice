import { describe, expect, it } from 'vitest'
import {
  judgeGeneratedLayout,
  proposeLayoutPlan,
  shouldApplyLayoutFix,
} from '../src/renderer/ai/slide-jev'

describe('slide layout judgement', () => {
  it('proposes a widen when the only measured defect is overflow', () => {
    const plan = proposeLayoutPlan([
      'Text overflow: t1"提出" content exceeds the box height by 28px',
    ])
    expect(plan.approach).toBe('widen')
  })

  it('leaves a page with no measured defect', () => {
    expect(proposeLayoutPlan([]).approach).toBe('leave')
  })

  it('skips a change Jev is not sure about', () => {
    expect(
      shouldApplyLayoutFix('widen', { needs_change: { noul: 0.4 }, plan_ok: { noul: 0.9 } }),
    ).toMatchObject({ apply: false, rejected: false })
  })

  it('rejects a fix plan Jev finds unreasonable', () => {
    expect(
      shouldApplyLayoutFix('widen', { needs_change: { noul: 0.9 }, plan_ok: { noul: 0.2 } }),
    ).toMatchObject({ apply: false, rejected: true })
  })

  it('applies a fix Jev says is needed and reasonable', () => {
    expect(
      shouldApplyLayoutFix('widen', { needs_change: { noul: 0.8 }, plan_ok: { noul: 0.7 } }),
    ).toMatchObject({ apply: true, rejected: false, vision: false })
  })

  it('asks for one judgement and applies only when both answers clear the bar', async () => {
    const seen: string[] = []
    const result = await judgeGeneratedLayout(
      ['Text overflow: box short by 20px'],
      'Canvas 1280×720',
      async (state) => {
        seen.push(state)
        return {
          ok: true,
          model: 'typesafe/jev-1.13',
          answers: {
            needs_change: { type: 'noul', noul: 0.91 },
            plan_ok: { type: 'noul', noul: 0.8 },
          },
        }
      },
    )
    expect(seen[0]).toContain('Proposed fix')
    expect(result).toMatchObject({ status: 'apply' })
  })

  it('treats a failed Jev call as unavailable so layout check can continue', async () => {
    const result = await judgeGeneratedLayout(['Overlap: a and b'], 'Canvas', async () => ({
      ok: false,
      error: 'offline',
    }))
    expect(result.status).toBe('unavailable')
  })
})
