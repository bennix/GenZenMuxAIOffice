import { expect, it } from 'vitest'
import { hexAddress, hexBins } from './hexbin'
import { buildChartOption, renderChartSvg } from './render'

it('assigns lattice centers and boundary neighbours using cube rounding', () => {
  for (let q = -8; q < 8; q++)
    for (let r = -8; r < 8; r++) {
      const actual = hexAddress(0.04 * Math.sqrt(3) * (q + r / 2), 0.06 * r)
      expect(actual.map((n) => n || 0)).toEqual([q || 0, r || 0])
    }
  const boundary = (Math.sqrt(3) * 0.04) / 2
  expect(hexAddress(boundary - 1e-8, 0)[0]).toBe(0)
  expect(hexAddress(boundary + 1e-8, 0)[0]).toBe(1)
})
it('conserves observations including duplicates and puts every point inside its hexagon', () => {
  const points: [number, number][] = Array.from({ length: 10000 }, (_, i) => [
    ((i * 71) % 1000) / 10 - 50,
    ((i * 193) % 997) / 20 - 25,
  ])
  points.push(...Array.from({ length: 7 }, () => [0, 0] as [number, number]))
  const result = hexBins(points)
  expect(result.bins.reduce((sum, b) => sum + b.count, 0)).toBe(points.length)
  expect(result.bins.length).toBeLessThan(1000)
  for (const p of points.slice(0, 100)) {
    expect(
      result.bins.some((b) =>
        b.vertices.every((a, i) => {
          const next = b.vertices[(i + 1) % 6]!
          return (next[0] - a[0]) * (p[1] - a[1]) - (next[1] - a[1]) * (p[0] - a[0]) >= -1e-8
        }),
      ),
    ).toBe(true)
  }
  expect(hexBins([...points].reverse())).toEqual(result)
  expect(
    hexBins([
      [3, 5],
      [3, 5],
    ]).bins[0]!.count,
  ).toBe(2)
})
it('rejects missing coordinates, multiple Y fields and overflowing ranges', () => {
  const base = {
    chartId: 'hexbin',
    x: 'x',
    y: ['y'],
    table: {
      columns: ['x', 'y'],
      rows: [
        [1, 2],
        [2, null],
      ],
    },
  }
  expect(() => buildChartOption(base)).toThrow('完整')
  expect(() => buildChartOption({ ...base, y: ['x', 'y'] })).toThrow('一个')
  expect(() =>
    hexBins([
      [-1e308, 0],
      [1e308, 1],
    ]),
  ).toThrow('范围')
  expect(() =>
    hexBins([
      [0, 0],
      [Number.MIN_VALUE, 1],
    ]),
  ).toThrow('精度')
})
it('exports count-encoded hexagons with real coordinate axes', () => {
  const svg = renderChartSvg({
    chartId: 'hexbin',
    x: '长度',
    y: ['重量'],
    table: {
      columns: ['长度', '重量'],
      rows: [
        [-10, 20],
        [-10, 20],
        [30, 40],
      ],
    },
  })
  for (const text of ['长度', '重量', '2 条观测', '共 3 条']) expect(svg).toContain(text)
  expect(svg).not.toMatch(/NaN|Infinity/)
})
