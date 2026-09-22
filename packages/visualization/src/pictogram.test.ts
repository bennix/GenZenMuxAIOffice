import { expect, it } from 'vitest'
import { buildChartOption } from './render'

it('uses a shared icon unit and preserves zero counts', () => {
  const option = buildChartOption({
    chartId: 'pictogram',
    x: 'group',
    y: ['count'],
    table: {
      columns: ['group', 'count'],
      rows: [
        ['a', 2],
        ['b', 5],
        ['c', 0],
      ],
    },
  })
  expect(option.series).toMatchObject([
    {
      type: 'pictorialBar',
      symbolBoundingData: 5,
      symbolClip: true,
      data: [
        { value: 2, symbolRepeat: 5 },
        { value: 5, symbolRepeat: 5 },
        { value: 0, symbolRepeat: 5 },
      ],
    },
  ])
})
it('does not silently round fractional counts', () => {
  expect(() =>
    buildChartOption({
      chartId: 'pictogram',
      x: 'group',
      y: ['count'],
      table: { columns: ['group', 'count'], rows: [['a', 2.5]] },
    }),
  ).toThrow('整数')
})
