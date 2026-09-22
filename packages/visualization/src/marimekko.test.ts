import { expect, it } from 'vitest'
import { marimekkoCells } from './marimekko'
it('makes rectangle area proportional to total value', () => {
  const cells = marimekkoCells([
    [1, 3],
    [2, 2],
    [0, 0],
  ])
  for (const cell of cells) expect(cell.width * cell.height).toBeCloseTo(cell.value / 8)
  expect(cells[0]).toMatchObject({ left: 0, width: 0.5, height: 0.25 })
  expect(cells[2]).toMatchObject({ left: 0.5, width: 0.5, height: 0.5 })
  expect(cells[4]!.width).toBe(0)
  expect(() => marimekkoCells([[0, 0]])).toThrow('正数')
  expect(() => marimekkoCells([[1, -1]])).toThrow('非负')
})
