import { expect, it } from 'vitest'
import { jitterPoints } from './jitter'
import { renderChartSvg } from './render'

it('preserves sample values and source indices with reproducible bounded offsets', () => {
  const samples = [2, 2, null, -1, 2]
  const points = jitterPoints(samples, 3)
  expect(points).toEqual(jitterPoints(samples, 3))
  expect(points.map((point) => point.slice(1))).toEqual([
    [2, 0],
    [2, 1],
    [-1, 3],
    [2, 4],
  ])
  expect(points.every((point) => point[0] >= 2.65 && point[0] < 3.35)).toBe(true)
  expect(new Set(points.map((point) => point[0])).size).toBe(4)
  expect(() => jitterPoints([Infinity], 0)).toThrow('有限')
  expect(
    renderChartSvg({
      chartId: 'jitter',
      x: 'id',
      y: ['样本组'],
      table: {
        columns: ['id', '样本组'],
        rows: [
          [1, 3],
          [2, 3],
        ],
      },
    }),
  ).toContain('样本组')
})
