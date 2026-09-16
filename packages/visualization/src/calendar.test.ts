import { expect, it } from 'vitest'
import { calendarDate, calendarDays } from './calendar'
import { buildChartOption, renderChartSvg } from './render'

it('validates civil dates including leap years without rolling invalid dates forward', () => {
  expect(calendarDate('2024-02-29')).toBe('2024-02-29')
  for (const date of [
    '2023-02-29',
    '1900-02-29',
    '2024-04-31',
    '2024-13-01',
    '2024-00-01',
    '2024-01-00',
    '45200',
    '02/03/2024',
    '2024-01-01T00:00:00Z',
  ])
    expect(() => calendarDate(date)).toThrow()
})

it('aggregates duplicate days, keeps zero distinct from missing, sorts and includes intervening years', () => {
  expect(
    calendarDays(
      ['2026-01-01', '2024-02-29', '2024-02-29', '2024-03-01', '2024-03-02'],
      [4, 3, -1, 0, null],
    ),
  ).toEqual({
    years: [2024, 2025, 2026],
    data: [
      ['2024-02-29', 2],
      ['2024-03-01', 0],
      ['2026-01-01', 4],
    ],
  })
  expect(() => calendarDays(['2020-01-01', '2026-01-01'], [1, 2])).toThrow('三年')
  expect(() => calendarDays(['2024-01-01', '2024-01-01'], [1e308, 1e308])).toThrow('范围')
})

it('renders separate yearly calendars with a shared numeric scale and real dates', () => {
  const request = {
    chartId: 'calendar',
    x: 'date',
    y: ['count'],
    title: '每日活动',
    table: {
      columns: ['date', 'count'],
      rows: [
        ['2024-02-29', 2],
        ['2024-02-29', 3],
        ['2025-01-01', 7],
      ],
    },
  }
  const option = buildChartOption(request)
  expect(option.calendar).toHaveLength(2)
  expect(option.visualMap).toMatchObject({ min: 5, max: 7 })
  expect(option.series).toMatchObject([
    { type: 'heatmap', calendarIndex: 0, data: [['2024-02-29', 5]] },
    { type: 'heatmap', calendarIndex: 1, data: [['2025-01-01', 7]] },
  ])
  const svg = renderChartSvg(request)
  expect(svg).toContain('每日活动')
  expect(svg).toContain('2024')
  expect(svg).toContain('2025')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
