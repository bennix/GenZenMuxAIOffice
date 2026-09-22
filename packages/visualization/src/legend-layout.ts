import { format, type EChartsOption, type GridComponentOption } from 'echarts'

function pixels(value: unknown, height: number, fallback: number): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.endsWith('%')) return (parseFloat(value) * height) / 100
  return fallback
}

function reserveGridSpace(
  grid: NonNullable<EChartsOption['grid']>,
  bottom: number,
  height: number,
) {
  const containment = {
    containLabel: false,
    outerBoundsMode: 'same' as const,
    outerBoundsContain: 'all' as const,
  }
  if (!Array.isArray(grid))
    return { ...grid, ...containment, bottom: Math.max(pixels(grid.bottom, height, 0), bottom) }
  // Keep the relative spacing of stacked panels while reserving a common footer.
  const bounds = grid.map((panel) => {
    const top = pixels(panel.top, height, 0)
    return {
      top,
      height: pixels(panel.height, height, height - top - pixels(panel.bottom, height, 0)),
    }
  })
  const top = Math.min(...bounds.map((panel) => panel.top))
  const end = Math.max(...bounds.map((panel) => panel.top + panel.height))
  const scale = Math.min(1, Math.max(0, height - bottom - top) / Math.max(1, end - top))
  return grid.map((panel, index): GridComponentOption => ({
    ...panel,
    ...containment,
    top: top + (bounds[index]!.top - top) * scale,
    height: bounds[index]!.height * scale,
  }))
}

/** Reserve separate bands for axis labels, range controls, and every legend row. */
export function layoutChartLegend(
  option: EChartsOption,
  width: number,
  height = 600,
): EChartsOption {
  const { legend, grid } = option
  if (!grid || !option.xAxis || !option.yAxis) return option
  // Heatmaps use a continuous color key rather than series names.
  if (
    option.visualMap &&
    !Array.isArray(option.visualMap) &&
    option.visualMap.orient === 'horizontal'
  ) {
    return { ...option, grid: reserveGridSpace(grid, 80, height) }
  }
  if (!legend || Array.isArray(legend) || legend.show === false || legend.orient === 'vertical')
    return option

  const series = Array.isArray(option.series) ? option.series : [option.series]
  const names = [
    ...new Set(
      legend.data
        ? legend.data.flatMap((entry) => {
            const name = typeof entry === 'string' ? entry : entry.name
            return name ? [name] : []
          })
        : series.flatMap((entry) => (entry?.name ? [String(entry.name)] : [])),
    ),
  ]
  if (!names.length) return option
  const available = Math.max(80, width - 40)
  const textWidth = Math.max(40, available - 40)
  const data: string[] = []
  let used = 0
  let rows = 1
  for (const name of names) {
    const itemWidth =
      Math.min(textWidth, format.getTextRect(name.replace(/\s+/g, ' '), '12px sans-serif').width) +
      40
    if (used > 0 && used + itemWidth > available) {
      data.push('')
      rows++
      used = 0
    }
    data.push(name)
    used += itemWidth
  }
  const legendHeight = rows * 24 + 10
  const zooms = option.dataZoom
    ? Array.isArray(option.dataZoom)
      ? option.dataZoom
      : [option.dataZoom]
    : []
  const hasSlider = zooms.some((zoom) => zoom.type === 'slider' && zoom.yAxisIndex === undefined)
  const footer = legendHeight + 16 + (hasSlider ? 30 : 0)
  return {
    ...option,
    legend: {
      ...legend,
      bottom: 0,
      left: 'center',
      width: available,
      data,
      itemWidth: 25,
      itemHeight: 14,
      itemGap: 10,
      formatter: (name: string) =>
        format.truncateText(name.replace(/\s+/g, ' '), textWidth, '12px sans-serif', '…'),
      textStyle: {
        ...legend.textStyle,
        fontSize: 12,
        lineHeight: 14,
      },
    },
    grid: reserveGridSpace(grid, footer, height),
    ...(zooms.length
      ? {
          dataZoom: zooms.map((zoom) => zoom),
        }
      : {}),
  }
}
