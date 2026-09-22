import { expect, it } from 'vitest'
import { guidedCharts } from '../src/renderer/visualization-guide'

it('offers real data previews with valid field bindings for the chosen purpose', () => {
  const table = {
    columns: ['地区', '收入', '利润'],
    rows: [
      ['东', 20, 5],
      ['西', 10, 2],
    ],
  }
  const choices = guidedCharts(table, 'comparison')
  expect(choices.some((choice) => choice.request.chartId === 'bar')).toBe(true)
  for (const choice of choices) {
    expect(choice.request.table).toBe(table)
    expect(choice.svg).toContain('<svg')
    expect(choice.request.y.every((name) => table.columns.includes(name))).toBe(true)
  }
})
it('does not suggest invalid part-to-whole data or fabricate hierarchy fields', () => {
  const table = {
    columns: ['地区', '收入'],
    rows: [
      ['东', -20],
      ['西', 10],
    ],
  }
  expect(guidedCharts(table, 'composition')).toEqual([])
  expect(guidedCharts(table, 'hierarchy')).toEqual([])
})
it('keeps large-data recommendations aggregate-based without sampling observations', () => {
  const table = { columns: ['x', 'y'], rows: Array.from({ length: 1000 }, (_, i) => [i, i]) }
  const choices = guidedCharts(table, '')
  expect(choices.length).toBeGreaterThan(0)
  expect(choices.every((choice) => choice.request.table.rows.length === 1000)).toBe(true)
  expect(choices.some((choice) => choice.request.chartId === 'scatter')).toBe(false)
})
