import { expect, it } from 'vitest'
import { boxSummary, histogram, kernelDensity, pearson, quantile } from './statistics'

it('uses interpolated quantiles and Tukey whiskers without mutating samples', () => {
  const values = [100, 4, 3, 2, 1]
  expect(boxSummary(values)).toEqual({ min: 1, q1: 2, median: 3, q3: 4, max: 4, outliers: [100] })
  expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
  expect(values[0]).toBe(100)
})

it('assigns boundary observations exactly once including the maximum', () => {
  expect(histogram([0, 1, 2, 3, 4], 2)).toEqual([
    { lower: 0, upper: 2, count: 2 },
    { lower: 2, upper: 4, count: 3 },
  ])
  expect(histogram([7, 7, 7])[0]!.count).toBe(3)
  expect(() => histogram([1, 2], 0)).toThrow()
})

it('estimates a normalized density and handles constant samples', () => {
  const density = kernelDensity([-2, -1, 0, 1, 2], 512)
  const dx = density[1]!.x - density[0]!.x
  const area = density.reduce((sum, p) => sum + p.density * dx, 0)
  expect(area).toBeGreaterThan(0.99)
  expect(area).toBeLessThan(1.01)
  expect(kernelDensity([0, 0]).every((p) => Number.isFinite(p.density))).toBe(true)
})

it('preserves paired observations and reports undefined constant correlation', () => {
  expect(pearson([3, 1, 2], [1, 3, 2])).toBeCloseTo(-1)
  expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
  expect(pearson([1, 1], [1, 2])).toBeNull()
  expect(() => pearson([1, 2], [1])).toThrow()
})
