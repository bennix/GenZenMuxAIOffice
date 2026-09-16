import { expect, it } from 'vitest'
import { residualPoints, sampleQq } from './diagnostics'

it('computes signed residuals while retaining source row indices', () => {
  expect(residualPoints([10, 5, null, 8], [8, 7, 2, null])).toEqual([
    [8, 2, 0],
    [7, -2, 1],
  ])
  expect(() => residualPoints([null, 2], [1, null])).toThrow('配对')
  expect(() => residualPoints([1e308], [-1e308])).toThrow('有限')
})
it('compares independent distributions using interpolated quantiles', () => {
  expect(sampleQq([20, 0, 10, null], [25, 5])).toEqual([
    [5, 10, 0.25],
    [15, 20, 0.75],
  ])
  expect(sampleQq([3, 3, 3], [3, 3])).toEqual([
    [3, 3, 0.25],
    [3, 3, 0.75],
  ])
  expect(() => sampleQq([1], [2, 3])).toThrow('两个')
})
