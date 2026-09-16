import { expect, it } from 'vitest'
import { priceIntervals } from './ohlc'
import { buildChartOption, renderChartSvg } from './render'

it('validates complete price ranges without rejecting legitimate negative prices', () => {
  expect(priceIntervals([[-3], [-2], [-4], [-1]])).toEqual([[-3, -2, -4, -1]])
  expect(() => priceIntervals([[5], [7], [6], [8]])).toThrow('区间无效')
  expect(() => priceIntervals([[5], [7], [4], [6]])).toThrow('区间无效')
  expect(() => priceIntervals([[5], [null], [4], [8]])).toThrow('完整')
  expect(() => priceIntervals([[5]])).toThrow('四个')
})

it('renders candles and OHLC bars from open/close/low/high prices', () => {
  const request = {
    x: 'date',
    y: ['open', 'close', 'low', 'high'],
    title: '价格样本',
    table: {
      columns: ['date', 'open', 'close', 'low', 'high'],
      rows: [
        ['2026-01-01', 10, 15, 8, 17],
        ['2026-01-02', 15, 12, 11, 16],
        ['2026-01-03', 12, 12, 12, 12],
      ],
    },
  }
  const candle = buildChartOption({ ...request, chartId: 'candlestick' })
  expect(candle.series).toMatchObject([
    {
      type: 'candlestick',
      data: [
        [10, 15, 8, 17],
        [15, 12, 11, 16],
        [12, 12, 12, 12],
      ],
    },
  ])
  for (const chartId of ['candlestick', 'ohlc']) {
    const svg = renderChartSvg({ ...request, chartId })
    expect(svg).toContain('价格样本')
    expect(svg).toContain('2026-01-01')
    expect(svg).not.toMatch(/NaN|Infinity/)
  }
})
