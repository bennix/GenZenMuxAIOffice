import { expect, it } from 'vitest'
import { dashboardLayout, renderDashboardSvg } from './dashboard'

const table = {
  columns: ['地区', '销售'],
  rows: [
    ['东', 12],
    ['西', 8],
  ],
}
const cards = ['column', 'pie', 'kpi'].map((chartId) => ({
  chartId,
  table,
  x: '地区',
  y: ['销售'],
  title: chartId,
}))
it('lays panels out without overlap and includes all panels in the canvas', () => {
  const layout = dashboardLayout(6, 2)
  expect(layout.cards).toHaveLength(6)
  for (const card of layout.cards) {
    expect(card.x + card.width).toBeLessThanOrEqual(layout.width)
    expect(card.y + card.height).toBeLessThanOrEqual(layout.height)
  }
  expect(layout.cards[1]!.x).toBeGreaterThan(layout.cards[0]!.x + layout.cards[0]!.width)
  expect(layout.cards[2]!.y).toBeGreaterThan(layout.cards[0]!.y + layout.cards[0]!.height)
})
it('renders actual chart and KPI content, escapes titles and isolates SVG IDs', () => {
  const svg = renderDashboardSvg({ title: '<季度 & 汇总>', cards })
  expect(svg).toContain('&lt;季度 &amp; 汇总&gt;')
  for (const card of cards) expect(svg).toContain(card.chartId)
  expect(svg).toContain('12')
  expect(svg).toContain('8')
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  expect(new Set(ids).size).toBe(ids.length)
  expect(svg).not.toMatch(/NaN|Infinity/)
})
it('rejects invalid panels with their position and never skips them', () => {
  expect(() => renderDashboardSvg({ title: 'test', cards: [] })).toThrow('1–6')
  expect(() =>
    renderDashboardSvg({ title: 'test', cards: [...cards, { ...cards[0]!, y: ['missing'] }] }),
  ).toThrow('第 4 张')
  expect(() => dashboardLayout(6, 1, 4096)).toThrow('过高')
})
