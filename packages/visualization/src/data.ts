import { calendarDays } from './calendar'

export type Cell = string | number | boolean | null
export interface DataTable {
  columns: string[]
  rows: Cell[][]
}
export interface ColumnProfile {
  name: string
  index: number
  kind: 'number' | 'date' | 'category' | 'empty'
  missing: number
  distinct: number
  min?: number
  max?: number
}

export function numericValue(value: Cell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  // Do not coerce dates, booleans, currencies or locale-dependent separators.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function validateTable(input: unknown): DataTable {
  if (!input || typeof input !== 'object') throw new Error('需要列名和数据行。')
  const { columns, rows } = input as Partial<DataTable>
  if (
    !Array.isArray(columns) ||
    !columns.length ||
    columns.length > 256 ||
    columns.some((name) => typeof name !== 'string' || !name.trim())
  ) {
    throw new Error('需要 1–256 个非空列名。')
  }
  if (new Set(columns).size !== columns.length) throw new Error('列名不能重复。')
  if (!Array.isArray(rows) || !rows.length || rows.length * columns.length > 200000) {
    throw new Error('需要非空数据，最多 200000 个单元格。')
  }
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== columns.length)
      throw new Error('每行数据必须与列名数量一致。')
    for (const cell of row) {
      if (
        cell !== null &&
        typeof cell !== 'string' &&
        typeof cell !== 'number' &&
        typeof cell !== 'boolean'
      ) {
        throw new Error('单元格仅支持文本、数字、布尔值或空值。')
      }
      if (typeof cell === 'number' && !Number.isFinite(cell))
        throw new Error('数据不能包含无限值或 NaN。')
      if (typeof cell === 'string' && cell.length > 32767)
        throw new Error('单元格文本不能超过 32767 个字符。')
    }
  }
  return { columns: [...columns], rows: rows.map((row) => [...row]) }
}

function isDate(value: Cell): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value.slice(0, 10)
}

export function profileTable(input: DataTable): ColumnProfile[] {
  const table = validateTable(input)
  return table.columns.map((name, index) => {
    const values = table.rows.map((row) => row[index]!).filter((v) => v !== null && v !== '')
    const numbers = values.map(numericValue)
    const kind = !values.length
      ? 'empty'
      : numbers.every((v) => v !== null)
        ? 'number'
        : values.every(isDate)
          ? 'date'
          : 'category'
    const profile: ColumnProfile = {
      name,
      index,
      kind,
      missing: table.rows.length - values.length,
      distinct: new Set(values).size,
    }
    if (kind === 'number') {
      profile.min = numbers.reduce<number>((min, v) => Math.min(min, v!), Infinity)
      profile.max = numbers.reduce<number>((max, v) => Math.max(max, v!), -Infinity)
    }
    return profile
  })
}

export interface Recommendation {
  chartId: string
  reason: string
  columns: string[]
}
export function recommendCharts(table: DataTable): Recommendation[] {
  const profiles = profileTable(table)
  const numeric = profiles.filter((column) => column.kind === 'number')
  const date = profiles.find((column) => column.kind === 'date')
  const category = profiles.find((column) => column.kind === 'category')
  const result: Recommendation[] = []
  if (date && numeric.length)
    result.push({
      chartId: 'line',
      reason: '日期与数值列适合观察随时间的变化。',
      columns: [date.name, numeric[0]!.name],
    })
  if (date && numeric.length) {
    try {
      calendarDays(
        table.rows.map((row) => String(row[date.index] ?? '')),
        table.rows.map((row) => numericValue(row[numeric[0]!.index]!)),
      )
      result.push({
        chartId: 'calendar',
        reason: '按日期汇总后可用日历观察每天的数值与周期性；同日数据求和。',
        columns: [date.name, numeric[0]!.name],
      })
    } catch {
      // Date-time strings and large year spans can use a line chart, but not a calendar.
    }
  }
  if (category && numeric.length) {
    const columns = [category.name, numeric[0]!.name]
    result.push({ chartId: 'bar', reason: '类别与数值列适合比较大小。', columns })
    if (category.distinct <= 6 && numeric[0]!.min! >= 0 && numeric[0]!.max! > 0) {
      result.push({ chartId: 'donut', reason: '类别较少且数值非负，可展示各类别占比。', columns })
    }
  }
  if (numeric.length >= 2)
    result.push({
      chartId: 'scatter',
      reason: '两个数值变量适合观察关系与异常点。',
      columns: numeric.slice(0, 2).map((c) => c.name),
    })
  if (numeric.length)
    result.push({
      chartId: 'histogram',
      reason: '数值样本适合查看频数分布。',
      columns: [numeric[0]!.name],
    })
  result.push({
    chartId: 'table',
    reason: '表格保留所有原始数据，便于核对。',
    columns: table.columns,
  })
  return result
}
