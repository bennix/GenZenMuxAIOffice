import { expect, it } from 'vitest'
import { buildChartOption } from './render'

it.each(['text-heatmap', 'matrix'])(
  'keeps %s coordinates, signed values and zero while omitting missing cells',
  (chartId) => {
    const option = buildChartOption({
      chartId,
      x: '词语',
      y: ['文档一', '文档二'],
      table: {
        columns: ['词语', '文档一', '文档二'],
        rows: [
          ['性能', 0, 3],
          ['成本', -2, null],
        ],
      },
    })
    expect(option.xAxis).toMatchObject({ data: ['文档一', '文档二'] })
    expect(option.yAxis).toMatchObject({ data: ['性能', '成本'], inverse: true })
    expect(option.series).toMatchObject([
      {
        data: [
          [0, 0, 0],
          [0, 1, -2],
          [1, 0, 3],
        ],
      },
    ])
    expect(option.visualMap).toMatchObject({ min: -2, max: 3 })
  },
)

it('rejects duplicate text rows instead of making their identity ambiguous', () => {
  expect(() =>
    buildChartOption({
      chartId: 'text-heatmap',
      x: 'text',
      y: ['value'],
      table: {
        columns: ['text', 'value'],
        rows: [
          ['same', 1],
          ['same', 2],
        ],
      },
    }),
  ).toThrow('唯一')
})
