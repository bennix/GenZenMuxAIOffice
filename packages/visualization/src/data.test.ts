import { expect, it } from 'vitest'
import { numericValue, profileTable, recommendCharts, validateTable } from './data'

it('rejects malformed tables and non-finite numbers', () => {
  expect(() => validateTable({ columns: ['x', 'x'], rows: [[1, 2]] })).toThrow('重复')
  expect(() => validateTable({ columns: ['x'], rows: [[1, 2]] })).toThrow('一致')
  expect(() => validateTable({ columns: ['x'], rows: [[Infinity]] })).toThrow('NaN')
})

it('preserves missing values and avoids treating booleans and ambiguous numbers as measurements', () => {
  expect(numericValue(true)).toBeNull()
  expect(numericValue('1,234')).toBeNull()
  expect(numericValue('2e3')).toBe(2000)
  const table = {
    columns: ['date', 'value', 'flag'],
    rows: [
      ['2026-09-01', 2, true],
      ['2026-09-02', null, false],
    ],
  }
  const profiles = profileTable(table)
  expect(profiles.map((column) => column.kind)).toEqual(['date', 'number', 'category'])
  expect(profiles[1]).toMatchObject({ missing: 1, min: 2, max: 2 })
  expect(table.rows[1]![1]).toBeNull()
})

it('does not accept impossible calendar dates', () => {
  expect(profileTable({ columns: ['date'], rows: [['2026-02-30']] })[0]!.kind).toBe('category')
})

it('recommends a calendar only when its complete date range can be rendered', () => {
  const chartIds = (dates: string[]) =>
    recommendCharts({ columns: ['date', 'value'], rows: dates.map((date) => [date, 1]) }).map(
      (chart) => chart.chartId,
    )
  expect(chartIds(['2024-02-29', '2025-01-01'])).toContain('calendar')
  expect(chartIds(['2020-01-01', '2025-01-01'])).not.toContain('calendar')
  expect(chartIds(['2024-01-01T12:00:00Z'])).not.toContain('calendar')
})

it('recommends charts from the actual data and excludes part-to-whole charts for negatives', () => {
  const charts = recommendCharts({
    columns: ['region', 'revenue', 'profit'],
    rows: [
      ['东', 10, -3],
      ['西', -2, 8],
    ],
  })
  expect(charts.map((chart) => chart.chartId)).toEqual(['bar', 'scatter', 'histogram', 'table'])
  expect(charts[1]!.columns).toEqual(['revenue', 'profit'])
})
