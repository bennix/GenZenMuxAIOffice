import { describe, expect, it } from 'vitest'
import type { RenderSlide } from '@genoffice/pptx-render'
import {
  judgeGeneratedLayout,
  measureLayoutTargets,
  patchesForLayoutAction,
  proposeLayoutPlan,
  readLayoutAction,
  shouldApplyLayoutFix,
} from '../src/renderer/ai/slide-jev'

function wrappedSlide(): RenderSlide {
  const box = (x: number, y: number, w: number, h: number) => ({
    x,
    y,
    w,
    h,
    rotationDeg: 0,
    flipH: false,
    flipV: false,
    centerX: x + w / 2,
    centerY: y + h / 2,
  })
  return {
    widthPx: 1280,
    heightPx: 720,
    nodes: [
      {
        id: 'card',
        sourceId: 'card',
        type: 'shape',
        box: box(40, 40, 220, 90),
        fill: { kind: 'solid', color: '#ffffff' },
      },
      {
        id: 'line',
        sourceId: 'line',
        type: 'text',
        box: box(56, 52, 180, 68),
        fill: { kind: 'none' },
        text: {
          lines: [
            {
              runs: [{ text: '提出每换一人改', widthPx: 168, fontSizePx: 28, x: 0, baselineY: 24, fontFamily: 'sans', color: '#111', bold: false, italic: false, underline: false }],
              top: 0,
              height: 32,
              paraStart: true,
            },
            {
              runs: [{ text: '代码', widthPx: 56, fontSizePx: 28, x: 0, baselineY: 56, fontFamily: 'sans', color: '#111', bold: false, italic: false, underline: false }],
              top: 32,
              height: 32,
              paraStart: false,
            },
          ],
          insets: { l: 0, t: 0, r: 0, b: 0 },
          anchor: 'top',
          fontScale: 1,
          contentHeight: 64,
          wrap: true,
        },
      },
    ],
  } as RenderSlide
}

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

  it('lets Jev choose widen and applies that choice to the text box', async () => {
    const slide = wrappedSlide()
    const targets = measureLayoutTargets(slide)
    expect(targets.find((target) => target.id === 'line')?.orphanPx).toBeGreaterThan(0)
    const seen: string[] = []
    const result = await judgeGeneratedLayout(slide, [], async (state) => {
      seen.push(state)
      return {
        ok: true,
        model: 'typesafe/jev-1.13',
        answers: {
          action: {
            type: 'choice',
            choice: 'widen',
            probabilities: { leave: 0.05, widen: 0.9, grow_container: 0.02, separate: 0.01, both: 0.02 },
            confidence: 0.8,
          },
        },
      }
    })
    expect(seen[0]).toContain('short wrapped tail')
    expect(result.status).toBe('apply')
    if (result.status === 'apply') {
      expect(result.action).toBe('widen')
      expect(result.ops.find((op) => op.id === 'line')!.w).toBeGreaterThan(180)
    }
    expect(readLayoutAction({ action: { type: 'choice', choice: 'leave', probabilities: { leave: 0.8 } } })).toBe(
      'leave',
    )
    const widened = patchesForLayoutAction(targets, 'widen', 1280, 720)
    expect(widened.some((op) => op.id === 'line')).toBe(true)
  })

  it('treats a failed Jev call as unavailable so layout check can continue', async () => {
    const result = await judgeGeneratedLayout(wrappedSlide(), ['Overlap: a and b'], async () => ({
      ok: false,
      error: 'offline',
    }))
    expect(result.status).toBe('unavailable')
  })
})
