import { expect, it } from 'vitest'
import { buildChartOption } from './render'
it('retains gaps and uses a common range across separate panels', () => {
  const option = buildChartOption({
    chartId: 'small-multiples',
    x: 'name',
    y: ['a', 'b'],
    table: {
      columns: ['name', 'a', 'b'],
      rows: [
        ['甲', -2, 100],
        ['乙', null, 50],
      ],
    },
  })
  expect(option.yAxis).toMatchObject([
    { min: -2, max: 100 },
    { min: -2, max: 100 },
  ])
  expect(option.series).toMatchObject([
    { data: [-2, null], xAxisIndex: 0 },
    { data: [100, 50], xAxisIndex: 1 },
  ])
  expect(option.grid).toHaveLength(2)
})
