import { expect, it } from 'vitest'
import { init } from 'echarts'
import { clusterSamples, dendrogramOption } from './dendrogram'
import { renderChartSvg } from './render'

it('computes average-linkage heights from all cross-cluster Euclidean distances', () => {
  const result = clusterSamples(['A', 'B', 'C'], [[0], [2], [10]])
  expect(result.names).toEqual(['A', 'B', 'C'])
  expect(result.merges).toEqual([
    { leftX: 0, rightX: 1, leftHeight: 0, rightHeight: 0, height: 2, size: 2 },
    { leftX: 0.5, rightX: 2, leftHeight: 2, rightHeight: 0, height: 9, size: 3 },
  ])
  expect(
    clusterSamples(
      ['A', 'B'],
      [
        [0, 0],
        [3, 4],
      ],
    ).height,
  ).toBe(5)
})
it('handles identical observations deterministically and rejects missing or ambiguous data', () => {
  const a = clusterSamples(['A', 'B', 'C'], [[1], [1], [1]])
  expect(a.height).toBe(0)
  expect(a.merges.map((merge) => merge.height)).toEqual([0, 0])
  expect(a).toEqual(clusterSamples(['A', 'B', 'C'], [[1], [1], [1]]))
  expect(() => clusterSamples(['A', 'A'], [[0], [1]])).toThrow('唯一')
  expect(() => clusterSamples(['A', 'B'], [[0], [null]])).toThrow('完整')
  expect(() => clusterSamples(['A', 'B'], [[-1e308], [1e308]])).toThrow('范围')
})
it('keeps fractional branch junctions centered rather than snapping them to leaf categories', () => {
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 960, height: 600 })
  try {
    chart.setOption(dendrogramOption(['A', 'B', 'C'], [[0], [2], [10]]))
    const coord = (chart as any).getModel().getSeriesByIndex(0).coordinateSystem
    const left = coord.dataToPoint([0, 2]),
      right = coord.dataToPoint([1, 2]),
      center = coord.dataToPoint([0.5, 2])
    expect(center[0]).toBeCloseTo((left[0] + right[0]) / 2)
    expect(center[1]).toBeCloseTo(left[1])
  } finally {
    chart.dispose()
  }
})
it('exports a real cluster tree with the distance scale and sample names', () => {
  const svg = renderChartSvg({
    chartId: 'dendrogram',
    x: '样本',
    y: ['数值'],
    table: {
      columns: ['样本', '数值'],
      rows: [
        ['甲', 0],
        ['乙', 2],
        ['丙', 10],
      ],
    },
  })
  for (const name of ['甲', '乙', '丙', '合并距离']) expect(svg).toContain(name)
  expect(svg).not.toMatch(/NaN|Infinity/)
})
