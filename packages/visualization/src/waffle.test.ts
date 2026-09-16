import { expect, it } from 'vitest'
import { waffleAllocation } from './waffle'
it('allocates exactly 100 cells with deterministic largest remainders', () => {
  expect(waffleAllocation([1, 1, 1]).counts).toEqual([34, 33, 33])
  expect(waffleAllocation([0, 1, 3]).counts).toEqual([0, 25, 75])
  const result = waffleAllocation([0.001, 100])
  expect(result.counts).toEqual([0, 100])
  expect(result.shares[0]).toBeGreaterThan(0)
  expect(() => waffleAllocation([0, 0])).toThrow('正数')
  expect(() => waffleAllocation([-1, 2])).toThrow('非负')
})
