import { expect, it } from 'vitest'
import { buildChartOption } from './render'
it('uses pairwise complete observations and consistent per-variable scales', () => {
  const option = buildChartOption({
    chartId: 'scatter-matrix',
    x: 'a',
    y: ['a', 'b'],
    table: {
      columns: ['a', 'b'],
      rows: [
        [1, 10],
        [3, null],
        [2, 20],
      ],
    },
  })
  expect(option.series).toHaveLength(4)
  expect(option.series).toMatchObject([
    {
      data: [
        [1, 1],
        [3, 3],
        [2, 2],
      ],
    },
    {
      data: [
        [10, 1],
        [20, 2],
      ],
    },
    {
      data: [
        [1, 10],
        [2, 20],
      ],
    },
    {
      data: [
        [10, 10],
        [20, 20],
      ],
    },
  ])
  expect(option.xAxis).toMatchObject([
    { min: 1, max: 3 },
    { min: 10, max: 20 },
    { min: 1, max: 3 },
    { min: 10, max: 20 },
  ])
})
