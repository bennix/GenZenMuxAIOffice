import { expect, it } from 'vitest'
import { buildChartOption, renderChartSvg } from './render'

it('clips intervals at the visible plot boundary and hides outside milestones', () => {
  const option = buildChartOption({
    chartId: 'gantt',
    x: 'task',
    y: ['start', 'end'],
    table: { columns: ['task', 'start', 'end'], rows: [['a', 0, 10]] },
  })
  const series = (
    option.series as unknown as {
      renderItem(
        params: object,
        api: object,
      ): { shape: { x: number; width: number }; invisible?: boolean } | undefined
    }[]
  )[0]!
  const draw = (start: number, end: number) =>
    series.renderItem(
      { coordSys: { x: 100, y: 0, width: 200, height: 600 } },
      {
        value: (dim: number) => (dim === 1 ? start : dim === 2 ? end : 0),
        coord: ([x]: number[]) => [x, 100],
        getHeight: () => 600,
      },
    )
  expect(draw(50, 400)?.shape).toMatchObject({ x: 100, width: 200 })
  expect(draw(0, 20)).toBeUndefined()
  expect(draw(50, 50)?.invisible).toBe(true)
  expect(draw(200, 200)?.invisible).toBe(false)
})

it('accepts civil date intervals and rejects mixed units and impossible dates', () => {
  const request = {
    chartId: 'gantt',
    x: 'task',
    y: ['start', 'end'],
    table: { columns: ['task', 'start', 'end'], rows: [['a', '2024-02-29', '2024-03-02']] },
  }
  const option = buildChartOption(request)
  expect(option.xAxis).toMatchObject({ type: 'time' })
  expect(option.series).toMatchObject([
    { data: [[0, Date.UTC(2024, 1, 29), Date.UTC(2024, 2, 2)]] },
  ])
  expect(() =>
    buildChartOption({ ...request, table: { ...request.table, rows: [['a', '2024-02-29', 3]] } }),
  ).toThrow('混用')
  expect(() =>
    buildChartOption({
      ...request,
      table: { ...request.table, rows: [['a', '2023-02-29', '2023-03-02']] },
    }),
  ).toThrow('无效')
})

it('preserves task intervals and rejects reversed time', () => {
  const request = {
    chartId: 'gantt',
    x: 'task',
    y: ['start', 'end'],
    table: {
      columns: ['task', 'start', 'end'],
      rows: [
        ['开发', 2, 8],
        ['发布', 10, 10],
      ],
    },
  }
  expect(buildChartOption(request).series).toMatchObject([
    {
      data: [
        [0, 2, 8],
        [1, 10, 10],
      ],
    },
  ])
  expect(renderChartSvg(request)).toContain('开发')
  expect(() =>
    buildChartOption({ ...request, table: { ...request.table, rows: [['bad', 5, 1]] } }),
  ).toThrow('早于')
})
