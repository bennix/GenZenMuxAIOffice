import type { EChartsOption } from 'echarts'

type Point = readonly [number, number]
const radius = 0.04

/** Nearest pointy-top hexagon using cube-coordinate rounding. */
export function hexAddress(x: number, y: number): [number, number] {
  const q = ((Math.sqrt(3) * x) / 3 - y / 3) / radius
  const r = (2 * y) / 3 / radius
  let a = Math.round(q),
    b = Math.round(r)
  const c = Math.round(-q - r)
  const da = Math.abs(a - q),
    db = Math.abs(b - r),
    dc = Math.abs(c + q + r)
  if (da > db && da > dc) a = -b - c
  else if (db > dc) b = -a - c
  return [a || 0, b || 0]
}

export function hexBins(points: readonly Point[]) {
  if (!points.length || points.some((p) => !p.every(Number.isFinite)))
    throw new Error('六边形分箱需要完整有限的 X、Y 数值配对。')
  const extent = (axis: 0 | 1): [number, number] => {
    let min = Infinity,
      max = -Infinity
    for (const p of points) {
      min = Math.min(min, p[axis])
      max = Math.max(max, p[axis])
    }
    if (min === max) {
      const padding = Math.max(Math.abs(min) * 0.05, 1)
      min -= padding
      max += padding
    }
    if (![min, max, max - min].every(Number.isFinite) || max <= min)
      throw new Error('数值范围超出分箱精度，请先缩放数据。')
    return [min, max]
  }
  const x = extent(0),
    y = extent(1)
  const sx = (x[1] - x[0]) / 2,
    sy = y[1] - y[0]
  if (sx <= 0 || sy <= 0) throw new Error('数值范围超出分箱精度，请先缩放数据。')
  const cells = new Map<string, { q: number; r: number; count: number }>()
  for (const p of points) {
    const [q, r] = hexAddress((p[0] - x[0]) / sx, (p[1] - y[0]) / sy)
    const key = `${q},${r}`
    const cell = cells.get(key)
    if (cell) cell.count++
    else cells.set(key, { q, r, count: 1 })
  }
  const bins = [...cells.values()]
    .sort((a, b) => a.r - b.r || a.q - b.q)
    .map((cell) => {
      const cx = radius * Math.sqrt(3) * (cell.q + cell.r / 2)
      const cy = radius * 1.5 * cell.r
      const vertices = Array.from({ length: 6 }, (_, i) => {
        const angle = ((60 * i - 30) * Math.PI) / 180
        return [
          x[0] + (cx + radius * Math.cos(angle)) * sx,
          y[0] + (cy + radius * Math.sin(angle)) * sy,
        ] as [number, number]
      })
      return { ...cell, center: [x[0] + cx * sx, y[0] + cy * sy] as [number, number], vertices }
    })
  const bounds: { x: [number, number]; y: [number, number] } = {
    x: [x[0] - sx * 0.1, x[1] + sx * 0.1],
    y: [y[0] - sy * 0.1, y[1] + sy * 0.1],
  }
  if ([...bounds.x, ...bounds.y].some((v) => !Number.isFinite(v)))
    throw new Error('数值范围超出分箱精度，请先缩放数据。')
  return { bins, bounds }
}

export function hexbinOption(
  points: readonly Point[],
  xName: string,
  yName: string,
  title = '',
): EChartsOption {
  const { bins, bounds } = hexBins(points)
  const maximum = Math.max(...bins.map((b) => b.count))
  const axisLabel = { showMinLabel: false, showMaxLabel: false }
  return {
    backgroundColor: '#ffffff',
    animation: false,
    title: {
      text: title,
      left: 'center',
      subtext: `六边形内观测计数 · 共 ${points.length} 条 · 空箱留白`,
    },
    grid: { left: 85, right: 45, top: 85, bottom: 105 },
    xAxis: {
      type: 'value',
      name: xName,
      min: bounds.x[0],
      max: bounds.x[1],
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel,
      axisLine: { onZero: false },
    },
    yAxis: {
      type: 'value',
      name: yName,
      min: bounds.y[0],
      max: bounds.y[1],
      nameLocation: 'middle',
      nameGap: 50,
      axisLabel,
      axisLine: { onZero: false },
    },
    tooltip: { trigger: 'item', renderMode: 'richText' },
    visualMap: {
      min: 0,
      max: maximum,
      dimension: 2,
      orient: 'horizontal',
      left: 'center',
      bottom: 12,
      text: [`${maximum} 条观测`, '0'],
      inRange: { color: ['#eff6ff', '#60a5fa', '#1e40af'] },
    },
    series: [
      {
        type: 'custom',
        dimensions: ['箱中心 X', '箱中心 Y', '观测数'],
        encode: { x: 0, y: 1, tooltip: [0, 1, 2] },
        data: bins.map((b) => [...b.center, b.count]),
        renderItem: (params, api) => ({
          type: 'polygon',
          shape: { points: bins[params.dataIndex]!.vertices.map((p) => api.coord(p)) },
          style: { fill: api.visual('color') ?? '#60a5fa', stroke: '#ffffff', lineWidth: 0.5 },
          emphasis: { style: { stroke: '#0f172a', lineWidth: 2 } },
        }),
      },
    ],
  }
}
