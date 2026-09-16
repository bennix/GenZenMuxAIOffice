import { expect, it } from 'vitest'
import { contourGrid } from './contour'
import { renderChartSvg } from './render'

it('interpolates a known plane on a nonuniform rectangular grid without extrapolation', () => {
  const samples = [0, 1, 4].flatMap((x) => [0, 2, 3].map((y) => [x, y, x + 2 * y] as const))
  const result = contourGrid(samples, [1, 3, 5, 7])
  for (const segment of result.segments)
    for (const [x, y] of [segment.start, segment.end]) {
      expect(x + 2 * y).toBeCloseTo(segment.level, 12)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(4)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(3)
    }
  expect(contourGrid([...samples].reverse(), [1, 3, 5, 7])).toEqual(result)
})
it('uses a saddle decider and preserves an exact crossing at the bilinear saddle', () => {
  const saddle = (high: number, low: number) =>
    contourGrid(
      [
        [0, 0, high],
        [1, 0, low],
        [1, 1, high],
        [0, 1, low],
      ],
      [0],
    ).segments
  const positive = saddle(2, -1)
  expect(positive).toHaveLength(2)
  expect(positive[0]!.start[1]).toBe(0)
  expect(positive[0]!.end[0]).toBe(1)
  const negative = saddle(1, -2)
  expect(negative[0]!.start[1]).toBe(0)
  expect(negative[0]!.end[0]).toBe(0)
  const exact = saddle(1, -1)
  expect(exact).toHaveLength(4)
  expect(exact.every((line) => line.end[0] === 0.5 && line.end[1] === 0.5)).toBe(true)
})
it('produces closed interior contours for a hill and no invented boundary rings', () => {
  const samples = [-2, -1, 0, 1, 2].flatMap((x) =>
    [-2, -1, 0, 1, 2].map((y) => [x, y, 4 - x * x - y * y] as const),
  )
  for (const level of [1, 3]) {
    const { segments } = contourGrid(samples, [level])
    expect(segments.length).toBeGreaterThan(0)
    const degrees = new Map<string, number>()
    for (const segment of segments)
      for (const p of [segment.start, segment.end]) {
        const key = p.map((v) => v.toFixed(9)).join(',')
        degrees.set(key, (degrees.get(key) ?? 0) + 1)
      }
    expect([...degrees.values()].every((degree) => degree === 2)).toBe(true)
  }
})
it('rejects missing, duplicate, flat or incomplete data', () => {
  expect(() =>
    contourGrid([
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 2],
      [0, 1, 3],
    ]),
  ).toThrow('重复')
  expect(() =>
    contourGrid([
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 2],
      [1, 2, 3],
    ]),
  ).toThrow('完整矩形')
  expect(() =>
    contourGrid([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ]),
  ).toThrow('全部相同')
  expect(() =>
    contourGrid([
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 2],
      [1, 1, NaN],
    ]),
  ).toThrow('有限')
})
it('exports actual isolines with their Z levels and field names', () => {
  const svg = renderChartSvg({
    chartId: 'contour',
    x: '经度',
    y: ['纬度', '高度'],
    title: '等高线示例',
    table: {
      columns: ['经度', '纬度', '高度'],
      rows: [
        [0, 0, 0],
        [1, 0, 2],
        [0, 1, 2],
        [1, 1, 4],
      ],
    },
  })
  for (const text of ['等高线示例', '经度', '纬度', '高度等值线']) expect(svg).toContain(text)
  expect(svg).not.toMatch(/NaN|Infinity/)
})
