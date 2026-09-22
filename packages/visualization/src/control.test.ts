import { expect, it } from 'vitest'
import { individualsControl } from './control'

it('estimates individual chart limits from adjacent moving ranges', () => {
  const limits = individualsControl([1, 2, 3, 4])
  expect(limits.center).toBe(2.5)
  expect(limits.movingRange).toBe(1)
  expect(limits.upper).toBeCloseTo(2.5 + 3 / 1.128)
  expect(limits.lower).toBeCloseTo(2.5 - 3 / 1.128)
  expect(limits.outside).toEqual([])
})
it('flags isolated excursions and handles constant observations', () => {
  expect(individualsControl([...Array(20).fill(0), 20]).outside).toEqual([20])
  expect(individualsControl([5, 5, 5])).toMatchObject({
    center: 5,
    lower: 5,
    upper: 5,
    outside: [],
  })
  expect(() => individualsControl([1, 2])).toThrow('三个')
  expect(() => individualsControl([1, NaN, 2])).toThrow('有限')
})
