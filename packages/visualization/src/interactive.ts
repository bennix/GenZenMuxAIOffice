import { init, type ECharts, type EChartsOption } from 'echarts'
import { buildChartOption, type ChartRequest } from './render'
import { assertHorizonSize } from './horizon'

/** Only Cartesian plots with one pair of axes get a shared range control. */
export function interactiveChartOption(request: ChartRequest): EChartsOption {
  const option = buildChartOption(request)
  if (request.chartId === 'horizon')
    return {
      ...option,
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: request.y.map((_, i) => i),
          filterMode: 'none',
          zoomOnMouseWheel: 'ctrl',
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          xAxisIndex: request.y.map((_, i) => i),
          filterMode: 'none',
          bottom: 42,
          height: 16,
          showDetail: false,
        },
      ],
      toolbox: { right: 8, top: 28, feature: { restore: { title: '重置视图' } } },
    }
  if (
    request.chartId === 'sparkline' ||
    option.visualMap ||
    !option.xAxis ||
    !option.yAxis ||
    Array.isArray(option.xAxis) ||
    Array.isArray(option.yAxis)
  )
    return option
  const axis =
    ['gantt', 'timeline', 'dendrogram'].includes(request.chartId) ||
    option.xAxis.type === 'category' ||
    option.yAxis.type !== 'category'
      ? 'x'
      : 'y'
  return {
    ...option,
    dataZoom: [
      {
        type: 'inside',
        ...(axis === 'x' ? { xAxisIndex: 0 } : { yAxisIndex: 0 }),
        filterMode: 'none',
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: false,
      },
      {
        type: 'slider',
        ...(axis === 'x'
          ? { xAxisIndex: 0, bottom: 32, height: 16 }
          : { yAxisIndex: 0, right: 4, width: 16 }),
        filterMode: 'none',
        showDetail: false,
      },
    ],
    toolbox: { right: 8, top: 28, feature: { restore: { title: '重置视图' } } },
  }
}

/** Mount a live chart; ownership of observers and renderer is returned to the caller. */
export function mountInteractiveChart(
  element: HTMLElement,
  request: ChartRequest,
): {
  chart: ECharts
  dispose: () => void
} {
  const option = interactiveChartOption(request)
  if (request.chartId === 'horizon')
    assertHorizonSize(element.clientWidth, element.clientHeight, request.y.length)
  const chart = init(element, undefined, { renderer: 'svg' })
  let observer: ResizeObserver | undefined
  try {
    chart.setOption(option)
    observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
  } catch (error) {
    observer?.disconnect()
    chart.dispose()
    throw error
  }
  return {
    chart,
    dispose: () => {
      observer?.disconnect()
      chart.dispose()
    },
  }
}
