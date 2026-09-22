import { expect, it } from 'vitest'
import { stemLeaves, stemLeafLines } from './stem-leaf'

it('wraps dense stems without losing or duplicating observations', () => {
  const lines = stemLeafLines(stemLeaves(Array(500).fill(12)))
  expect(lines).toHaveLength(25)
  expect(lines.every((line) => line.startsWith('1 | '))).toBe(true)
  expect(lines.flatMap((line) => line.split(' | ')[1]!.split(' '))).toHaveLength(500)
})

it('preserves sign, duplicates and integer samples in numerical order', () => {
  expect(stemLeaves([23, -3, 11, -12, 11, 0, null, -19])).toEqual([
    { stem: '-1', leaves: [9, 2] },
    { stem: '-0', leaves: [3] },
    { stem: '0', leaves: [0] },
    { stem: '1', leaves: [1, 1] },
    { stem: '2', leaves: [3] },
  ])
})
it('rejects fractional samples rather than discarding precision', () => {
  expect(() => stemLeaves([1.5])).toThrow('整数')
  expect(() => stemLeaves([null])).toThrow()
})
