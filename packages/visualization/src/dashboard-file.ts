import { validateTable } from './data'
import { renderDashboardSvg, type DashboardRequest } from './dashboard'
import type { ChartRequest } from './render'
import type { DashboardFilter } from './dashboard-filter'

export const DASHBOARD_FILE_MAX_BYTES = 8 * 1024 * 1024
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('仪表盘文件结构无效。')
  return value as Record<string, unknown>
}
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('仪表盘文件包含不支持的字段。')
}
const text = (value: unknown, field: string, max = 4000): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`仪表盘字段 ${field} 无效。`)
  return value
}

export function parseDashboardFile(source: string): DashboardRequest {
  if (new TextEncoder().encode(source).length > DASHBOARD_FILE_MAX_BYTES)
    throw new Error('仪表盘文件不能超过 8 MB。')
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    throw new Error('仪表盘文件不是有效 JSON。')
  }
  const envelope = object(raw)
  keys(envelope, ['format', 'version', 'dashboard'])
  if (envelope.format !== 'zenoffice-dashboard' || envelope.version !== 1)
    throw new Error('不支持的仪表盘文件格式或版本。')
  const value = object(envelope.dashboard)
  keys(value, ['title', 'cards', 'columns', 'filter'])
  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 6)
    throw new Error('仪表盘需要 1–6 张图表。')
  if (
    value.columns !== undefined &&
    value.columns !== 1 &&
    value.columns !== 2 &&
    value.columns !== 3
  )
    throw new Error('仪表盘列数无效。')
  const cards = value.cards.map((rawCard): ChartRequest => {
    const card = object(rawCard)
    keys(card, ['chartId', 'table', 'x', 'y', 'title', 'parent', 'target'])
    if (!Array.isArray(card.y) || card.y.length < 1 || card.y.length > 256)
      throw new Error('图表字段绑定无效。')
    return {
      chartId: text(card.chartId, 'chartId'),
      table: validateTable(card.table),
      x: text(card.x, 'x'),
      y: card.y.map((name) => text(name, 'y')),
      ...(card.title === undefined ? {} : { title: text(card.title, 'title') }),
      ...(card.parent === undefined ? {} : { parent: text(card.parent, 'parent') }),
      ...(card.target === undefined ? {} : { target: text(card.target, 'target') }),
    }
  })
  let filter: DashboardFilter | undefined
  if (value.filter !== undefined) {
    const rawFilter = object(value.filter)
    keys(rawFilter, ['column', 'values'])
    if (!Array.isArray(rawFilter.values)) throw new Error('筛选值必须为数组。')
    // Shared filter validation runs below with the actual cards.
    filter = { column: text(rawFilter.column, 'filter.column'), values: rawFilter.values }
  }
  const dashboard: DashboardRequest = {
    title: text(value.title, 'title', 100),
    cards,
    ...(value.columns === undefined ? {} : { columns: value.columns }),
    ...(filter ? { filter } : {}),
  }
  // Validate every panel before replacing any workspace state.
  renderDashboardSvg(dashboard)
  return dashboard
}

export function serializeDashboardFile(dashboard: DashboardRequest): string {
  // JSON would silently turn non-finite numbers into null; reject before encoding.
  for (const card of dashboard.cards) validateTable(card.table)
  const source = JSON.stringify({ format: 'zenoffice-dashboard', version: 1, dashboard })
  parseDashboardFile(source)
  return source
}
