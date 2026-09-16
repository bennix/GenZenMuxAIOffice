import type { EChartsOption } from 'echarts'

type Point = [number, number]
type Sample = readonly [number, number, number]
export interface ContourSegment {
  start: Point
  end: Point
  level: number
}

/** Marching squares, with the asymptotic decider for ambiguous saddle cells. */
export function contourGrid(samples: readonly Sample[], requestedLevels?: readonly number[]) {
  if (samples.length < 4 || samples.length > 4096 || samples.some((s) => !s.every(Number.isFinite)))
    throw new Error('等高线需要 4–4096 个完整有限的 X、Y、Z 网格点。')
  const xs = [...new Set(samples.map((s) => s[0]))].sort((a, b) => a - b)
  const ys = [...new Set(samples.map((s) => s[1]))].sort((a, b) => a - b)
  if (xs.length < 2 || ys.length < 2 || xs.length * ys.length !== samples.length)
    throw new Error('需要完整矩形网格，每个 X/Y 组合恰好一行；不自动插补散点。')
  if (!Number.isFinite(xs.at(-1)! - xs[0]!) || !Number.isFinite(ys.at(-1)! - ys[0]!))
    throw new Error('坐标范围超出精度，请先缩放。')
  const xi = new Map(xs.map((x, i) => [x, i])),
    yi = new Map(ys.map((y, i) => [y, i]))
  const grid: (number | undefined)[] = Array(samples.length)
  for (const [x, y, z] of samples) {
    const index = yi.get(y)! * xs.length + xi.get(x)!
    if (grid[index] !== undefined) throw new Error('网格坐标重复，请先明确汇总方式。')
    grid[index] = z
  }
  if (Array.from(grid).some((value) => value === undefined)) throw new Error('网格存在缺失坐标。')
  const min = Math.min(...samples.map((s) => s[2])),
    max = Math.max(...samples.map((s) => s[2]))
  if (min === max) throw new Error('高度值全部相同，没有可区分的等高线。')
  const levels = requestedLevels
    ? [...requestedLevels]
    : Array.from({ length: 5 }, (_, i) => min * (1 - (i + 1) / 6) + max * ((i + 1) / 6))
  if (
    !levels.length ||
    levels.length > 20 ||
    levels.some((v) => !Number.isFinite(v) || v <= min || v >= max) ||
    new Set(levels).size !== levels.length
  )
    throw new Error('等值级须为高度范围内部的不同有限数值；数值范围过窄时请先缩放。')
  const scale = Math.max(Math.abs(min), Math.abs(max))
  const segments: ContourSegment[] = []
  for (const level of levels)
    for (let j = 0; j < ys.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const p: Point[] = [
          [xs[i]!, ys[j]!],
          [xs[i + 1]!, ys[j]!],
          [xs[i + 1]!, ys[j + 1]!],
          [xs[i]!, ys[j + 1]!],
        ]
        const z = [
          grid[j * xs.length + i]!,
          grid[j * xs.length + i + 1]!,
          grid[(j + 1) * xs.length + i + 1]!,
          grid[(j + 1) * xs.length + i]!,
        ]
        const f = z.map((v) => v / scale - level / scale)
        const edges = new Map<number, Point>()
        for (let k = 0; k < 4; k++) {
          const next = (k + 1) % 4
          if (z[k]! > level === z[next]! > level) continue
          const t = -f[k]! / (f[next]! - f[k]!)
          edges.set(k, [
            p[k]![0] + t * (p[next]![0] - p[k]![0]),
            p[k]![1] + t * (p[next]![1] - p[k]![1]),
          ])
        }
        const add = (start: Point, end: Point) => {
          if (start[0] !== end[0] || start[1] !== end[1]) segments.push({ start, end, level })
        }
        if (edges.size === 2) {
          const points = [...edges.values()]
          add(points[0]!, points[1]!)
        } else if (edges.size === 4) {
          const q = f[0]! * f[2]! - f[1]! * f[3]!
          if (q === 0) {
            const d = f[0]! - f[1]! + f[2]! - f[3]!
            const u = -(f[3]! - f[0]!) / d,
              v = -(f[1]! - f[0]!) / d
            const saddle: Point = [
              xs[i]! + u * (xs[i + 1]! - xs[i]!),
              ys[j]! + v * (ys[j + 1]! - ys[j]!),
            ]
            for (const edge of edges.values()) add(edge, saddle)
          } else {
            const pairs =
              q > 0
                ? [
                    [0, 1],
                    [2, 3],
                  ]
                : [
                    [0, 3],
                    [1, 2],
                  ]
            for (const [a, b] of pairs) add(edges.get(a!)!, edges.get(b!)!)
          }
        }
      }
  if (segments.some((s) => [...s.start, ...s.end].some((v) => !Number.isFinite(v))))
    throw new Error('插值超出数值精度，请先缩放。')
  return { xs, ys, levels, segments }
}

export function contourOption(
  samples: readonly Sample[],
  xName: string,
  yName: string,
  zName: string,
  title = '',
): EChartsOption {
  const { xs, ys, levels, segments } = contourGrid(samples)
  const colors = ['#1d4ed8', '#0891b2', '#059669', '#d97706', '#be123c']
  return {
    backgroundColor: '#fff',
    animation: false,
    title: {
      text: title,
      left: 'center',
      subtext: `${zName}等值线 · 完整矩形网格 · 边界内线性插值\n5 个等间距等值级；不外推、不自动补齐缺失网格`,
    },
    grid: { left: 80, right: 45, top: 90, bottom: 105 },
    xAxis: {
      type: 'value',
      name: xName,
      min: xs[0]!,
      max: xs.at(-1)!,
      nameLocation: 'middle',
      nameGap: 28,
      axisLine: { onZero: false },
    },
    yAxis: {
      type: 'value',
      name: yName,
      min: ys[0]!,
      max: ys.at(-1)!,
      nameLocation: 'middle',
      nameGap: 45,
      axisLine: { onZero: false },
    },
    legend: { bottom: 10, selectedMode: false },
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      formatter: (input) => {
        const item = Array.isArray(input) ? input[0] : input
        return item && Array.isArray(item.value) ? `${zName}等值：${item.value[4]}` : ''
      },
    },
    series: levels.map((level, index) => ({
      type: 'custom' as const,
      name: Number(level.toPrecision(6)).toString(),
      clip: true,
      dimensions: ['x1', 'y1', 'x2', 'y2', zName],
      encode: { x: [0, 2], y: [1, 3], tooltip: [4] },
      itemStyle: { color: colors[index]! },
      data: segments.filter((s) => s.level === level).map((s) => [...s.start, ...s.end, s.level]),
      renderItem: (_params, api) => {
        if (api.getWidth() < 400 || api.getHeight() < 300)
          throw new Error('等高线画布至少需要 400×300。')
        const a = api.coord([Number(api.value(0)), Number(api.value(1))]),
          b = api.coord([Number(api.value(2)), Number(api.value(3))])
        return {
          type: 'line',
          shape: { x1: a[0]!, y1: a[1]!, x2: b[0]!, y2: b[1]! },
          style: { stroke: colors[index]!, lineWidth: 2 },
          emphasis: { style: { lineWidth: 4 } },
        }
      },
    })),
  }
}
