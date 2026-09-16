import { expect, it } from 'vitest'
import { buildChartOption } from './render'

it('uses the same scale for all radar axes so unequal values remain unequal', () => {
  const option = buildChartOption({
    chartId: 'radar',
    x: 'metric',
    y: ['score'],
    table: {
      columns: ['metric', 'score'],
      rows: [
        ['a', 1],
        ['b', 10],
        ['c', 100],
      ],
    },
  })
  expect(option.radar).toMatchObject({
    indicator: [
      { name: 'a', min: 0, max: 100 },
      { name: 'b', min: 0, max: 100 },
      { name: 'c', min: 0, max: 100 },
    ],
  })
  expect(option.series).toMatchObject([{ data: [{ value: [1, 10, 100] }] }])
})
