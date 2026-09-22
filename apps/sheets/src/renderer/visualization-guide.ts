import {
  chartCatalog,
  profileTable,
  recommendCharts,
  renderChartSvg,
  type ChartGroup,
  type ChartRequest,
  type DataTable,
} from '@genoffice/visualization'

export interface GuidedChart {
  request: ChartRequest
  reason: string
  svg: string
}

export function guidedCharts(table: DataTable, group: ChartGroup | ''): GuidedChart[] {
  const profiles = profileTable(table)
  const numeric = profiles.filter((p) => p.kind === 'number').map((p) => p.name)
  const category = profiles.find((p) => p.kind === 'category')?.name ?? table.columns[0]!
  const time = profiles.find((p) => p.kind === 'date')?.name
  const seeds = recommendCharts(table).map((item) => ({
    request: {
      chartId: item.chartId,
      table,
      x: item.columns.length > 1 ? item.columns[0]! : table.columns[0]!,
      y: item.columns.length > 1 ? item.columns.slice(1) : item.columns,
      title: '数据可视化',
    },
    reason: item.reason,
  }))
  if (numeric.length) {
    seeds.push(
      ...['column', 'grouped-column', 'boxplot'].map((chartId) => ({
        request: {
          chartId,
          table,
          x: category,
          y: numeric.slice(0, chartId === 'column' ? 1 : 3),
          title: '数据可视化',
        },
        reason:
          chartId === 'boxplot'
            ? '查看各数值列的分布与异常值；请确认它们量纲一致。'
            : '按类别比较数值；可以在下一步选择显示的指标。',
      })),
    )
    if (time)
      seeds.push({
        request: { chartId: 'area', table, x: time, y: numeric.slice(0, 1), title: '时间趋势' },
        reason: '按日期观察数值变化；保留数据中的行顺序。',
      })
  }
  const seen = new Set<string>()
  return seeds
    .flatMap(({ request, reason }) => {
      if (
        table.rows.length > 500 &&
        !['histogram', 'boxplot', 'calendar'].includes(request.chartId)
      )
        return []
      if (
        seen.has(request.chartId) ||
        (group && chartCatalog.find((c) => c.id === request.chartId)?.group !== group)
      )
        return []
      seen.add(request.chartId)
      try {
        return [{ request, reason, svg: renderChartSvg(request) }]
      } catch {
        return []
      }
    })
    .slice(0, 6)
}
