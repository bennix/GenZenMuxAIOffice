import { expect, it } from 'vitest'
import { buildChartOption } from './render'
const request = {
  chartId: 'progress',
  x: 'name',
  y: ['done', 'target'],
  table: {
    columns: ['name', 'done', 'target'],
    rows: [
      ['甲', 25, 50],
      ['乙', 120, 100],
      ['丙', 0, 10],
    ],
  },
}
it('preserves overachievement instead of clamping to 100 percent', () => {
  const option = buildChartOption(request)
  expect(option.series).toMatchObject([{ data: [50, 120, 0] }])
  expect(option.xAxis).toMatchObject({ min: 0, max: 120 })
  expect(() =>
    buildChartOption({ ...request, table: { ...request.table, rows: [['甲', 1, 0]] } }),
  ).toThrow('大于零')
})
