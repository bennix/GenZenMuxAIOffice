import { init, graphic, type EChartsOption } from 'echarts'
import { numericValue, validateTable, type DataTable } from './data'
import { boxSummary, histogram, kernelDensity, pearson } from './statistics'
import { buildHierarchy } from './hierarchy'
import { buildFlow, adjacencyMatrix } from './network'
import { waterfallSteps } from './waterfall'
import { distributionProfiles } from './distribution'
import { priceIntervals } from './ohlc'
import { rocCurve } from './roc'
import { kaplanMeier } from './survival'
import { residualPoints, sampleQq } from './diagnostics'
import { jitterPoints } from './jitter'
import { individualsControl } from './control'
import { waffleAllocation } from './waffle'
import { marimekkoCells } from './marimekko'
import { pyramidBands } from './pyramid'
import { calendarDays, calendarDate } from './calendar'
import { riverData } from './river'
import { icicleCells } from './icicle'
import { stemLeaves, stemLeafLines } from './stem-leaf'
import { swarmOffsets } from './beeswarm'
import { tabulate, tabulationOption } from './tabulation'
import { arcOption } from './arc'
import { forceNetworkOption } from './force-network'
import { wordCloudOption } from './word-cloud'
import { dendrogramOption } from './dendrogram'
import { hexbinOption } from './hexbin'
import { horizonOption, assertHorizonSize } from './horizon'
import { circlePackingOption } from './circle-packing'
import { contourOption } from './contour'

export interface ChartRequest {
  chartId: string
  table: DataTable
  x: string
  y: string[]
  title?: string
  parent?: string
  target?: string
}

export const renderedChartIds = [
  'column',
  'bar',
  'grouped-column',
  'stacked-column',
  'percent-column',
  'line',
  'smooth-line',
  'step',
  'area',
  'stacked-area',
  'sparkline',
  'pie',
  'donut',
  'semi-donut',
  'rose',
  'scatter',
  'histogram',
  'boxplot',
  'density',
  'radar',
  'parallel',
  'funnel',
  'dot',
  'heatmap',
  'correlation',
  'treemap',
  'sunburst',
  'tree',
  'sankey',
  'lollipop',
  'dumbbell',
  'slope',
  'waterfall',
  'bubble',
  'quadrant',
  'population-pyramid',
  'violin',
  'ridgeline',
  'candlestick',
  'ohlc',
  'forest',
  'roc',
  'kaplan-meier',
  'residual',
  'qq',
  'jitter',
  'control',
  'adjacency',
  'waffle',
  'gauge',
  'bullet',
  'scatter-matrix',
  'small-multiples',
  'marimekko',
  'pyramid',
  'progress',
  'kpi',
  'calendar',
  'stream',
  'theme-river',
  'icicle',
  'proportional-area',
  'dot-matrix',
  'text-heatmap',
  'matrix',
  'stem-leaf',
  'pictogram',
  'beeswarm',
  'gantt',
  'timeline',
  'table',
  'crosstab',
  'pivot',
  'arc',
  'force-network',
  'word-cloud',
  'dendrogram',
  'hexbin',
  'horizon',
  'circle-packing',
  'contour',
] as const

