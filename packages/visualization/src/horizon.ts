import type { EChartsOption } from 'echarts'
import { numericValue, type Cell } from './data'
import { calendarDate } from './calendar'

const positive = ['#bfdbfe', '#60a5fa', '#1d4ed8']
const negative = ['#fed7aa', '#fb923c', '#c2410c']

export function assertHorizonSize(width: number, height: number, seriesCount: number): void {
  if (width < 640 || height < 160 + 70 * seriesCount)
    throw new Error('地平线图画布过小，请增大尺寸或减少系列，以完整显示色阶和时间轴。')
}

export function horizonData(times: Cell[], columns: (number | null)[][]) {
  if (times.length < 2 || times.length > 2000 || columns.length < 1 || columns.length > 6)
    throw new Error('地平线图需要 2–2000 个时间点、1–6 个同量纲系列。')
  const numericTime = times.every((time) => numericValue(time) !== null)
  const xs = times.map((time) => {
    if (numericTime) return numericValue(time)!
    if (typeof time !== 'string') throw new Error('时间需要完整数值或 YYYY-MM-DD 日期。')
    return Date.parse(`${calendarDate(time)}T00:00:00Z`)
  })
  if (new Set(xs).size !== xs.length) throw new Error('时间点不能重复，请先明确汇总方式。')
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!)
  if (!Number.isFinite(xs[order[order.length - 1]!]! - xs[order[0]!]!))
    throw new Error('时间范围超出精度，请先缩放。')
  let maximum = 0
  for (const column of columns) {
    if (column.length !== times.length || column.some((v) => v !== null && !Number.isFinite(v)))
      throw new Error('系列长度或数值无效。')
    if (column.every((v) => v === null)) throw new Error('系列不能全部缺失。')
    for (const v of column) if (v !== null) maximum = Math.max(maximum, Math.abs(v))
  }
  const band = maximum ? maximum / 3 : 1
  if (!band) throw new Error('数值超出精度，请先缩放。')
  const series = columns.map((column) => {
    const points: [number, number | null][] = []
    for (let i = 0; i < order.length; i++) {
      const index = order[i]!, x = xs[index]!, y = column[index]!
      if (i) {
        const previous = order[i - 1]!, x0 = xs[previous]!, y0 = column[previous]!
        if (y !== null && y0 !== null && y !== y0) {
          // Interpolate every band/zero crossing before folding, not after.
          const crossings = [-2, -1, 0, 1, 2].map((k) => k * band)
            .filter((v) => v > Math.min(y0, y) && v < Math.max(y0, y))
            .map((v) => ({ v, t: (v / maximum - y0 / maximum) / (y / maximum - y0 / maximum) }))
            .sort((a, b) => a.t - b.t)
          for (const { v, t } of crossings) points.push([x0 + t * (x - x0), v])
        }
      }
      points.push([x, y])
    }
    return points
  })
  return { series, band, maximum, dates: !numericTime }
}

export function horizonOption(times: Cell[], columns: (number | null)[][], names: string[], title = ''): EChartsOption {
  const data = horizonData(times, columns)
  const n = names.length
  const format = (v: number) => Number(v.toPrecision(5)).toString()
  const bandNames = ['正', '负'].flatMap((sign) => [0, 1, 2].map((i) => `${sign} ${format(i * data.band)}–${format((i + 1) * data.band)}`))
  return {
    backgroundColor: '#fff', animation: false,
    title: { text: title, left: 'center', subtext: '蓝色为正，橙色为负；深色表示更高幅度，负值向上折叠\n各系列共用 3 层色阶；空值断开，时间排序后线性连接' },
    legend: { bottom: 6, data: bandNames, selectedMode: false, textStyle: { fontSize: 12 } },
    grid: names.map((_, i) => ({ left: 90, right: 40, top: `${18 + i * 65 / n}%`, height: `${55 / n}%` })),
    xAxis: names.map((_, i) => ({ type: data.dates ? 'time' as const : 'value' as const, gridIndex: i,
      min: data.series[i]![0]![0], max: data.series[i]!.at(-1)![0],
      axisLabel: { show: i === n - 1 }, axisTick: { show: i === n - 1 }, splitLine: { show: false } })),
    yAxis: names.map((name, i) => ({ type: 'value' as const, gridIndex: i, min: 0, max: data.band,
      name, nameLocation: 'middle' as const, nameGap: 30, axisLabel: { show: false },
      axisTick: { show: false }, splitLine: { show: false } })),
    tooltip: { trigger: 'axis', renderMode: 'richText', formatter: (input) => {
      const items = Array.isArray(input) ? input : [input]
      const first = items[0]
      if (!first || !Array.isArray(first.value)) return ''
      const x = Number(first.value[0])
      const heading = data.dates ? new Date(x).toISOString().slice(0, 10) : format(x)
      const rows = new Map<number, string>()
      for (const item of items) {
        const row = Math.floor((item.seriesIndex ?? 0) / 6)
        if (Array.isArray(item.value)) rows.set(row, `${names[row]}：${item.value[2] === null ? '缺失' : format(Number(item.value[2]))}`)
      }
      return `${heading}\n${[...rows.values()].join('\n')}`
    } },
    series: data.series.flatMap((points, index) => [1, -1].flatMap((sign, signIndex) => [0, 1, 2].map((layer) => ({
      name: bandNames[signIndex * 3 + layer]!, type: 'line' as const, xAxisIndex: index, yAxisIndex: index,
      showSymbol: false, connectNulls: false, clip: true,
      lineStyle: { width: 0 }, areaStyle: { opacity: 1 },
      itemStyle: { color: (sign === 1 ? positive : negative)[layer]! },
      emphasis: { disabled: true },
      dimensions: ['时间', '折叠高度', '原始值'], encode: { x: 0, y: 1, tooltip: [2] },
      data: points.map(([x, y]) => [x, y === null ? null : Math.max(0, Math.min(data.band, sign * y - layer * data.band)), y]),
    })))),
  }
}
