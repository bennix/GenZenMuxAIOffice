import { expect, it } from 'vitest'
import { horizonData, assertHorizonSize } from './horizon'
import { buildChartOption, renderChartSvg } from './render'

it('splits zero and band crossings before folding signed values', () => {
  const data = horizonData([6, 0], [[3, -3]])
  expect(data.band).toBe(1)
  expect(data.series[0]).toHaveLength(7)
  data.series[0]!.forEach(([x, y], i) => {
    expect(x).toBeCloseTo(i)
    expect(y).toBe(i - 3)
  })
  const option = buildChartOption({
    chartId: 'horizon',
    x: 'time',
    y: ['value'],
    table: {
      columns: ['time', 'value'],
      rows: [
        [0, -3],
        [6, 3],
      ],
    },
  })
  const series = option.series as any[]
  expect(series).toHaveLength(6)
  for (let point = 0; point < 7; point++) {
    const positive = series.slice(0, 3).reduce((sum, s) => sum + s.data[point][1], 0)
    const negative = series.slice(3).reduce((sum, s) => sum + s.data[point][1], 0)
    expect(positive - negative).toBe(point - 3)
  }
})
it('shares a band scale across series, preserves gaps and parses dates strictly', () => {
  const data = horizonData(
    ['2026-01-03', '2026-01-01', '2026-01-02'],
    [
      [3, -3, null],
      [9, 0, 0],
    ],
  )
  expect(data.band).toBe(3)
  expect(data.dates).toBe(true)
  expect(data.series[0]!.map((p) => p[1])).toEqual([-3, null, 3])
  expect(horizonData([0, 1], [[0, 0]]).series[0]).toEqual([
    [0, 0],
    [1, 0],
  ])
  expect(() => horizonData([1, 1], [[2, 3]])).toThrow('重复')
  expect(() => horizonData(['2026-02-30', '2026-03-01'], [[2, 3]])).toThrow()
  expect(() => horizonData([0, 1], [[null, null]])).toThrow('全部缺失')
})
it('keeps extreme signed values finite when interpolating', () => {
  const data = horizonData([0, 1], [[-1e308, 1e308]])
  expect(
    data.series[0]!.every((point) => point.every((v) => v !== null && Number.isFinite(v))),
  ).toBe(true)
})
it('exports a folded chart with explicit sign and band legends', () => {
  expect(() => assertHorizonSize(600, 600, 1)).toThrow('画布过小')
  expect(() => assertHorizonSize(960, 300, 6)).toThrow('画布过小')
  const svg = renderChartSvg({
    chartId: 'horizon',
    title: '盈亏变化',
    x: '时间',
    y: ['盈亏'],
    table: {
      columns: ['时间', '盈亏'],
      rows: [
        [0, -3],
        [1, null],
        [2, 1],
        [3, 3],
      ],
    },
  })
  for (const text of ['盈亏变化', '负值向上折叠', '正 0–1', '负 2–3']) expect(svg).toContain(text)
  expect(svg).not.toMatch(/NaN|Infinity/)
})
