import { expect, it } from 'vitest'
import {
  dashboardFilterColumns,
  dashboardFilterValues,
  filterDashboardCards,
} from './dashboard-filter'
import { renderDashboardSvg } from './dashboard'
import { parseDashboardFile, serializeDashboardFile } from './dashboard-file'

const table = {
  columns: ['类别', '数值'],
  rows: [
    ['东', 12],
    ['西', 8],
    [1, 5],
    ['1', 7],
    [null, 0],
    ['', 9],
  ],
}
const cards = ['column', 'kpi'].map((chartId) => ({ chartId, table, x: '类别', y: ['数值'] }))
it('filters all cards by typed values and keeps original snapshots intact', () => {
  expect(dashboardFilterColumns(cards)).toEqual(['类别', '数值'])
  expect(dashboardFilterValues(cards, '类别')).toEqual(['东', '西', 1, '1', null, ''])
  const filtered = filterDashboardCards(cards, { column: '类别', values: [1, null] })
  for (const card of filtered)
    expect(card.table.rows).toEqual([
      [1, 5],
      [null, 0],
    ])
  expect(cards[0]!.table.rows).toHaveLength(6)
  expect(() => filterDashboardCards(cards, { column: '缺失', values: [] })).toThrow('全部图表')
})
it('exports filtered data while editable files retain both the full source and active filter', () => {
  const dashboard = { title: '筛选结果', cards, filter: { column: '类别', values: ['东'] } }
  const svg = renderDashboardSvg(dashboard)
  expect(svg).toContain('东')
  expect(svg).not.toContain('西')
  const restored = parseDashboardFile(serializeDashboardFile(dashboard))
  expect(restored).toEqual(dashboard)
  expect(restored.cards[0]!.table.rows).toHaveLength(6)
})
it('shows empty results explicitly and does not let filters hide invalid charts', () => {
  const dashboard = { title: '无匹配', cards, filter: { column: '类别', values: [] } }
  expect(renderDashboardSvg(dashboard).match(/筛选后无数据/g)).toHaveLength(2)
  expect(() =>
    renderDashboardSvg({ ...dashboard, cards: [{ ...cards[0]!, y: ['不存在'] }] }),
  ).toThrow('第 1 张')
})
