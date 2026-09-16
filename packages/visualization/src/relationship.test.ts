import { expect, it } from 'vitest'
import { buildChartOption, renderChartSvg } from './render'

it('uses bubble area, preserves coordinates, and omits incomplete observations', () => {
  const request = {
    chartId: 'bubble',
    x: 'x',
    y: ['y', 'size'],
    table: {
      columns: ['x', 'y', 'size'],
      rows: [
        [-3, 8, 1],
        [4, -2, 4],
        [7, null, 9],
        [null, 2, 9],
        [2, 4, 0],
      ],
    },
  }
  const option = buildChartOption(request)
  const [series] = option.series as unknown as {
    data: number[][]
    symbolSize: (point: number[]) => number
  }[]
  expect(series!.data).toEqual([
    [-3, 8, 1],
    [4, -2, 4],
    [2, 4, 0],
  ])
  expect(series!.symbolSize([-3, 8, 1])).toBe(30)
  expect(series!.symbolSize([4, -2, 4])).toBe(60)
  expect(series!.symbolSize([2, 4, 0])).toBe(0)
  expect(renderChartSvg(request)).not.toMatch(/NaN|Infinity/)
  expect(() =>
    buildChartOption({ ...request, table: { ...request.table, rows: [[1, 2, -1]] } }),
  ).toThrow('非负')
  expect(() =>
    buildChartOption({
      ...request,
      table: {
        ...request.table,
        rows: [
          [1, null, 2],
          [null, 3, 4],
        ],
      },
    }),
  ).toThrow('成对')
})

it('shows all four zero-centered quadrants even for positive-only observations', () => {
  const option = buildChartOption({
    chartId: 'quadrant',
    x: 'x',
    y: ['y'],
    table: {
      columns: ['x', 'y'],
      rows: [
        [2, 8],
        [4, 3],
      ],
    },
  })
  expect(option.xAxis).toMatchObject({ min: -4, max: 4 })
  expect(option.yAxis).toMatchObject({ min: -8, max: 8 })
  expect(JSON.stringify(option.series)).toContain('横轴分界：0')
})

it('mirrors population counts on a common scale without displaying negative counts', () => {
  const request = {
    chartId: 'population-pyramid',
    x: 'age',
    y: ['left', 'right'],
    table: {
      columns: ['age', 'left', 'right'],
      rows: [
        ['0–9', 10, 20],
        ['10–19', 30, 15],
      ],
    },
  }
  const option = buildChartOption(request)
  expect(option.xAxis).toMatchObject({ min: -30, max: 30 })
  const series = option.series as unknown as {
    data: number[]
    tooltip: { valueFormatter: (n: number) => string }
  }[]
  expect(series[0]!.data).toEqual([-10, -30])
  expect(series[1]!.data).toEqual([20, 15])
  expect(series[0]!.tooltip.valueFormatter(-30)).toBe('30')
  expect(renderChartSvg(request)).toContain('0–9')
  expect(() =>
    buildChartOption({ ...request, table: { ...request.table, rows: [['0–9', -1, 2]] } }),
  ).toThrow('非负')
})
