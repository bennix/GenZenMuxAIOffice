import type { Cell } from './data'
import type { ChartRequest } from './render'

export interface DashboardFilter {
  column: string
  values: Cell[]
}

export function dashboardFilterColumns(cards: readonly ChartRequest[]): string[] {
  return (
    cards[0]?.table.columns.filter((name) =>
      cards.every((card) => card.table.columns.includes(name)),
    ) ?? []
  )
}

export function dashboardFilterValues(cards: readonly ChartRequest[], column: string): Cell[] {
  if (!dashboardFilterColumns(cards).includes(column))
    throw new Error('筛选字段必须存在于全部图表中。')
  const distinct = new Map<string, Cell>()
  for (const card of cards) {
    const index = card.table.columns.indexOf(column)
    for (const row of card.table.rows) {
      const value = row[index]!
      distinct.set(JSON.stringify(value), value)
      if (distinct.size > 500) throw new Error('分类筛选最多支持 500 个不同值，请改选其他字段。')
    }
  }
  return [...distinct.values()]
}

export function filterDashboardCards(
  cards: readonly ChartRequest[],
  filter?: DashboardFilter,
): ChartRequest[] {
  if (!filter) return [...cards]
  if (!dashboardFilterColumns(cards).includes(filter.column))
    throw new Error('筛选字段必须存在于全部图表中。')
  if (
    !Array.isArray(filter.values) ||
    filter.values.length > 500 ||
    filter.values.some(
      (value) =>
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'boolean' &&
        (typeof value !== 'number' || !Number.isFinite(value)),
    )
  )
    throw new Error('筛选值无效，最多 500 项。')
  const selected = new Set(filter.values.map((value) => JSON.stringify(value)))
  return cards.map((card) => {
    const index = card.table.columns.indexOf(filter.column)
    return { ...card, table: { ...card.table,
      rows: card.table.rows.filter((row) => selected.has(JSON.stringify(row[index]))),
    } }
  })
}
