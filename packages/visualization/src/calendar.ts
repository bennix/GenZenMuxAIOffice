/** Parse an unambiguous civil date without local-time or Date.parse rollover. */
export function calendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) throw new Error('日历日期必须使用 YYYY-MM-DD 文本，不能使用 Excel 序列号。')
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1900 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error(`无效日历日期：${value}`)
  return `${match[1]}-${match[2]}-${match[3]}`
}

export function calendarDays(labels: string[], values: (number | null)[]) {
  if (labels.length !== values.length) throw new Error('日期与数值长度不一致。')
  const totals = new Map<string, number>()
  for (let i = 0; i < labels.length; i++) {
    const date = calendarDate(labels[i]!)
    const value = values[i]
    if (value === null) continue
    if (value === undefined || !Number.isFinite(value)) throw new Error('日历数值必须有限。')
    const total = (totals.get(date) ?? 0) + value
    if (!Number.isFinite(total)) throw new Error('按日汇总超出数值范围。')
    totals.set(date, total)
  }
  const data = [...totals].sort(([a], [b]) => a.localeCompare(b))
  if (!data.length) throw new Error('日历没有有效数值。')
  const first = Number(data[0]![0].slice(0, 4))
  const last = Number(data[data.length - 1]![0].slice(0, 4))
  if (last - first > 2) throw new Error('日历热力图最多显示连续三年，请先筛选日期范围。')
  return { data, years: Array.from({ length: last - first + 1 }, (_, i) => first + i) }
}
