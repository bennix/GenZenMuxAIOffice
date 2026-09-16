import { expect, it } from 'vitest'
import { renderChartSvg } from './render'
it('displays supplied KPI values without aggregation or rounding', () => {
  const svg = renderChartSvg({
    chartId: 'kpi',
    x: 'name',
    y: ['value'],
    table: {
      columns: ['name', 'value'],
      rows: [
        ['收入', 1200],
        ['变化', -0.125],
        ['缺陷', 0],
      ],
    },
  })
  for (const text of ['收入', '1200', '变化', '-0.125', '缺陷']) expect(svg).toContain(text)
  expect(svg).not.toMatch(/NaN|Infinity/)
})
