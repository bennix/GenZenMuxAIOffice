import { describe, expect, it } from 'vitest'
import { normalizeRegionRect } from '../src/renderer/ai/region-context'

describe('PDF AI page-region selection', () => {
  it('normalizes a reverse drag into a positive rectangle', () => {
    expect(normalizeRegionRect(90, 80, 10, 20, 100, 100)).toEqual({
      left: 10,
      top: 20,
      width: 80,
      height: 60,
    })
  })

  it('clamps both drag ends to the page bounds', () => {
    expect(normalizeRegionRect(-20, 10, 140, 120, 100, 80)).toEqual({
      left: 0,
      top: 10,
      width: 100,
      height: 70,
    })
  })

  it('preserves a click as a zero-area selection for rejection by the UI', () => {
    expect(normalizeRegionRect(30, 40, 30, 40, 100, 100)).toEqual({
      left: 30,
      top: 40,
      width: 0,
      height: 0,
    })
  })
})
