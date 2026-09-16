import { expect, it } from 'vitest'
import { pyramidBands } from './pyramid'
it('allocates trapezoid area rather than height according to each value', () => {
  const bands = pyramidBands([1, 3, 0, 6])
  expect(bands[0]!.top).toBe(0)
  expect(bands[3]!.bottom).toBe(1)
  bands.forEach((band) => expect(band.bottom ** 2 - band.top ** 2).toBeCloseTo(band.share))
  expect(bands[2]!.top).toBe(bands[2]!.bottom)
  expect(() => pyramidBands([0])).toThrow('正数')
  expect(() => pyramidBands([-1, 2])).toThrow('非负')
})
