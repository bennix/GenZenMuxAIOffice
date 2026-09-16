import { expect, it } from 'vitest'
import { forceNetwork, forceNetworkOption } from './force-network'
import { renderChartSvg } from './render'

const edges = [
  { source: 'A', target: 'B', value: 2 },
  { source: 'A', target: 'B', value: 3 },
  { source: 'B', target: 'A', value: 10 },
  { source: 'C', target: 'D', value: 4 },
  { source: 'D', target: 'A', value: 0 },
]
it('computes deterministic finite positions from connectivity, without losing directed weights', () => {
  const result = forceNetwork(edges)
  expect(result).toEqual(forceNetwork(edges))
  expect(result.links[0]).toEqual({ source: 'A', target: 'B', value: 5 })
  expect(result.links[1]).toEqual({ source: 'B', target: 'A', value: 10 })
  expect(result.nodes).toHaveLength(4)
  for (const node of result.nodes) {
    expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true)
    expect(Math.abs(node.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(node.y)).toBeLessThanOrEqual(1)
  }
  const distance = (a: number, b: number) =>
    Math.hypot(result.nodes[a]!.x - result.nodes[b]!.x, result.nodes[a]!.y - result.nodes[b]!.y)
  expect(distance(0, 1)).toBeLessThan(distance(0, 2))
  const changed = forceNetwork([...edges, { source: 'B', target: 'C', value: 1 }])
  expect(changed.nodes).not.toEqual(result.nodes)
})
it('shows positive directed edges, preserves zero-weight nodes and provides interaction', () => {
  const series = (forceNetworkOption(edges).series as any[])[0]
  expect(series.data).toHaveLength(4)
  expect(series.links).toHaveLength(3)
  expect(series.links[1].lineStyle.width / series.links[0].lineStyle.width).toBe(2)
  expect(series.edgeSymbol).toEqual(['none', 'arrow'])
  expect(series.draggable && series.roam).toBe(true)
  const svg = renderChartSvg({
    chartId: 'force-network',
    x: 'from',
    target: 'to',
    y: ['weight'],
    table: {
      columns: ['from', 'to', 'weight'],
      rows: edges.map((edge) => [edge.source, edge.target, edge.value]),
    },
  })
  expect(svg).toContain('距离不是业务数值')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
it('rejects self-links and invalid weights instead of silently drawing them incorrectly', () => {
  expect(() => forceNetwork([{ source: 'A', target: 'A', value: 1 }])).toThrow('自连接')
  expect(() => forceNetwork([{ source: 'A', target: 'B', value: -1 }])).toThrow('非负')
})
