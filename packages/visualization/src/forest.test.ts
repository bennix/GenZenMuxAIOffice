import { expect, it } from 'vitest'
import { buildChartOption, renderChartSvg } from './render'

const request = {
  chartId: 'forest',
  x: 'study',
  y: ['estimate', 'lower', 'upper'],
  title: '研究区间',
  table: {
    columns: ['study', 'estimate', 'lower', 'upper'],
    rows: [
      ['甲', -1, -3, 2],
      ['乙', 4, 3, 8],
      ['丙', 0, 0, 0],
    ],
  },
}
it('preserves supplied study estimates and asymmetric intervals including zero-width intervals', () => {
  expect(buildChartOption(request).series).toMatchObject([
    {
      data: [
        [0, -1, -3, 2],
        [1, 4, 3, 8],
        [2, 0, 0, 0],
      ],
    },
  ])
  const svg = renderChartSvg(request)
  expect(svg).toContain('研究区间')
  expect(svg).toContain('甲')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
it('rejects missing or inconsistent supplied confidence intervals', () => {
  for (const row of [
    ['甲', 2, 3, 5],
    ['甲', 7, 3, 5],
    ['甲', 4, null, 5],
  ]) {
    expect(() =>
      buildChartOption({ ...request, table: { ...request.table, rows: [row] } }),
    ).toThrow()
  }
  expect(() => buildChartOption({ ...request, y: ['estimate'] })).toThrow('三个')
})
