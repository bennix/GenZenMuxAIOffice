import { expect, it } from 'vitest'
import { buildChartOption, renderChartSvg } from './render'
const request = {
  chartId: 'bullet',
  x: 'name',
  y: ['actual', 'target', 'low', 'middle', 'max'],
  table: {
    columns: ['name', 'actual', 'target', 'low', 'middle', 'max'],
    rows: [
      ['销售', 75, 90, 50, 80, 100],
      ['利润', 0, 40, 20, 40, 60],
    ],
  },
}
it('preserves actuals, targets and qualitative ranges', () => {
  expect(buildChartOption(request).series).toMatchObject([
    {
      data: [
        [0, 75, 90, 50, 80, 100],
        [1, 0, 40, 20, 40, 60],
      ],
    },
  ])
  const svg = renderChartSvg(request)
  expect(svg).toContain('销售')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
it('rejects reversed ranges and values outside the supplied scale', () => {
  for (const row of [
    ['销售', 120, 90, 50, 80, 100],
    ['销售', 75, 90, 80, 50, 100],
    ['销售', null, 90, 50, 80, 100],
  ]) {
    expect(() =>
      buildChartOption({ ...request, table: { ...request.table, rows: [row] } }),
    ).toThrow()
  }
})
