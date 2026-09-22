import { calendarDate } from './calendar'
import { numericValue, type Cell } from './data'

/** Wide measurements become complete, sorted time/weight/series triples. */
export function riverData(
  times: Cell[],
  columns: (number | null)[][],
  names: string[],
  datesOnly = false,
) {
  if (names.length < 2 || names.length > 20 || columns.length !== names.length)
    throw new Error('河流图需要 2–20 个同量纲的数值系列。')
  const numericTime = !datesOnly && times.every((value) => numericValue(value) !== null)
  const groups = new Map<number, number[]>()
  for (let i = 0; i < times.length; i++) {
    let time: number
    if (numericTime) time = numericValue(times[i]!)!
    else {
      if (typeof times[i] !== 'string') throw new Error('河流图日期必须是 YYYY-MM-DD 文本。')
      time = Date.parse(`${calendarDate(times[i] as string)}T00:00:00Z`)
    }
    const sums = groups.get(time) ?? names.map(() => 0)
    for (let j = 0; j < columns.length; j++) {
      const value = columns[j]![i]
      if (value === null || value === undefined || !Number.isFinite(value) || value < 0)
        throw new Error('河流图需要完整的非负数据；请补齐缺失值，不能将未知值自动当作 0。')
      sums[j] = sums[j]! + value
      if (!Number.isFinite(sums[j])) throw new Error('河流图汇总超出数值范围。')
    }
    if (!Number.isFinite(sums.reduce((sum, value) => sum + value, 0)))
      throw new Error('河流图总量超出数值范围。')
    groups.set(time, sums)
  }
  if (groups.size < 2) throw new Error('河流图至少需要两个不同时间点。')
  const points = [...groups].sort(([a], [b]) => a - b)
  if (!points.some(([, values]) => values.some((value) => value > 0)))
    throw new Error('河流图至少需要一个正数。')
  return {
    axisType: numericTime ? ('value' as const) : ('time' as const),
    data: points.flatMap(([time, values]) =>
      values.map((value, j) => [time, value, names[j]!] as [number, number, string]),
    ),
  }
}
