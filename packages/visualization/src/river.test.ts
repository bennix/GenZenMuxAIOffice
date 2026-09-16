import { expect, it } from 'vitest'
import { riverData } from './river'
import { buildChartOption, renderChartSvg } from './render'
import { init } from 'echarts'

it('sorts time and sums duplicate observations without normalizing or changing series order', () => {
  expect(
    riverData(
      [3, 1, 1],
      [
        [9, 2, 4],
        [1, 3, 5],
      ],
      ['甲', '乙'],
    ),
  ).toEqual({
    axisType: 'value',
    data: [
      [1, 6, '甲'],
      [1, 8, '乙'],
      [3, 9, '甲'],
      [3, 1, '乙'],
    ],
  })
})

it('lays out ribbon thickness in direct proportion to values on a continuous numeric axis', () => {
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 960, height: 600 })
  try {
    chart.setOption(
      buildChartOption({
        chartId: 'stream',
        x: 'time',
        y: ['a', 'b'],
        table: {
          columns: ['time', 'a', 'b'],
          rows: [
            [1, 2, 8],
            [2, 4, 6],
            [4, 7, 3],
          ],
        },
      }),
    )
    const model = chart as unknown as {
      getModel(): {
        getSeriesByIndex(index: number): {
          getData(): {
            count(): number
            getItemLayout(index: number): { x: number; y: number; y0: number }
          }
        }
      }
    }
    const data = model.getModel().getSeriesByIndex(0).getData()
    expect(data.count()).toBe(6)
    const layouts = Array.from({ length: 6 }, (_, i) => data.getItemLayout(i))
    // Input consists of alternating a/b observations at each time.
    const weights = [2, 8, 4, 6, 7, 3]
    const scale = layouts[0]!.y / weights[0]!
    layouts.forEach((point, i) => expect(point.y).toBeCloseTo(weights[i]! * scale))
    expect(layouts[1]!.y0).toBeCloseTo(layouts[0]!.y0 + layouts[0]!.y)
    expect(layouts[4]!.x - layouts[2]!.x).toBeCloseTo(2 * (layouts[2]!.x - layouts[0]!.x))
  } finally {
    chart.dispose()
  }
})

it('uses UTC civil dates and rejects ambiguous dates, negatives, missing values and degenerate time ranges', () => {
  const result = riverData(
    ['2024-02-29', '2024-03-01'],
    [
      [2, 3],
      [0, 4],
    ],
    ['a', 'b'],
    true,
  )
  expect(result.axisType).toBe('time')
  expect(result.data[0]).toEqual([Date.UTC(2024, 1, 29), 2, 'a'])
  expect(() =>
    riverData(
      [1, 2],
      [
        [1, 2],
        [3, 4],
      ],
      ['a', 'b'],
      true,
    ),
  ).toThrow('日期')
  expect(() =>
    riverData(
      ['2023-02-29', '2023-03-01'],
      [
        [1, 2],
        [3, 4],
      ],
      ['a', 'b'],
      true,
    ),
  ).toThrow('无效')
  expect(() =>
    riverData(
      [1, 2],
      [
        [1, null],
        [3, 4],
      ],
      ['a', 'b'],
    ),
  ).toThrow('完整')
  expect(() =>
    riverData(
      [1, 2],
      [
        [1, -2],
        [3, 4],
      ],
      ['a', 'b'],
    ),
  ).toThrow('非负')
  expect(() =>
    riverData(
      [1, 1],
      [
        [1, 2],
        [3, 4],
      ],
      ['a', 'b'],
    ),
  ).toThrow('不同时间')
  expect(() =>
    riverData(
      [1, 2],
      [
        [0, 0],
        [0, 0],
      ],
      ['a', 'b'],
    ),
  ).toThrow('正数')
})

it.each(['stream', 'theme-river'])(
  'renders %s as temporal layered ribbons with the actual weights',
  (chartId) => {
    const request = {
      chartId,
      title: '主题变化',
      x: 'date',
      y: ['甲', '乙'],
      table: {
        columns: ['date', '甲', '乙'],
        rows: [
          ['2024-01-01', 2, 8],
          ['2024-02-01', 4, 6],
          ['2024-03-01', 7, 3],
        ],
      },
    }
    const option = buildChartOption(request)
    expect(option.series).toMatchObject([
      {
        type: 'themeRiver',
        data: [
          [Date.UTC(2024, 0, 1), 2, '甲'],
          [Date.UTC(2024, 0, 1), 8, '乙'],
          [Date.UTC(2024, 1, 1), 4, '甲'],
          [Date.UTC(2024, 1, 1), 6, '乙'],
          [Date.UTC(2024, 2, 1), 7, '甲'],
          [Date.UTC(2024, 2, 1), 3, '乙'],
        ],
      },
    ])
    const svg = renderChartSvg(request)
    expect(svg).toContain('主题变化')
    expect(svg).toContain('甲')
    expect(svg).toContain('乙')
    expect(svg).not.toMatch(/NaN|Infinity/)
  },
)
