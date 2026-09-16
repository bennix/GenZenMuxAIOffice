import { expect, it } from 'vitest'
import { buildChartOption } from './render'
import { interactiveChartOption } from './interactive'

it('uses a compact axis-free line preserving missing samples and observed values', () => {
  const request = {
    chartId: 'sparkline',
    x: 'day',
    y: ['value'],
    table: {
      columns: ['day', 'value'],
      rows: [
        ['a', 101],
        ['b', null],
        ['c', 103],
      ],
    },
  }
  const option = buildChartOption(request)
  expect(option.xAxis).toMatchObject({ show: false, data: ['a', 'b', 'c'] })
  expect(option.yAxis).toMatchObject({ show: false, scale: true })
  expect(option.legend).toMatchObject({ show: false })
  expect(option.grid).toMatchObject({ top: 12, bottom: 12 })
  expect(option.series).toMatchObject([
    { data: [101, null, 103], connectNulls: false, showSymbol: false },
  ])
  expect(interactiveChartOption(request).dataZoom).toBeUndefined()
})
