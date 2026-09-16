import { expect, it } from 'vitest'
import { buildChartOption } from './render'

it('places events at actual UTC dates, preserving nonuniform intervals and row identity', () => {
  const option = buildChartOption({
    chartId: 'timeline',
    x: 'event',
    y: ['date'],
    table: {
      columns: ['event', 'date'],
      rows: [
        ['启动', '2024-01-01'],
        ['评审', '2024-01-02'],
        ['发布', '2024-02-01'],
      ],
    },
  })
  expect(option.xAxis).toMatchObject({ type: 'time' })
  expect(option.series).toMatchObject([
    {
      data: [
        { name: '启动', value: [Date.UTC(2024, 0, 1), 0] },
        { name: '评审', value: [Date.UTC(2024, 0, 2), 1] },
        { name: '发布', value: [Date.UTC(2024, 1, 1), 2] },
      ],
    },
  ])
})