export function buildChartOption(request: ChartRequest): EChartsOption {
  const table = validateTable(request.table)
  const { chartId, title } = request
  if (!(renderedChartIds as readonly string[]).includes(chartId))
    throw new Error(`图形尚未接入渲染：${chartId}`)
  const xi = table.columns.indexOf(request.x)
  const yi = request.y.map((name) => table.columns.indexOf(name))
  if (xi < 0 || !yi.length || yi.some((i) => i < 0)) throw new Error('请选择有效的类别列和数值列。')
  if (new Set(request.y).size !== request.y.length) throw new Error('数值列不能重复。')
  if (['table', 'crosstab', 'pivot'].includes(chartId))
    return tabulationOption(tabulate(table, chartId, request.x, request.y, request.target), title)
  const ganttDates =
    (chartId === 'gantt' || chartId === 'timeline') &&
    yi.some((index) =>
      table.rows.some(
        (row) => typeof row[index] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(row[index])),
      ),
    )
  const values = yi.map((index) =>
    table.rows.map((row) => {
      const value = row[index]!
      if (value === null || value === '') return null
      if (ganttDates) {
        if (typeof value !== 'string') throw new Error('甘特图不能混用日期文本和数值时间。')
        return Date.parse(`${calendarDate(value)}T00:00:00Z`)
      }
      const number = numericValue(value)
      if (number === null) throw new Error(`列“${table.columns[index]}”包含非数值内容。`)
      return number
    }),
  )
  if (values.some((column) => column.every((value) => value === null)))
    throw new Error('数值列没有有效样本。')
  const labels = table.rows.map((row) => String(row[xi] ?? ''))
  if (chartId === 'contour') {
    if (yi.length !== 2) throw new Error('等高线需要 Y 坐标和高度 Z 两个字段。')
    return contourOption(
      table.rows.map((row, index) => {
        const x = numericValue(row[xi]!),
          y = values[0]![index],
          z = values[1]![index]
        if (x === null || y === null || y === undefined || z === null || z === undefined)
          throw new Error('等高线需要完整 X、Y、Z 数值。')
        return [x, y, z]
      }),
      request.x,
      request.y[0]!,
      request.y[1]!,
      title,
    )
  }
  if (chartId === 'horizon')
    return horizonOption(
      table.rows.map((row) => row[xi]!),
      values,
      request.y,
      title,
    )
  if (chartId === 'hexbin') {
    if (yi.length !== 1) throw new Error('六边形分箱的 Y 轴只选择一个数值列。')
    return hexbinOption(
      table.rows.map((row, index) => {
        const x = numericValue(row[xi]!),
          y = values[0]![index]
        if (x === null || y === null || y === undefined)
          throw new Error('六边形分箱需要完整有限的 X、Y 数值配对。')
        return [x, y]
      }),
      request.x,
      request.y[0]!,
      title,
    )
  }
  const common: EChartsOption = {
    backgroundColor: '#ffffff',
    animation: false,
    title: { text: title ?? '', left: 'center', textStyle: { fontSize: 20 } },
    tooltip: { trigger: 'item', renderMode: 'richText' },
    legend: { bottom: 0 },
    grid: { top: 65, bottom: 70, left: 75, right: 35 },
  }
  if (chartId === 'dendrogram')
    return dendrogramOption(
      labels,
      table.rows.map((_, index) => values.map((column) => column[index]!)),
      title,
    )
  if (chartId === 'word-cloud') {
    if (yi.length !== 1 || values[0]!.some((value) => value === null))
      throw new Error('词云需要一个完整的非负词频列。')
    return wordCloudOption(
      labels.map((word, index) => ({ word, value: values[0]![index]! })),
      title,
    )
  }
  if (chartId === 'timeline') {
    if (yi.length !== 1 || table.rows.length > 100 || values[0]!.some((value) => value === null))
      throw new Error('时间线需要一个完整的日期或数值时间列，最多 100 个事件。')
    return {
      ...common,
      useUTC: true,
      legend: { show: false },
      xAxis: {
        type: ganttDates ? 'time' : 'value',
        scale: true,
        name: ganttDates ? '日期' : '时间 / 期次',
      },
      yAxis: { type: 'category', data: labels, inverse: true },
      series: [
        {
          type: 'scatter',
          symbolSize: 10,
          dimensions: [{ name: '时间', type: ganttDates ? 'time' : 'float' }, '事件'],
          encode: { x: 0, y: 1, tooltip: [0] },
          data: table.rows.map((_, index) => ({
            name: labels[index]!,
            value: [values[0]![index]!, index],
          })),
        },
      ],
    }
  }
  if (chartId === 'gantt') {
    if (
      yi.length !== 2 ||
      table.rows.length > 100 ||
      values.some((column) => column.some((value) => value === null))
    )
      throw new Error('甘特图需要完整的起点和终点两列，最多 100 个任务。')
    if (values[0]!.some((start, index) => start! > values[1]![index]!))
      throw new Error('甘特图终点不能早于起点。')
    return {
      ...common,
      legend: { show: false },
      useUTC: true,
      xAxis: {
        type: ganttDates ? 'time' : 'value',
        scale: true,
        name: ganttDates ? '日期' : '时间 / 期次（原始单位）',
      },
      yAxis: { type: 'category', data: labels, inverse: true },
      series: [
        {
          type: 'custom',
          dimensions: [
            '任务',
            { name: '起点', type: ganttDates ? 'time' : 'float' },
            { name: '终点', type: ganttDates ? 'time' : 'float' },
          ],
          encode: { x: [1, 2], y: 0, tooltip: [1, 2] },
          data: table.rows.map((_, index) => [index, values[0]![index]!, values[1]![index]!]),
          renderItem: (params, api) => {
            const start = api.coord([api.value(1), api.value(0)])
            const end = api.coord([api.value(2), api.value(0)])
            const height = ((api.getHeight() - 135) / labels.length) * 0.6
            const bounds = params.coordSys as unknown as {
              x: number
              y: number
              width: number
              height: number
            }
            if (api.value(1) === api.value(2))
              return {
                type: 'circle',
                shape: { cx: start[0]!, cy: start[1]!, r: Math.min(5, height / 2) },
                invisible: start[0]! < bounds.x || start[0]! > bounds.x + bounds.width,
                style: { fill: '#2563eb' },
              }
            const shape = graphic.clipRectByRect(
              { x: start[0]!, y: start[1]! - height / 2, width: end[0]! - start[0]!, height },
              bounds,
            )
            if (!shape) return
            return {
              type: 'rect',
              shape,
              style: { fill: '#2563eb' },
            }
          },
        },
      ],
    }
  }
  if (chartId === 'beeswarm') {
    if (yi.length > 6 || table.rows.length * yi.length > 600)
      throw new Error('蜂群图最多 6 组、600 个样本单元格。')
    return {
      ...common,
      legend: { show: false },
      xAxis: { type: 'category', data: request.y },
      yAxis: { type: 'value', scale: true },
      series: values.map((column, group) => {
        const samples = column.filter((value): value is number => value !== null)
        return {
          type: 'custom',
          name: request.y[group]!,
          data: samples.map((value) => [group, value]),
          encode: { x: 0, y: 1, tooltip: [1] },
          renderItem: (params, api) => {
            const context = params.context as { offsets?: number[]; radius?: number }
            const coord = api.coord([group, api.value(1)])
            if (!context.offsets) {
              const positions = samples.map((value) => api.coord([group, value])[1]!)
              let radius = 4
              let offsets = swarmOffsets(positions, radius * 2 + 1)
              const halfBand = ((api.getWidth() - 110) / yi.length) * 0.42
              while (Math.max(...offsets.map(Math.abs)) + radius > halfBand && radius > 0.01) {
                radius *= 0.8
                offsets = swarmOffsets(positions, radius * 2 + radius / 4)
              }
              context.offsets = offsets
              context.radius = radius
            }
            return {
              type: 'circle',
              shape: {
                cx: coord[0]! + context.offsets[params.dataIndex]!,
                cy: coord[1]!,
                r: context.radius!,
              },
              style: { fill: '#2563eb' },
            }
          },
        }
      }),
    }
  }
  if (chartId === 'pictogram') {
    if (
      yi.length !== 1 ||
      table.rows.length > 20 ||
      values[0]!.some(
        (value) => value === null || !Number.isInteger(value) || value < 0 || value > 100,
      )
    )
      throw new Error('象形图需要 0–100 的完整整数数量，最多 20 个类别；每个图标代表 1。')
    const maximum = Math.max(1, ...(values[0]! as number[]))
    return {
      ...common,
      title: { ...(common.title as object), subtext: '每个人形图标 = 1' },
      legend: { show: false },
      grid: { top: 80, bottom: 45, left: 110, right: 45 },
      xAxis: { type: 'value', min: 0, max: maximum, minInterval: 1 },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        axisLabel: { width: 95, overflow: 'truncate' },
      },
      series: [
        {
          type: 'pictorialBar',
          name: request.y[0]!,
          symbol:
            'path://M5,0A2,2,0,1,1,5,4A2,2,0,1,1,5,0M2,5L8,5L9,11L7,11L7,18L5.5,18L5,12L4.5,18L3,18L3,11L1,11Z',
          symbolRepeat: true,
          symbolClip: true,
          symbolBoundingData: maximum,
          symbolRepeatDirection: 'start',
          symbolMargin: '10%',
          symbolSize: ['80%', '75%'],
          data: values[0]!.map((value) => ({ value: value!, symbolRepeat: maximum })),
          itemStyle: { color: '#2563eb' },
          label: { show: true, position: 'right' },
        },
      ],
    }
  }
  if (chartId === 'stem-leaf') {
    if (yi.length !== 1) throw new Error('茎叶图需要一个数值样本列。')
    const groups = stemLeaves(values[0]!)
    const lines = stemLeafLines(groups)
    return {
      ...common,
      legend: { show: false },
      title: { ...(common.title as object), subtext: '键：12 | 3 = 123；−0 | 3 = −3；空值忽略' },
      series: [
        {
          type: 'custom',
          coordinateSystem: 'none',
          data: lines.map((_, index) => [index]),
          renderItem: (_params, api) => {
            const index = Number(api.value(0)),
              line = lines[index]!
            const band = (api.getHeight() - 110) / lines.length
            return {
              type: 'text',
              style: {
                x: 30,
                y: 85 + index * band,
                text: line,
                fill: '#334155',
                fontFamily: 'monospace',
                fontSize: Math.max(
                  1,
                  Math.min(18, band * 0.8, ((api.getWidth() - 60) / line.length) * 1.5),
                ),
              },
            }
          },
        },
      ],
    }
  }
  if (chartId === 'sparkline') {
    if (yi.length !== 1) throw new Error('火花线需要一个数值系列。')
    return {
      ...common,
      legend: { show: false },
      grid: { top: title ? 55 : 12, bottom: 12, left: 12, right: 12 },
      xAxis: { type: 'category', data: labels, show: false, boundaryGap: false },
      yAxis: { type: 'value', show: false, scale: true },
      series: [
        {
          type: 'line',
          name: request.y[0]!,
          data: values[0]!,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2, color: '#2563eb' },
        },
      ],
    }
  }
  if (chartId === 'text-heatmap' || chartId === 'matrix') {
    if (table.rows.length > 50 || yi.length > 20)
      throw new Error('矩阵热力图最多显示 50 个类别和 20 个数值字段。')
    if (new Set(labels).size !== labels.length || labels.some((label) => !label.trim()))
      throw new Error('矩阵热力图需要非空且唯一的类别。')
    const cells = values.flatMap((column, x) =>
      column.flatMap((value, y) => (value === null ? [] : [[x, y, value]])),
    )
    const measurements = cells.map((cell) => cell[2]!)
    const min = Math.min(...measurements),
      max = Math.max(...measurements)
    return {
      ...common,
      legend: { show: false },
      grid: { top: 80, bottom: 80, left: 140, right: 30 },
      xAxis: {
        type: 'category',
        data: request.y,
        position: 'top',
        splitArea: { show: true },
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        splitArea: { show: true },
        axisLabel: { width: 120, overflow: 'truncate' },
      },
      visualMap: {
        min: min === max ? Math.min(0, min) : min,
        max: min === max ? Math.max(1, max) : max,
        orient: 'horizontal',
        left: 'center',
        bottom: 10,
        calculable: true,
        inRange: { color: ['#eff6ff', '#60a5fa', '#1e3a8a'] },
      },
      series: [
        {
          type: 'heatmap',
          data: cells,
          label: { show: true },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
        },
      ],
    }
  }
  if (chartId === 'dot-matrix') {
    if (
      yi.length !== 1 ||
      table.rows.length > 20 ||
      values[0]!.some(
        (value) => value === null || !Number.isInteger(value) || value < 0 || value > 100,
      )
    )
      throw new Error('点阵图需要一个完整的 0–100 整数列，最多 20 行；每个圆点代表 1。')
    const maximum = Math.max(...(values[0]! as number[]))
    const dotsPerRow = 10
    const subrows = Math.max(1, Math.ceil(maximum / dotsPerRow))
    return {
      ...common,
      title: {
        ...(common.title as object),
        subtext: '每个圆点 = 1',
        subtextStyle: { color: '#475569' },
      },
      legend: { show: false },
      series: [
        {
          type: 'custom',
          coordinateSystem: 'none',
          dimensions: ['index', '数量'],
          encode: { tooltip: [1] },
          data: values[0]!.map((value, index) => ({
            name: labels[index]!,
            value: [index, value!],
          })),
          renderItem: (_params, api) => {
            const index = Number(api.value(0)),
              count = Number(api.value(1))
            const band = (api.getHeight() - 110) / table.rows.length
            const pitch = Math.min((api.getWidth() - 170) / dotsPerRow, band / (subrows + 1))
            const top = 85 + index * band
            return {
              type: 'group',
              children: [
                {
                  type: 'text',
                  style: {
                    x: 20,
                    y: top + band / 2,
                    text: `${labels[index]} (${count})`,
                    width: 120,
                    overflow: 'truncate',
                    fill: '#334155',
                    fontSize: 12,
                    verticalAlign: 'middle',
                  },
                },
                ...Array.from({ length: count }, (_, dot) => ({
                  type: 'circle' as const,
                  shape: {
                    cx: 150 + ((dot % dotsPerRow) + 0.5) * pitch,
                    cy: top + (Math.floor(dot / dotsPerRow) + 0.5) * pitch,
                    r: pitch * 0.36,
                  },
                  style: { fill: '#2563eb' },
                })),
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'proportional-area') {
    if (
      yi.length !== 1 ||
      table.rows.length > 40 ||
      values[0]!.some((value) => value === null || value < 0)
    )
      throw new Error('比例面积图需要一个完整非负数值列，最多 40 个类别。')
    const maximum = Math.max(...(values[0]! as number[]))
    if (maximum <= 0) throw new Error('比例面积图至少需要一个正数。')
    const columns = Math.ceil(Math.sqrt(table.rows.length))
    const rows = Math.ceil(table.rows.length / columns)
    return {
      ...common,
      legend: { show: false },
      series: [
        {
          type: 'custom',
          coordinateSystem: 'none',
          dimensions: ['index', '数值'],
          encode: { tooltip: [1] },
          data: values[0]!.map((value, index) => ({
            name: labels[index]!,
            value: [index, value!],
          })),
          renderItem: (_params, api) => {
            const index = Number(api.value(0)),
              value = Number(api.value(1))
            const cellWidth = (api.getWidth() - 60) / columns
            const cellHeight = (api.getHeight() - 110) / rows
            const maximumRadius = Math.min(cellWidth * 0.4, cellHeight * 0.3)
            const radius = Math.sqrt(value / maximum) * maximumRadius
            const x = 30 + ((index % columns) + 0.5) * cellWidth
            const y =
              65 +
              (Math.floor(index / columns) + 0.5) * cellHeight -
              Math.min(16, cellHeight * 0.15)
            return {
              type: 'group',
              children: [
                { type: 'circle', shape: { cx: x, cy: y, r: radius }, style: { fill: '#2563eb' } },
                {
                  type: 'text',
                  style: {
                    x,
                    y: y + maximumRadius + 8,
                    text: `${labels[index]}: ${value}`,
                    align: 'center',
                    verticalAlign: 'top',
                    fill: '#334155',
                    fontSize: 13,
                    width: cellWidth - 8,
                    overflow: 'truncate',
                  },
                },
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'stream' || chartId === 'theme-river') {
    const river = riverData(
      table.rows.map((row) => row[xi]!),
      values,
      request.y,
      chartId === 'theme-river',
    )
    return {
      ...common,
      useUTC: true,
      singleAxis: {
        type: river.axisType,
        top: 75,
        bottom: 75,
        left: 85,
        right: 35,
        axisLabel: { hideOverlap: true },
      },
      series: [
        {
          type: 'themeRiver',
          coordinateSystem: 'singleAxis',
          data: river.data,
          boundaryGap: ['5%', '5%'],
          label: { show: true },
          emphasis: { focus: 'series' },
        },
      ],
    }
  }
  if (chartId === 'calendar') {
    if (yi.length !== 1) throw new Error('日历热力图需要一个数值列。')
    const { data, years } = calendarDays(labels, values[0]!)
    const totals = data.map(([, value]) => value)
    const min = Math.min(...totals),
      max = Math.max(...totals)
    return {
      ...common,
      legend: { show: false },
      visualMap: {
        type: 'continuous',
        min: min === max ? Math.min(0, min) : min,
        max: min === max ? (max > 0 ? max : 0) || 1 : max,
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        calculable: true,
        inRange: { color: ['#eff6ff', '#60a5fa', '#1e3a8a'] },
      },
      calendar: years.map((year, index) => ({
        range: String(year),
        left: 75,
        right: 30,
        top: `${16 + index * (66 / years.length)}%`,
        height: `${Math.min(25, 48 / years.length)}%`,
        cellSize: ['auto', 'auto'],
        dayLabel: { firstDay: 1, nameMap: ['日', '一', '二', '三', '四', '五', '六'] },
        monthLabel: {
          nameMap: [
            '1月',
            '2月',
            '3月',
            '4月',
            '5月',
            '6月',
            '7月',
            '8月',
            '9月',
            '10月',
            '11月',
            '12月',
          ],
        },
        yearLabel: { position: 'left' },
        itemStyle: { color: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1 },
      })),
      series: years.map((year, index) => ({
        type: 'heatmap',
        coordinateSystem: 'calendar',
        calendarIndex: index,
        name: request.y[0]!,
        data: data.filter(([date]) => date.startsWith(String(year))),
      })),
    }
  }
  if (chartId === 'kpi') {
    if (yi.length !== 1 || table.rows.length > 12 || values[0]!.some((value) => value === null))
      throw new Error('KPI 卡片需要一个完整数值列，最多 12 个指标。')
    const columns = Math.min(3, table.rows.length),
      rows = Math.ceil(table.rows.length / columns)
    return {
      ...common,
      legend: { show: false },
      series: [
        {
          type: 'custom',
          coordinateSystem: 'none',
          data: values[0]!.map((value, i) => [i, value!]),
          renderItem: (_params, api) => {
            const index = Number(api.value(0)),
              text = String(api.value(1))
            const width = (api.getWidth() - 60) / columns,
              height = (api.getHeight() - 105) / rows
            const left = 30 + (index % columns) * width,
              top = 65 + Math.floor(index / columns) * height
            const fontSize = Math.max(
              10,
              Math.min(36, height * 0.35, ((width - 32) / Math.max(1, text.length)) * 1.5),
            )
            return {
              type: 'group',
              children: [
                {
                  type: 'rect',
                  shape: { x: left + 5, y: top + 5, width: width - 10, height: height - 10, r: 8 },
                  style: { fill: '#f8fafc', stroke: '#cbd5e1' },
                },
                {
                  type: 'text',
                  style: {
                    x: left + width / 2,
                    y: top + height * 0.35,
                    text: labels[index]!,
                    align: 'center',
                    verticalAlign: 'middle',
                    width: width - 32,
                    overflow: 'truncate',
                    fontSize: Math.max(10, Math.min(16, height * 0.18)),
                    fill: '#475569',
                  },
                },
                {
                  type: 'text',
                  style: {
                    x: left + width / 2,
                    y: top + height * 0.67,
                    text,
                    align: 'center',
                    verticalAlign: 'middle',
                    fontSize,
                    fontWeight: 'bold',
                    fill: '#0f172a',
                  },
                },
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'progress') {
    if (yi.length !== 2 || values.some((column) => column.some((v) => v === null)))
      throw new Error('进度条需要完整的已完成值和目标值两列。')
    const percentages = values[0]!.map((value, i) => {
      const target = values[1]![i]!
      if (value! < 0 || target <= 0) throw new Error('已完成值必须非负，目标值必须大于零。')
      const percent = (value! / target) * 100
      if (!Number.isFinite(percent)) throw new Error('进度百分比超出数值范围。')
      return percent
    })
    return {
      ...common,
      legend: { show: false },
      xAxis: {
        type: 'value',
        min: 0,
        max: percentages.reduce((max, value) => Math.max(max, value), 100),
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: { type: 'category', data: labels, inverse: true },
      series: [
        {
          type: 'bar',
          name: '完成进度',
          data: percentages,
          showBackground: true,
          label: {
            show: true,
            position: 'insideRight',
            formatter: (params) => `${Number(params.value).toFixed(1)}%`,
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [{ xAxis: 100, name: '目标' }],
          },
        },
      ],
    }
  }
  if (chartId === 'pyramid') {
    if (yi.length !== 1 || values[0]!.some((value) => value === null))
      throw new Error('金字塔图需要一个完整非负数值列。')
    const bands = pyramidBands(values[0]! as number[])
    return {
      ...common,
      series: bands.map((band, i) => ({
        type: 'custom',
        coordinateSystem: 'none',
        name: labels[i]!,
        data: [[band.top, band.bottom]],
        tooltip: {
          formatter: `${labels[i]}\n数值：${values[0]![i]}\n占比：${(band.share * 100).toFixed(2)}%`,
        },
        renderItem: (_params, api) => {
          const center = api.getWidth() / 2,
            halfWidth = (api.getWidth() - 120) / 2,
            height = api.getHeight() - 140
          return {
            type: 'polygon',
            shape: {
              points: [
                [center - halfWidth * band.top, 65 + height * band.top],
                [center + halfWidth * band.top, 65 + height * band.top],
                [center + halfWidth * band.bottom, 65 + height * band.bottom],
                [center - halfWidth * band.bottom, 65 + height * band.bottom],
              ],
            },
            style: {
              fill: String(api.visual('color')),
              stroke: '#ffffff',
              lineWidth: band.share > 0 ? 1 : 0,
              opacity: band.share > 0 ? 1 : 0,
            },
          }
        },
      })),
    }
  }
  if (chartId === 'marimekko') {
    if (values.some((column) => column.some((v) => v === null)))
      throw new Error('Marimekko 数值不能为空。')
    const cells = marimekkoCells(table.rows.map((_, i) => values.map((column) => column[i]!)))
    return {
      ...common,
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        name: '累计总量占比',
        axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` },
      },
      series: request.y.map((name, series) => ({
        name,
        type: 'custom',
        encode: { x: [0, 2], y: [1, 3], tooltip: [4] },
        data: cells
          .filter((cell) => cell.series === series && cell.width > 0 && cell.height > 0)
          .map((cell) => ({
            name: labels[cell.category]!,
            value: [
              cell.left,
              cell.bottom,
              cell.left + cell.width,
              cell.bottom + cell.height,
              cell.value,
            ],
          })),
        renderItem: (_params, api) => {
          const first = api.coord([Number(api.value(0)), Number(api.value(1))]),
            last = api.coord([Number(api.value(2)), Number(api.value(3))])
          return {
            type: 'rect',
            shape: {
              x: first[0]!,
              y: last[1]!,
              width: last[0]! - first[0]!,
              height: first[1]! - last[1]!,
            },
            style: { fill: String(api.visual('color')), stroke: '#ffffff', lineWidth: 1 },
          }
        },
      })),
    }
  }
  if (chartId === 'small-multiples') {
    if (yi.length < 2 || yi.length > 6) throw new Error('小倍数图需要 2–6 个数值系列。')
    const range = values.reduce<[number, number]>(
      (range, column) =>
        column.reduce<[number, number]>(
          (bounds, v) => (v === null ? bounds : [Math.min(bounds[0], v), Math.max(bounds[1], v)]),
          range,
        ),
      [0, 0],
    )
    const rows = Math.ceil(yi.length / 2)
    const grids = values.map((_, i) => ({
      left: `${10 + (i % 2) * 47}%`,
      top: `${15 + (Math.floor(i / 2) * 75) / rows}%`,
      width: '34%',
      height: `${53 / rows}%`,
    }))
    return {
      ...common,
      legend: { show: false },
      grid: grids,
      xAxis: values.map((_, i) => ({
        type: 'category',
        gridIndex: i,
        data: labels,
        axisLabel: { hideOverlap: true },
      })),
      yAxis: values.map((_, i) => ({
        type: 'value',
        gridIndex: i,
        min: range[0],
        max: range[1] === range[0] ? range[1] + 1 : range[1],
        name: request.y[i]!,
      })),
      series: values.map((column, i) => ({
        type: 'bar',
        name: request.y[i]!,
        xAxisIndex: i,
        yAxisIndex: i,
        data: column,
      })),
    }
  }
  if (chartId === 'scatter-matrix') {
    if (yi.length < 2 || yi.length > 6) throw new Error('散点矩阵需要 2–6 个数值列。')
    const count = yi.length
    const extents = values.map((column) =>
      column.reduce<[number, number]>(
        (range, value) =>
          value === null ? range : [Math.min(range[0], value), Math.max(range[1], value)],
        [Infinity, -Infinity],
      ),
    )
    const grids: Exclude<NonNullable<EChartsOption['grid']>, unknown[]>[] = []
    const xAxes: Exclude<NonNullable<EChartsOption['xAxis']>, unknown[]>[] = []
    const yAxes: Exclude<NonNullable<EChartsOption['yAxis']>, unknown[]>[] = []
    const series: Exclude<NonNullable<EChartsOption['series']>, unknown[]>[] = []
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++) {
        const index = row * count + col
        grids.push({
          left: `${10 + (col * 82) / count}%`,
          top: `${13 + (row * 74) / count}%`,
          width: `${70 / count}%`,
          height: `${62 / count}%`,
        })
        const xRange = extents[col]!,
          yRange = extents[row]!
        xAxes.push({
          gridIndex: index,
          type: 'value',
          min: xRange[0],
          max: xRange[1] === xRange[0] ? xRange[0] + 1 : xRange[1],
          name: row === count - 1 ? request.y[col]! : '',
          nameLocation: 'middle',
          nameGap: 24,
          axisLabel: { show: row === count - 1 },
          splitNumber: 2,
        })
        yAxes.push({
          gridIndex: index,
          type: 'value',
          min: yRange[0],
          max: yRange[1] === yRange[0] ? yRange[0] + 1 : yRange[1],
          name: col === 0 ? request.y[row]! : '',
          axisLabel: { show: col === 0 },
          splitNumber: 2,
        })
        series.push({
          type: 'scatter',
          xAxisIndex: index,
          yAxisIndex: index,
          name: `${request.y[col]} × ${request.y[row]}`,
          symbolSize: 4,
          data: values[col]!.flatMap((value, i) =>
            value === null || values[row]![i] === null ? [] : [[value, values[row]![i]!]],
          ),
          itemStyle: { opacity: 0.65 },
        })
      }
    return { ...common, legend: { show: false }, grid: grids, xAxis: xAxes, yAxis: yAxes, series }
  }
  if (chartId === 'bullet') {
    if (yi.length !== 5 || values.some((column) => column.some((v) => v === null || v < 0)))
      throw new Error(
        '子弹图需要五个完整非负数值列：实际值、目标值、区间一上限、区间二上限、量程上限。',
      )
    const data = table.rows.map((_, i) => {
      const [actual, target, first, second, maximum] = values.map((column) => column[i]!)
      if (!(
        first! <= second! &&
        second! <= maximum! &&
        maximum! > 0 &&
        actual! <= maximum! &&
        target! <= maximum!
      ))
        throw new Error('子弹图区间必须递增，且实际值和目标值不能超过量程上限。')
      return [i, actual!, target!, first!, second!, maximum!]
    })
    return {
      ...common,
      legend: { show: false },
      xAxis: { type: 'value', min: 0 },
      yAxis: { type: 'category', data: labels, inverse: true },
      series: [
        {
          type: 'custom',
          data,
          dimensions: ['指标', '实际值', '目标值', '区间一上限', '区间二上限', '量程上限'],
          encode: { x: [1, 2, 5], y: 0, tooltip: [1, 2, 3, 4, 5] },
          renderItem: (_params, api) => {
            const row = Number(api.value(0)),
              origin = api.coord([0, row])
            const height = Math.min(40, Math.abs(api.coord([0, row + 1])[1]! - origin[1]!) * 0.65)
            const rect = (value: number, fill: string, factor: number) => ({
              type: 'rect' as const,
              shape: {
                x: origin[0]!,
                y: origin[1]! - (height * factor) / 2,
                width: api.coord([value, row])[0]! - origin[0]!,
                height: height * factor,
              },
              style: { fill },
            })
            const target = api.coord([Number(api.value(2)), row])
            return {
              type: 'group',
              children: [
                rect(Number(api.value(5)), '#e2e8f0', 1),
                rect(Number(api.value(4)), '#cbd5e1', 1),
                rect(Number(api.value(3)), '#94a3b8', 1),
                rect(Number(api.value(1)), '#2563eb', 0.4),
                {
                  type: 'line',
                  shape: {
                    x1: target[0]!,
                    y1: target[1]! - height * 0.4,
                    x2: target[0]!,
                    y2: target[1]! + height * 0.4,
                  },
                  style: { stroke: '#0f172a', lineWidth: 3 },
                },
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'gauge') {
    if (table.rows.length !== 1 || yi.length !== 3 || values.some((column) => column[0] === null))
      throw new Error('仪表图需要一行数据及当前值、最小值、最大值三个完整数值列。')
    const value = values[0]![0]!,
      minimum = values[1]![0]!,
      maximum = values[2]![0]!
    if (!(minimum < maximum) || !Number.isFinite(maximum - minimum))
      throw new Error('仪表量程必须满足最小值 < 最大值，且跨度有限。')
    if (value < minimum || value > maximum)
      throw new Error('当前值超出仪表量程，请调整最小值或最大值。')
    return {
      ...common,
      legend: { show: false },
      series: [
        {
          type: 'gauge',
          min: minimum,
          max: maximum,
          startAngle: 210,
          endAngle: -30,
          center: ['50%', '58%'],
          radius: '65%',
          progress: { show: true, width: 16 },
          axisLine: { lineStyle: { width: 16 } },
          pointer: { show: true },
          detail: {
            valueAnimation: false,
            formatter: '{value}',
            fontSize: 28,
            offsetCenter: [0, '65%'],
          },
          title: { offsetCenter: [0, '90%'], fontSize: 16 },
          data: [{ value, name: labels[0]! }],
        },
      ],
    }
  }
  if (chartId === 'waffle') {
    if (yi.length !== 1 || values[0]!.some((value) => value === null))
      throw new Error('华夫饼图需要一个完整非负数值列。')
    const allocation = waffleAllocation(values[0]! as number[])
    let next = 0
    return {
      ...common,
      xAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
      yAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
      series: allocation.counts.map((count, i) => ({
        type: 'custom',
        coordinateSystem: 'none',
        name: `${labels[i]} (${(allocation.shares[i]! * 100).toFixed(2)}%)`,
        renderItem: (_params, api) => {
          const unit = Math.max(
            2,
            Math.min((api.getWidth() - 80) / 10, (api.getHeight() - 140) / 10),
          )
          return {
            type: 'rect',
            shape: {
              x: (api.getWidth() - unit * 10) / 2 + Number(api.value(0)) * unit,
              y: 65 + (9 - Number(api.value(1))) * unit,
              width: unit * 0.88,
              height: unit * 0.88,
            },
            style: { fill: String(api.visual('color')) },
          }
        },
        data: Array.from({ length: count }, () => {
          const index = next++
          return [index % 10, Math.floor(index / 10)]
        }),
        tooltip: {
          formatter: `${labels[i]}\n数值：${values[0]![i]}\n实际占比：${(allocation.shares[i]! * 100).toFixed(2)}%\n方格数：${count}/100`,
        },
      })),
    }
  }
  if (chartId === 'control') {
    if (yi.length !== 1 || values[0]!.some((value) => value === null))
      throw new Error('控制图需要一个完整数值列。')
    const samples = values[0]! as number[]
    const limits = individualsControl(samples)
    return {
      ...common,
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', scale: true },
      series: [
        {
          type: 'line',
          name: request.y[0]!,
          data: samples,
          symbolSize: 6,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            label: { formatter: '{b}: {c}', position: 'insideEndTop' },
            data: [
              { yAxis: limits.center, name: '中心线' },
              { yAxis: limits.lower, name: 'LCL' },
              { yAxis: limits.upper, name: 'UCL' },
            ],
          },
        },
        {
          type: 'scatter',
          name: '超出 3σ 控制界限',
          data: limits.outside.map((i) => [i, samples[i]!]),
          symbolSize: 12,
          itemStyle: { color: '#dc2626' },
        },
      ],
    }
  }
  if (chartId === 'jitter')
    return {
      ...common,
      xAxis: {
        type: 'value',
        min: -1,
        max: values.length,
        interval: 1,
        axisLabel: {
          formatter: (value: number) => (Number.isInteger(value) ? (request.y[value] ?? '') : ''),
        },
        splitLine: { show: false },
      },
      yAxis: { type: 'value', name: '样本值', scale: true },
      series: values.map((column, group) => ({
        type: 'scatter',
        name: request.y[group]!,
        data: jitterPoints(column, group),
        symbolSize: 7,
        dimensions: ['组内位置', '样本值', '原始行索引'],
        encode: { x: 0, y: 1, tooltip: [1, 2] },
        itemStyle: { opacity: 0.65 },
      })),
    }
  if (chartId === 'residual' || chartId === 'qq') {
    if (yi.length !== 2) throw new Error('残差图和双样本 QQ 图需要两个数值列。')
    const residual = chartId === 'residual'
    const data = residual
      ? residualPoints(values[0]!, values[1]!)
      : sampleQq(values[0]!, values[1]!)
    const minimum = data.reduce((min, p) => Math.min(min, p[0], p[1]), Infinity)
    const maximum = data.reduce((max, p) => Math.max(max, p[0], p[1]), -Infinity)
    return {
      ...common,
      xAxis: { type: 'value', name: residual ? '预测值' : request.y[0]!, scale: true },
      yAxis: { type: 'value', name: residual ? '残差（实际 − 预测）' : request.y[1]!, scale: true },
      series: [
        {
          type: 'scatter',
          name: residual ? '残差' : '样本分位数',
          data,
          dimensions: residual
            ? ['预测值', '残差', '原始行索引']
            : [request.y[0]!, request.y[1]!, '分位点'],
          encode: { x: 0, y: 1, tooltip: [0, 1, 2] },
          ...(residual
            ? { markLine: { silent: true, symbol: ['none', 'none'], data: [{ yAxis: 0 }] } }
            : {}),
        },
        ...(!residual
          ? [
              {
                type: 'line' as const,
                name: '相等参考线',
                data: [
                  [minimum, minimum],
                  [maximum, maximum],
                ],
                symbol: 'none',
                silent: true,
                lineStyle: { type: 'dashed' as const },
              },
            ]
          : []),
      ],
    }
  }
  if (chartId === 'kaplan-meier') {
    if (yi.length !== 2 || values.some((column) => column.some((v) => v === null)))
      throw new Error('生存曲线需要完整的观测时间和事件状态列。')
    const curve = kaplanMeier(values[0]! as number[], values[1]! as number[])
    return {
      ...common,
      xAxis: { type: 'value', min: 0, name: request.y[0]! },
      yAxis: { type: 'value', min: 0, max: 1, name: '生存概率' },
      series: [
        { type: 'line', name: 'Kaplan–Meier', data: curve.points, step: 'end', showSymbol: false },
        {
          type: 'scatter',
          name: '删失',
          data: curve.censored,
          symbol: 'rect',
          symbolSize: [2, 12],
          dimensions: ['时间', '生存概率', '删失人数'],
          encode: { x: 0, y: 1, tooltip: [0, 1, 2] },
        },
      ],
    }
  }
  if (chartId === 'roc') {
    if (yi.length !== 2 || values.some((column) => column.some((v) => v === null)))
      throw new Error('ROC 需要两个完整数值列：真实标签（0/1）、预测分数。')
    const curve = rocCurve(values[0]! as number[], values[1]! as number[])
    return {
      ...common,
      title: {
        text: title ?? '',
        left: 'center',
        subtext: `AUC = ${curve.auc.toFixed(4)} · 正类 ${curve.positives} · 负类 ${curve.negatives}`,
      },
      grid: { top: 85, bottom: 75, left: 85, right: 50 },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        name: '假阳性率',
        nameLocation: 'middle',
        nameGap: 30,
      },
      yAxis: { type: 'value', min: 0, max: 1, name: '真阳性率' },
      series: [
        { type: 'line', name: 'ROC', data: curve.points, showSymbol: true, symbolSize: 5 },
        {
          type: 'line',
          name: '随机分类基线',
          data: [
            [0, 0],
            [1, 1],
          ],
          symbol: 'none',
          silent: true,
          lineStyle: { type: 'dashed', color: '#64748b' },
        },
      ],
    }
  }
  if (chartId === 'forest') {
    if (yi.length !== 3) throw new Error('森林图需要三个数值列：估计值、区间下限、区间上限。')
    const data = table.rows.map((_, i) => {
      const estimate = values[0]![i]!,
        lower = values[1]![i]!,
        upper = values[2]![i]!
      if (estimate === null || lower === null || upper === null)
        throw new Error('森林图每行的估计值和区间必须完整。')
      if (lower > estimate || estimate > upper)
        throw new Error('森林图区间必须满足下限 ≤ 估计值 ≤ 上限。')
      return [i, estimate, lower, upper]
    })
    return {
      ...common,
      legend: { show: false },
      xAxis: { type: 'value', name: request.y[0]!, scale: true },
      yAxis: { type: 'category', data: labels, inverse: true },
      series: [
        {
          type: 'custom',
          data,
          dimensions: ['研究', '估计值', '区间下限', '区间上限'],
          encode: { x: [1, 2, 3], y: 0, tooltip: [1, 2, 3] },
          renderItem: (_params, api) => {
            const row = Number(api.value(0))
            const estimate = api.coord([Number(api.value(1)), row]),
              lower = api.coord([Number(api.value(2)), row]),
              upper = api.coord([Number(api.value(3)), row])
            const style = { stroke: String(api.visual('color')), lineWidth: 2 }
            return {
              type: 'group',
              children: [
                {
                  type: 'line',
                  shape: { x1: lower[0]!, y1: lower[1]!, x2: upper[0]!, y2: upper[1]! },
                  style,
                },
                {
                  type: 'line',
                  shape: { x1: lower[0]!, y1: lower[1]! - 5, x2: lower[0]!, y2: lower[1]! + 5 },
                  style,
                },
                {
                  type: 'line',
                  shape: { x1: upper[0]!, y1: upper[1]! - 5, x2: upper[0]!, y2: upper[1]! + 5 },
                  style,
                },
                {
                  type: 'rect',
                  shape: { x: estimate[0]! - 4, y: estimate[1]! - 4, width: 8, height: 8 },
                  style: { fill: String(api.visual('color')) },
                },
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'candlestick' || chartId === 'ohlc') {
    const prices = priceIntervals(values)
    const axes: EChartsOption = {
      ...common,
      legend: { show: false },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', scale: true },
      dataZoom: [{ type: 'inside' }],
    }
    if (chartId === 'candlestick')
      return {
        ...axes,
        series: [
          {
            type: 'candlestick',
            data: prices,
            itemStyle: {
              color: '#dc2626',
              color0: '#059669',
              borderColor: '#dc2626',
              borderColor0: '#059669',
            },
          },
        ],
      }
    return {
      ...axes,
      series: [
        {
          type: 'custom',
          dimensions: ['期次', '开盘', '收盘', '最低', '最高'],
          encode: { x: 0, y: [3, 4], tooltip: [1, 2, 3, 4] },
          data: prices.map((price, i) => [i, ...price]),
          renderItem: (_params, api) => {
            const index = Number(api.value(0))
            const open = api.coord([index, Number(api.value(1))]),
              close = api.coord([index, Number(api.value(2))])
            const low = api.coord([index, Number(api.value(3))]),
              high = api.coord([index, Number(api.value(4))])
            const width = Math.abs(api.coord([index + 1, 0])[0]! - open[0]!) * 0.25
            const style = {
              stroke: Number(api.value(2)) >= Number(api.value(1)) ? '#dc2626' : '#059669',
              lineWidth: 2,
            }
            return {
              type: 'group',
              children: [
                {
                  type: 'line',
                  shape: { x1: low[0]!, y1: low[1]!, x2: high[0]!, y2: high[1]! },
                  style,
                },
                {
                  type: 'line',
                  shape: { x1: open[0]! - width, y1: open[1]!, x2: open[0]!, y2: open[1]! },
                  style,
                },
                {
                  type: 'line',
                  shape: { x1: close[0]!, y1: close[1]!, x2: close[0]! + width, y2: close[1]! },
                  style,
                },
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'population-pyramid') {
    if (yi.length !== 2 || values.some((column) => column.some((v) => v === null || v < 0)))
      throw new Error('人口金字塔需要两个完整非负数值列，依次为左侧和右侧人群。')
    const maximum = values.reduce(
      (max, column) => column.reduce<number>((m, v) => Math.max(m, v!), max),
      0,
    )
    if (maximum === 0) throw new Error('人口金字塔至少需要一个正数。')
    return {
      ...common,
      xAxis: {
        type: 'value',
        min: -maximum,
        max: maximum,
        axisLabel: { formatter: (v: number) => String(Math.abs(v)) },
      },
      yAxis: { type: 'category', data: labels },
      series: values.map((column, j) => ({
        type: 'bar',
        name: request.y[j]!,
        stack: 'population',
        data: column.map((v) => (j === 0 ? -v! : v!)),
        tooltip: { valueFormatter: (v) => String(Math.abs(Number(v))) },
      })),
    }
  }
  if (chartId === 'bubble' || chartId === 'quadrant') {
    if (yi.length !== (chartId === 'bubble' ? 2 : 1))
      throw new Error(
        chartId === 'bubble'
          ? '气泡图需要两个数值列，依次为纵轴和气泡面积。'
          : '象限图需要一个纵轴数值列。',
      )
    const data = table.rows.flatMap((row, i) => {
      const raw = row[xi]
      const horizontal = numericValue(raw!)
      if (horizontal === null && raw !== null && raw !== '') throw new Error('横轴必须为数值。')
      const vertical = values[0]![i]!
      const area = chartId === 'bubble' ? values[1]![i]! : 1
      if (area !== null && area < 0) throw new Error('气泡面积必须为非负数。')
      return horizontal === null || vertical === null || area === null
        ? []
        : [[horizontal, vertical, area]]
    })
    if (!data.length) throw new Error('没有完整的成对观测。')
    const maxArea = data.reduce((max, point) => Math.max(max, point[2]!), 0)
    if (chartId === 'bubble' && maxArea === 0) throw new Error('气泡面积至少需要一个正数。')
    const xExtent = data.reduce((max, point) => Math.max(max, Math.abs(point[0]!)), 0) || 1
    const yExtent = data.reduce((max, point) => Math.max(max, Math.abs(point[1]!)), 0) || 1
    return {
      ...common,
      xAxis: {
        type: 'value',
        name: request.x,
        ...(chartId === 'quadrant' ? { min: -xExtent, max: xExtent } : {}),
      },
      yAxis: {
        type: 'value',
        name: request.y[0]!,
        ...(chartId === 'quadrant' ? { min: -yExtent, max: yExtent } : {}),
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'inside', yAxisIndex: 0 },
      ],
      series: [
        {
          type: 'scatter',
          name: request.y[0]!,
          data,
          dimensions: [request.x, ...request.y],
          encode: { x: 0, y: 1, tooltip: chartId === 'bubble' ? [0, 1, 2] : [0, 1] },
          symbolSize:
            chartId === 'bubble' ? (point: number[]) => 60 * Math.sqrt(point[2]! / maxArea) : 12,
          ...(chartId === 'quadrant'
            ? {
                markLine: {
                  silent: true,
                  symbol: ['none', 'none'],
                  data: [
                    { xAxis: 0, name: '横轴分界：0' },
                    { yAxis: 0, name: '纵轴分界：0' },
                  ],
                  label: { formatter: '{b}' },
                },
              }
            : {}),
        },
      ],
    }
  }
  if (chartId === 'arc' || chartId === 'force-network') {
    const target = request.target ? table.columns.indexOf(request.target) : -1
    if (target < 0 || yi.length !== 1 || values[0]!.some((value) => value === null))
      throw new Error('网络图需要源节点、目标节点和一个完整非负权重列。')
    return (chartId === 'arc' ? arcOption : forceNetworkOption)(
      table.rows.map((row, i) => ({
        source: labels[i]!,
        target: String(row[target] ?? ''),
        value: values[0]![i]!,
      })),
      title,
    )
  }
  if (chartId === 'adjacency') {
    const target = request.target ? table.columns.indexOf(request.target) : -1
    if (target < 0 || yi.length !== 1 || values[0]!.some((value) => value === null))
      throw new Error('邻接矩阵需要源节点、目标节点和一个完整非负权重列。')
    const result = adjacencyMatrix(
      table.rows.map((row, i) => ({
        source: labels[i]!,
        target: String(row[target] ?? ''),
        value: values[0]![i]!,
      })),
    )
    const data = result.matrix.flatMap((row, source) =>
      row.map((value, target) => [target, source, value]),
    )
    const maximum = data.reduce((max, point) => Math.max(max, point[2]!), 0)
    return {
      ...common,
      legend: { show: false },
      grid: { top: 75, bottom: 95, left: 100, right: 60 },
      xAxis: { type: 'category', data: result.names, name: '目标节点', splitArea: { show: true } },
      yAxis: { type: 'category', data: result.names, name: '源节点', inverse: true },
      visualMap: {
        min: 0,
        max: maximum || 1,
        orient: 'horizontal',
        left: 'center',
        bottom: 5,
        calculable: true,
      },
      series: [{ type: 'heatmap', data, label: { show: result.names.length <= 15 } }],
    }
  }
  if (chartId === 'sankey') {
    const targetIndex = request.target ? table.columns.indexOf(request.target) : -1
    if (targetIndex < 0 || yi.length !== 1)
      throw new Error('桑基图需要源节点、目标节点和一个流量列。')
    const flow = buildFlow(
      table.rows.map((row, i) => {
        const value = values[0]![i]
        if (value === null) throw new Error('流量不能为空。')
        return { source: labels[i]!, target: String(row[targetIndex] ?? ''), value: value! }
      }),
    )
    return {
      ...common,
      series: [
        {
          type: 'sankey',
          data: flow.nodes,
          links: flow.links,
          top: 65,
          bottom: 50,
          left: 40,
          right: 100,
          lineStyle: { color: 'source', opacity: 0.4 },
        },
      ],
    }
  }
  if (['treemap', 'sunburst', 'tree', 'icicle', 'circle-packing'].includes(chartId)) {
    const parentIndex = request.parent ? table.columns.indexOf(request.parent) : -1
    if (parentIndex < 0 || yi.length !== 1) throw new Error('层级图需要父节点列和一个数值列。')
    const nodes = buildHierarchy(
      table.rows.map((row, i) => ({
        id: labels[i]!,
        name: labels[i]!,
        parent:
          row[parentIndex] === null || row[parentIndex] === '' ? null : String(row[parentIndex]),
        ...(values[0]![i] === null ? {} : { value: values[0]![i]! }),
      })),
    )
    if (chartId === 'circle-packing') return circlePackingOption(nodes, title)
    if (chartId === 'icicle') {
      const { cells, levels } = icicleCells(nodes)
      const colors = ['#2563eb', '#0d9488', '#9333ea', '#d97706', '#e11d48']
      return {
        ...common,
        legend: { show: false },
        series: [
          {
            type: 'custom',
            coordinateSystem: 'none',
            dimensions: ['start', 'end', 'depth', '权重'],
            encode: { tooltip: [3] },
            data: cells.map((cell) => ({
              name: cell.name,
              value: [cell.start, cell.end, cell.depth, cell.value],
            })),
            renderItem: (params, api) => {
              const cell = cells[params.dataIndex]!
              const availableWidth = api.getWidth() - 60
              const band = (api.getHeight() - 110) / levels
              const left = 30 + cell.start * availableWidth
              const top = 65 + cell.depth * band
              const width = (cell.end - cell.start) * availableWidth
              return {
                type: 'group',
                children: [
                  {
                    type: 'rect',
                    shape: { x: left, y: top, width, height: band },
                    style: {
                      fill: colors[cell.branch % colors.length]!,
                      stroke: '#ffffff',
                      lineWidth: 1,
                    },
                  },
                  ...(width >= 30 && band >= 20
                    ? [
                        {
                          type: 'text' as const,
                          style: {
                            x: left + 6,
                            y: top + band / 2,
                            text: cell.name,
                            fill: '#ffffff',
                            fontSize: 13,
                            verticalAlign: 'middle' as const,
                            width: width - 12,
                            overflow: 'truncate' as const,
                          },
                        },
                      ]
                    : []),
                ],
              }
            },
          },
        ],
      }
    }
    if (chartId === 'treemap')
      return {
        ...common,
        series: [{ type: 'treemap', data: nodes, top: 65, bottom: 45, roam: true, leafDepth: 2 }],
      }
    if (chartId === 'sunburst')
      return {
        ...common,
        series: [
          {
            type: 'sunburst',
            data: nodes,
            radius: ['0%', '70%'],
            sort: (a, b) => a.dataIndex - b.dataIndex,
          },
        ],
      }
    return {
      ...common,
      series: [
        {
          type: 'tree',
          data: nodes,
          top: 65,
          bottom: 45,
          left: 100,
          right: 100,
          roam: true,
          initialTreeDepth: 3,
          label: { position: 'left' },
        },
      ],
    }
  }
  if (chartId === 'waterfall') {
    if (yi.length !== 1 || values[0]!.some((v) => v === null))
      throw new Error('瀑布图需要一个完整数值列。')
    const steps = waterfallSteps(values[0]! as number[])
    return {
      ...common,
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'custom',
          encode: { x: 0, y: [1, 2] },
          data: steps.map((step, i) => [i, step.start, step.end, step.change]),
          renderItem: (_params, api) => {
            const index = Number(api.value(0)),
              startValue = Number(api.value(1)),
              endValue = Number(api.value(2))
            const start = api.coord([index, startValue]),
              end = api.coord([index, endValue])
            const previous = api.coord([index - 1, startValue])
            const width = Math.abs(start[0]! - previous[0]!) * 0.6
            return {
              type: 'group',
              children: [
                {
                  type: 'rect',
                  shape: {
                    x: start[0]! - width / 2,
                    y: Math.min(start[1]!, end[1]!),
                    width,
                    height: Math.max(1, Math.abs(start[1]! - end[1]!)),
                  },
                  style: { fill: endValue >= startValue ? '#5470c6' : '#ee6666' },
                },
                ...(index > 0
                  ? [
                      {
                        type: 'line' as const,
                        shape: {
                          x1: previous[0]! + width / 2,
                          y1: start[1]!,
                          x2: start[0]! - width / 2,
                          y2: start[1]!,
                        },
                        style: { stroke: '#777777', lineDash: [4, 3] },
                      },
                    ]
                  : []),
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'lollipop' || chartId === 'dumbbell') {
    if (yi.length !== (chartId === 'dumbbell' ? 2 : 1))
      throw new Error(
        chartId === 'dumbbell' ? '哑铃图需要两个数值列。' : '棒棒糖图需要一个数值列。',
      )
    const rows = table.rows.flatMap((_, i) => {
      const end = values[0]![i]
      const start = chartId === 'dumbbell' ? values[1]![i] : 0
      return end === null || start === null ? [] : [[start!, end!, i]]
    })
    return {
      ...common,
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: labels },
      series: [
        {
          type: 'custom',
          data: rows,
          encode: { x: [0, 1], y: 2 },
          renderItem: (_params, api) => {
            const start = api.coord([Number(api.value(0)), Number(api.value(2))])
            const end = api.coord([Number(api.value(1)), Number(api.value(2))])
            return {
              type: 'group',
              children: [
                {
                  type: 'line',
                  shape: { x1: start[0]!, y1: start[1]!, x2: end[0]!, y2: end[1]! },
                  style: { stroke: '#5470c6', lineWidth: 3 },
                },
                {
                  type: 'circle',
                  shape: { cx: end[0]!, cy: end[1]!, r: 6 },
                  style: { fill: '#5470c6' },
                },
                ...(chartId === 'dumbbell'
                  ? [
                      {
                        type: 'circle' as const,
                        shape: { cx: start[0]!, cy: start[1]!, r: 6 },
                        style: { fill: '#ee6666' },
                      },
                    ]
                  : []),
              ],
            }
          },
        },
      ],
    }
  }
  if (chartId === 'slope') {
    if (yi.length !== 2) throw new Error('坡度图需要前后两个数值列。')
    return {
      ...common,
      xAxis: { type: 'category', data: request.y, boundaryGap: true },
      yAxis: { type: 'value' },
      series: table.rows.flatMap((_, i) =>
        values[0]![i] === null || values[1]![i] === null
          ? []
          : [
              {
                type: 'line' as const,
                name: labels[i]!,
                data: [values[0]![i]!, values[1]![i]!],
                symbolSize: 8,
                endLabel: { show: true, formatter: labels[i]! },
              },
            ],
      ),
    }
  }
  if (chartId === 'radar') {
    if (labels.length < 3 || labels.length > 40) throw new Error('雷达图需要 3–40 个指标。')
    if (values.some((column) => column.some((v) => v === null || v < 0)))
      throw new Error('雷达图需要完整的非负指标。')
    const maximum = values.reduce(
      (largest, column) => Math.max(largest, ...(column as number[])),
      0,
    )
    const scaleMaximum = maximum === 0 ? 1 : maximum
    return {
      ...common,
      radar: {
        indicator: labels.map((name) => ({
          name,
          min: 0,
          max: scaleMaximum,
        })),
      },
      series: [
        {
          type: 'radar',
          data: values.map((column, i) => ({ name: request.y[i]!, value: column as number[] })),
        },
      ],
    }
  }
  if (chartId === 'parallel') {
    if (yi.length < 2) throw new Error('平行坐标图需要至少两个数值维度。')
    return {
      ...common,
      parallel: { top: 75, bottom: 65 },
      parallelAxis: request.y.map((name, dim) => ({ dim, name })),
      series: [
        {
          type: 'parallel',
          data: table.rows.flatMap((_, i) => {
            const row = values.map((column) => column[i])
            return row.some((v) => v === null) ? [] : [row as number[]]
          }),
        },
      ],
    }
  }
  if (chartId === 'funnel') {
    if (yi.length !== 1 || values[0]!.some((v) => v === null || v < 0))
      throw new Error('漏斗图需要一个完整非负数值列。')
    return {
      ...common,
      series: [
        {
          type: 'funnel',
          sort: 'none',
          top: 65,
          bottom: 55,
          data: values[0]!.map((value, i) => ({ value: value!, name: labels[i]! })),
        },
      ],
    }
  }
  if (chartId === 'dot')
    return {
      ...common,
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: labels },
      series: values.map((column, j) => ({
        type: 'scatter',
        name: request.y[j]!,
        data: column.flatMap((v, i) => (v === null ? [] : [[v, i]])),
      })),
    }
  if (chartId === 'correlation') {
    if (yi.length < 2) throw new Error('相关矩阵需要至少两个数值列。')
    const data: number[][] = []
    for (let x = 0; x < values.length; x++)
      for (let y = 0; y < values.length; y++) {
        const pairs = values[x]!.flatMap((v, i) =>
          v === null || values[y]![i] === null ? [] : [[v, values[y]![i]!]],
        )
        if (pairs.length < 2) continue
        const value = pearson(
          pairs.map((p) => p[0]!),
          pairs.map((p) => p[1]!),
        )
        if (value !== null) data.push([x, y, value])
      }
    if (!data.length) throw new Error('没有足够的成对观测或所有变量均为常量。')
    return {
      ...common,
      grid: { top: 65, bottom: 90, left: 85, right: 35 },
      xAxis: { type: 'category', data: request.y },
      yAxis: { type: 'category', data: request.y },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 5,
      },
      series: [{ type: 'heatmap', data }],
    }
  }
  if (chartId === 'heatmap') {
    const data = values.flatMap((column, j) =>
      column.flatMap((v, i) => (v === null ? [] : [[i, j, v]])),
    )
    const extent = data.reduce(
      (range, point) => [Math.min(range[0]!, point[2]!), Math.max(range[1]!, point[2]!)],
      [Infinity, -Infinity],
    )
    return {
      ...common,
      grid: { top: 65, bottom: 90, left: 85, right: 35 },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'category', data: request.y },
      visualMap: {
        min: extent[0]!,
        max: extent[1] === extent[0] ? extent[1]! + 1 : extent[1]!,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 5,
      },
      series: [{ type: 'heatmap', data }],
    }
  }
  if (['pie', 'donut', 'semi-donut', 'rose'].includes(chartId)) {
    if (yi.length !== 1) throw new Error('占比图需要一个数值列。')
    const samples = values[0]!
    if (
      samples.some((n) => n !== null && n < 0) ||
      samples.reduce<number>((a, b) => a + (b ?? 0), 0) <= 0
    ) {
      throw new Error('占比图需要非负数值且合计大于零。')
    }
    return {
      ...common,
      series: [
        {
          type: 'pie',
          radius: chartId === 'pie' || chartId === 'rose' ? ['0%', '65%'] : ['40%', '65%'],
          ...(chartId === 'semi-donut'
            ? { startAngle: 180, endAngle: 0, center: ['50%', '65%'] }
            : {}),
          ...(chartId === 'rose' ? { roseType: 'area' as const } : {}),
          data: samples.flatMap((value, i) =>
            value === null ? [] : [{ name: labels[i]!, value }],
          ),
        },
      ],
    }
  }
  if (chartId === 'violin' || chartId === 'ridgeline') {
    const profiles = distributionProfiles(values)
    const violin = chartId === 'violin'
    return {
      ...common,
      legend: { show: false },
      xAxis: violin ? { type: 'category', data: request.y } : { type: 'value', name: '样本值' },
      yAxis: violin ? { type: 'value', name: '样本值' } : { type: 'category', data: request.y },
      series: profiles.map((profile, j) => ({
        name: `${request.y[j]} (n=${profile.count})`,
        type: 'custom',
        encode: violin ? { x: 0, y: [1, 2] } : { x: [1, 2], y: 0 },
        data: [[j, profile.points[0]!.value, profile.points[profile.points.length - 1]!.value]],
        tooltip: {
          formatter: `${request.y[j]}\n样本数：${profile.count}\n中位数：${profile.summary.median}`,
        },
        renderItem: (_params, api) => {
          const center = api.coord(violin ? [j, 0] : [0, j])
          const next = api.coord(violin ? [j + 1, 0] : [0, j + 1])
          const spacing = Math.abs(next[violin ? 0 : 1]! - center[violin ? 0 : 1]!)
          const points = profile.points.map((point) => {
            const coord = api.coord(violin ? [j, point.value] : [point.value, j])
            return violin
              ? [coord[0]! - point.width * spacing * 0.4, coord[1]!]
              : [coord[0]!, coord[1]! - point.width * spacing * 0.8]
          })
          if (violin) {
            for (const point of [...profile.points].reverse()) {
              const coord = api.coord([j, point.value])
              points.push([coord[0]! + point.width * spacing * 0.4, coord[1]!])
            }
          } else {
            points.push(
              api.coord([profile.points[profile.points.length - 1]!.value, j]),
              api.coord([profile.points[0]!.value, j]),
            )
          }
          const low = api.coord(violin ? [j, profile.summary.q1] : [profile.summary.q1, j])
          const high = api.coord(violin ? [j, profile.summary.q3] : [profile.summary.q3, j])
          const median = api.coord(
            violin ? [j, profile.summary.median] : [profile.summary.median, j],
          )
          return {
            type: 'group',
            children: [
              {
                type: 'polygon',
                shape: { points },
                style: { fill: String(api.visual('color')), opacity: 0.65 },
              },
              {
                type: 'line',
                shape: { x1: low[0]!, y1: low[1]!, x2: high[0]!, y2: high[1]! },
                style: { stroke: '#334155', lineWidth: 3 },
              },
              {
                type: 'circle',
                shape: { cx: median[0]!, cy: median[1]!, r: 3 },
                style: { fill: '#ffffff', stroke: '#334155' },
              },
            ],
          }
        },
      })),
    }
  }
  if (chartId === 'histogram' || chartId === 'density') {
    if (yi.length !== 1) throw new Error('请为分布图选择一个数值列。')
    const samples = values[0]!.filter((value): value is number => value !== null)
    if (chartId === 'density')
      return {
        ...common,
        xAxis: { type: 'value' },
        yAxis: { type: 'value', name: '密度' },
        series: [
          {
            type: 'line',
            showSymbol: false,
            areaStyle: { opacity: 0.2 },
            data: kernelDensity(samples).map((p) => [p.x, p.density]),
          },
        ],
      }
    const bins = histogram(samples)
    return {
      ...common,
      xAxis: {
        type: 'category',
        data: bins.map((bin) => `${bin.lower.toPrecision(4)}–${bin.upper.toPrecision(4)}`),
      },
      yAxis: { type: 'value', name: '频数', minInterval: 1 },
      series: [
        { type: 'bar', barGap: '0%', barCategoryGap: '0%', data: bins.map((bin) => bin.count) },
      ],
    }
  }
  if (chartId === 'boxplot') {
    const summaries = values.map((column) =>
      boxSummary(column.filter((v): v is number => v !== null)),
    )
    return {
      ...common,
      xAxis: { type: 'category', data: request.y },
      yAxis: { type: 'value' },
      series: [
        { type: 'boxplot', data: summaries.map((s) => [s.min, s.q1, s.median, s.q3, s.max]) },
        {
          type: 'scatter',
          name: '异常点',
          data: summaries.flatMap((s, i) => s.outliers.map((v) => [i, v])),
        },
      ],
    }
  }
  if (chartId === 'scatter') {
    const xs = table.rows.map((row) => numericValue(row[xi]!))
    if (xs.every((v) => v === null)) throw new Error('散点图 X 轴需要数值。')
    return {
      ...common,
      xAxis: { type: 'value', name: request.x },
      yAxis: { type: 'value' },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, bottom: 30 },
      ],
      series: values.map((column, j) => ({
        type: 'scatter',
        name: request.y[j]!,
        data: column.flatMap((value, i) =>
          value === null || xs[i] === null ? [] : [[xs[i]!, value]],
        ),
      })),
    }
  }
  const horizontal = chartId === 'bar'
  const bar = ['column', 'bar', 'grouped-column', 'stacked-column', 'percent-column'].includes(
    chartId,
  )
  const stacked = ['stacked-column', 'percent-column', 'stacked-area'].includes(chartId)
  if (
    chartId === 'percent-column' &&
    values.some((column) => column.some((v) => v !== null && v < 0))
  )
    throw new Error('百分比堆积图不支持负数。')
  const plotted =
    chartId === 'percent-column'
      ? values.map((column) =>
          column.map((v, i) => {
            const total = values.reduce((sum, entries) => sum + (entries[i] ?? 0), 0)
            return v === null || total === 0 ? null : (v / total) * 100
          }),
        )
      : values
  const category = { type: 'category' as const, data: labels }
  const numeric = {
    type: 'value' as const,
    ...(chartId === 'percent-column' ? { min: 0, max: 100 } : {}),
  }
  return {
    ...common,
    xAxis: horizontal ? numeric : category,
    yAxis: horizontal ? category : numeric,
    series: plotted.map((column, index) => ({
      type: bar ? ('bar' as const) : ('line' as const),
      name: request.y[index]!,
      data: column,
      ...(stacked ? { stack: 'total' } : {}),
      ...(!bar
        ? {
            smooth: chartId === 'smooth-line',
            showSymbol: chartId !== 'sparkline',
            ...(chartId === 'step' ? { step: 'end' as const } : {}),
            ...(['area', 'stacked-area'].includes(chartId) ? { areaStyle: {} } : {}),
          }
        : {}),
    })),
  }
}

export function renderChartSvg(request: ChartRequest, width = 960, height = 600): string {
  if (request.chartId === 'horizon') assertHorizonSize(width, height, request.y.length)
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 240 ||
    height < 180 ||
    width > 4096 ||
    height > 4096
  )
    throw new Error('导出尺寸超出范围。')
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width, height })
  try {
    chart.setOption(buildChartOption(request))
    return chart.renderToSVGString()
  } finally {
    chart.dispose()
  }
}
