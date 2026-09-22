import { expect, it } from 'vitest'
import { interactiveChartOption } from './interactive'
import { buildChartOption } from './render'

const base = {
  x: 'category',
  y: ['value'],
  table: {
    columns: ['category', 'value'],
    rows: [
      ['a', 1],
      ['b', 2],
    ],
  },
}

it('adds range controls along the category axis without filtering away observations', () => {
  expect(interactiveChartOption({ ...base, chartId: 'column' }).dataZoom).toMatchObject([
    { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
    { type: 'slider', xAxisIndex: 0 },
  ])
  expect(interactiveChartOption({ ...base, chartId: 'bar' }).dataZoom).toMatchObject([
    { type: 'inside', yAxisIndex: 0 },
    { type: 'slider', yAxisIndex: 0 },
  ])
  expect(buildChartOption({ ...base, chartId: 'column' }).dataZoom).toBeUndefined()
})

it('leaves non-Cartesian graphics without misleading axis controls', () => {
  expect(interactiveChartOption({ ...base, chartId: 'pie' }).dataZoom).toBeUndefined()
})

it('zooms time rather than task categories for interval and event timelines', () => {
  const table = {
    columns: ['task', 'start', 'end'],
    rows: [
      ['a', 1, 5],
      ['b', 3, 8],
    ],
  }
  for (const chartId of ['gantt', 'timeline']) {
    const option = interactiveChartOption({
      chartId,
      table,
      x: 'task',
      y: chartId === 'gantt' ? ['start', 'end'] : ['start'],
    })
    expect(option.dataZoom).toMatchObject([{ xAxisIndex: 0 }, { xAxisIndex: 0 }])
  }
})
