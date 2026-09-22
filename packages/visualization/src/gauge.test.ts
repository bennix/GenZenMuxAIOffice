import { expect, it } from 'vitest'
import { buildChartOption, renderChartSvg } from './render'
const request = {
  chartId: 'gauge',
  x: 'metric',
  y: ['value', 'min', 'max'],
  table: { columns: ['metric', 'value', 'min', 'max'], rows: [['温度', -10, -30, 50]] },
}
it('uses the supplied range and actual value rather than assuming percentages', () => {
  expect(buildChartOption(request).series).toMatchObject([
    { type: 'gauge', min: -30, max: 50, data: [{ value: -10, name: '温度' }] },
  ])
  expect(renderChartSvg(request)).toContain('温度')
})
it('rejects missing, reversed and exceeded ranges without silently clamping', () => {
  for (const row of [
    ['温度', 60, -30, 50],
    ['温度', 0, 0, 0],
    ['温度', 2, 10, 0],
    ['温度', null, 0, 10],
  ]) {
    expect(() =>
      buildChartOption({ ...request, table: { ...request.table, rows: [row] } }),
    ).toThrow()
  }
  expect(() =>
    buildChartOption({
      ...request,
      table: { ...request.table, rows: [...request.table.rows, ...request.table.rows] },
    }),
  ).toThrow('一行')
})
