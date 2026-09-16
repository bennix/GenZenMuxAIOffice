import { expect, it } from 'vitest'
import { buildChartOption, renderChartSvg, renderedChartIds } from './render'

it('renders every implemented chart as a standalone SVG from actual values', () => {
  for (const chartId of renderedChartIds) {
    if (
      [
        'treemap',
        'sunburst',
        'tree',
        'icicle',
        'circle-packing',
        'contour',
        'sankey',
        'adjacency',
        'arc',
        'force-network',
        'candlestick',
        'ohlc',
        'forest',
        'roc',
        'kaplan-meier',
        'gauge',
        'bullet',
        'calendar',
        'gantt',
        'stream',
        'theme-river',
      ].includes(chartId)
    )
      continue
    const svg = renderChartSvg({
      chartId,
      title: '样本图',
      ...(chartId === 'pivot' ? { target: 'y' } : {}),
      x: 'x',
      y: [
        'parallel',
        'correlation',
        'dumbbell',
        'slope',
        'bubble',
        'population-pyramid',
        'residual',
        'qq',
        'scatter-matrix',
        'small-multiples',
        'progress',
      ].includes(chartId)
        ? ['x', 'y']
        : ['y'],
      table: {
        columns: ['x', 'y'],
        rows: [
          [1, 2],
          [2, 5],
          [3, 9],
          [4, 3],
        ],
      },
    })
    expect(svg, chartId).toContain('<svg')
    expect(svg, chartId).toContain('样本图')
    expect(svg, chartId).not.toMatch(/NaN|Infinity/)
  }
})

it('renders parent-child data through each hierarchy renderer', () => {
  for (const chartId of ['treemap', 'sunburst', 'tree', 'icicle', 'circle-packing']) {
    const svg = renderChartSvg({
      chartId,
      x: 'id',
      y: ['value'],
      parent: 'parent',
      title: '层级样本',
      table: {
        columns: ['id', 'parent', 'value'],
        rows: [
          ['总计', null, null],
          ['甲', '总计', 3],
          ['乙', '总计', 7],
        ],
      },
    })
    expect(svg).toContain('层级样本')
    expect(svg).not.toMatch(/NaN|Infinity/)
  }
})

it('rejects invalid data and does not substitute an unrelated chart', () => {
  const base = { x: 'x', y: ['y'], table: { columns: ['x', 'y'], rows: [['a', -3]] } }
  expect(() => buildChartOption({ ...base, chartId: 'pie' })).toThrow('非负')
  expect(() => buildChartOption({ ...base, chartId: 'volume' })).toThrow('尚未')
  expect(() => renderChartSvg({ ...base, chartId: 'bar' }, 0)).toThrow('尺寸')
})

it('renders a weighted Sankey from source and target columns', () => {
  const svg = renderChartSvg({
    chartId: 'sankey',
    x: 'source',
    target: 'target',
    y: ['amount'],
    title: '流向样本',
    table: {
      columns: ['source', 'target', 'amount'],
      rows: [
        ['来源', '去向甲', 8],
        ['来源', '去向乙', 2],
      ],
    },
  })
  expect(svg).toContain('流向样本')
  expect(svg).toContain('去向甲')
  expect(svg).not.toMatch(/NaN|Infinity/)
})

it('preserves comparison endpoints including decreases and negative measurements', () => {
  const table = {
    columns: ['name', 'before', 'after'],
    rows: [
      ['甲', -2, 7],
      ['乙', 8, 3],
    ],
  }
  const option = buildChartOption({ chartId: 'dumbbell', table, x: 'name', y: ['before', 'after'] })
  expect(JSON.stringify(option.series)).toContain('[7,-2,0]')
  expect(JSON.stringify(option.series)).toContain('[3,8,1]')
  const svg = renderChartSvg({ chartId: 'slope', table, x: 'name', y: ['before', 'after'] })
  expect(svg).not.toMatch(/NaN|Infinity/)
  expect(() => buildChartOption({ chartId: 'dumbbell', table, x: 'name', y: ['before'] })).toThrow(
    '两个',
  )
})
