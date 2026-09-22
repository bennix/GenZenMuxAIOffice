import { init } from 'echarts'
import { describe, expect, it } from 'vitest'
import { buildChartOption, type ChartRequest } from './render'
import { interactiveChartOption } from './interactive'

const names = ['北京', '上海', '广州', '成都', '武汉', '杭州', '西安', '哈尔滨'].flatMap((city) => [
  `${city} 最高(℃)`,
  `${city} 最低(℃)`,
])
const request: ChartRequest = {
  chartId: 'line',
  title: '各城市每日气温变化',
  x: '日期',
  y: names,
  table: {
    columns: ['日期', ...names],
    rows: ['2026-09-01', '2026-09-02', '2026-09-03'].map((date, day) => [
      date,
      ...names.map((_, i) => 20 + i + day),
    ]),
  },
}

describe('multi-row legend layout', () => {
  for (const chartId of [
    'line',
    'smooth-line',
    'step',
    'area',
    'stacked-area',
    'column',
    'grouped-column',
    'stacked-column',
    'percent-column',
    'bar',
    'dot',
    'scatter',
    'marimekko',
  ]) {
    for (const width of [480, 960, 1440]) {
      for (const interactive of [false, true]) {
        it(`${chartId}: keeps all legend rows below axis labels at ${width}px (${interactive ? 'preview' : 'export'})`, () => {
          const chart = init(null, undefined, { renderer: 'svg', ssr: true, width, height: 600 })
          try {
            const input = {
              ...request,
              chartId,
              ...(chartId === 'scatter'
                ? {
                    table: {
                      ...request.table,
                      rows: request.table.rows.map((row, i) => [i + 1, ...row.slice(1)]),
                    },
                  }
                : {}),
            }
            chart.setOption(
              interactive ? interactiveChartOption(input, width) : buildChartOption(input, width),
            )
            const texts = chart
              .getZr()
              .storage.getDisplayList(true)
              .flatMap((element) => {
                const text = (element as unknown as { style: { text?: string } }).style?.text
                if (!text) return []
                const rect = element.getBoundingRect().clone()
                const transform = element.getComputedTransform()
                if (transform) rect.applyTransform(transform)
                return [{ text, rect }]
              })
            const legends = texts.filter(({ text }) => names.includes(text))
            const axes = texts.filter(
              ({ text }) => text.startsWith('2026-') || /^-?\d+(\.\d+)?%?$/.test(text),
            )
            expect(legends).toHaveLength(names.length)
            expect(axes.length).toBeGreaterThan(0)
            expect(Math.min(...legends.map(({ rect }) => rect.y))).toBeGreaterThan(
              Math.max(...axes.map(({ rect }) => rect.y + rect.height)) + 10,
            )
            expect(
              Math.max(...legends.map(({ rect }) => rect.y + rect.height)),
            ).toBeLessThanOrEqual(600)
          } finally {
            chart.dispose()
          }
        })
      }
    }
  }
})

const specialised: ChartRequest[] = [
  {
    chartId: 'roc',
    x: '样本',
    y: ['真实标签', '概率'],
    table: {
      columns: ['样本', '真实标签', '概率'],
      rows: [
        ['甲', 1, 0.9],
        ['乙', 0, 0.2],
        ['丙', 1, 0.7],
      ],
    },
  },
  {
    chartId: 'contour',
    x: '水平距离（千米）',
    y: ['垂直距离', '海拔'],
    table: {
      columns: ['水平距离（千米）', '垂直距离', '海拔'],
      rows: [
        [0, 0, 0],
        [0, 1, 10],
        [1, 0, 20],
        [1, 1, 30],
      ],
    },
  },
  {
    chartId: 'horizon',
    x: '时间',
    y: ['甲', '乙', '丙'],
    table: {
      columns: ['时间', '甲', '乙', '丙'],
      rows: [
        [0, -1234567, 7654321, 100],
        [1, 100, 500, -999999],
        [2, 2345678, -7654321, 10],
      ],
    },
  },
]
for (const request of specialised) {
  for (const interactive of [false, true]) {
    it(`${request.chartId}: separates axis names and ticks from the legend and range slider`, () => {
      const width = 640,
        height = 420
      const option = interactive
        ? interactiveChartOption(request, width, height)
        : buildChartOption(request, width, height)
      const legend = Array.isArray(option.legend) ? option.legend[0]! : option.legend!
      const names = legend.data!.filter(
        (name): name is string => typeof name === 'string' && name !== '',
      )
      const axes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis!]
      option.xAxis = axes.map((axis) => ({
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: 'AXIS {value}' },
      }))
      const chart = init(null, undefined, { renderer: 'svg', ssr: true, width, height })
      try {
        chart.setOption(option)
        const texts = chart
          .getZr()
          .storage.getDisplayList(true)
          .flatMap((element) => {
            const text = (element as unknown as { style: { text?: string } }).style?.text
            if (!text) return []
            const rect = element.getBoundingRect().clone()
            const transform = element.getComputedTransform()
            if (transform) rect.applyTransform(transform)
            return [{ text, rect }]
          })
        const keys = texts.filter(({ text }) => names.includes(text))
        const labels = texts.filter(
          ({ text }) => text.startsWith('AXIS ') || axes.some((axis) => axis.name === text),
        )
        expect(keys.length).toBe(names.length)
        expect(labels.length).toBeGreaterThan(0)
        const legendTop = Math.min(...keys.map(({ rect }) => rect.y))
        const axisBottom = Math.max(...labels.map(({ rect }) => rect.y + rect.height))
        expect(legendTop).toBeGreaterThan(axisBottom + 10)
        const zooms = Array.isArray(option.dataZoom) ? option.dataZoom : []
        for (const zoom of zooms) {
          if (zoom.type !== 'slider' || !('bottom' in zoom) || !('height' in zoom)) continue
          const sliderBottom = height - Number(zoom.bottom)
          expect(sliderBottom).toBeLessThan(legendTop)
          expect(sliderBottom - Number(zoom.height)).toBeGreaterThan(axisBottom)
        }
      } finally {
        chart.dispose()
      }
    })
  }
}

for (const chartId of ['heatmap', 'correlation']) {
  it(`${chartId}: keeps long rotated axis labels above the color scale`, () => {
    const option = buildChartOption({ ...request, chartId }, 480, 420)
    if (option.xAxis && !Array.isArray(option.xAxis))
      option.xAxis.axisLabel = { rotate: 35, formatter: 'AXIS {value}' }
    if (option.visualMap && !Array.isArray(option.visualMap))
      option.visualMap.formatter = 'COLOR {value}'
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 480, height: 420 })
    try {
      chart.setOption(option)
      const texts = chart
        .getZr()
        .storage.getDisplayList(true)
        .flatMap((element) => {
          const text = (element as unknown as { style: { text?: string } }).style?.text
          if (!text) return []
          const rect = element.getBoundingRect().clone()
          const transform = element.getComputedTransform()
          if (transform) rect.applyTransform(transform)
          return [{ text, rect }]
        })
      const axes = texts.filter(({ text }) => text.startsWith('AXIS '))
      const keys = texts.filter(({ text }) => text.startsWith('COLOR '))
      expect(axes.length).toBeGreaterThan(0)
      expect(keys.length).toBeGreaterThan(0)
      expect(Math.min(...keys.map(({ rect }) => rect.y))).toBeGreaterThan(
        Math.max(...axes.map(({ rect }) => rect.y + rect.height)) + 10,
      )
    } finally {
      chart.dispose()
    }
  })
}
