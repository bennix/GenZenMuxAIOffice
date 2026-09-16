import { expect, it } from 'vitest'
import { waterfallSteps } from './waterfall'
it('keeps signed cumulative endpoints when crossing zero', () => {
  expect(waterfallSteps([5, -8, 4])).toEqual([
    { start: 0, end: 5, change: 5 },
    { start: 5, end: -3, change: -8 },
    { start: -3, end: 1, change: 4 },
  ])
  expect(() => waterfallSteps([NaN])).toThrow()
})
