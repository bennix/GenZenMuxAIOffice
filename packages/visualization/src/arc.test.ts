import { expect, it } from 'vitest'
import { arcGraph, arcOption } from './arc'
import { renderChartSvg } from './render'

const edges = [
  { source: 'A', target: 'B', value: 2 },
  { source: 'A', target: 'B', value: 3 },
  { source: 'B', target: 'A', value: 10 },
  { source: 'B', target: 'B', value: 1 },
  { source: 'C', target: 'A', value: 0 },
]
it('aggregates directed duplicates and retains order, cycles, loops and zero-weight nodes', () => {
  expect(arcGraph(edges)).toEqual({
    names: ['A', 'B', 'C'],
    links: [
      { source: 'A', target: 'B', value: 5, from: 0, to: 1 },
      { source: 'B', target: 'A', value: 10, from: 1, to: 0 },
      { source: 'B', target: 'B', value: 1, from: 1, to: 1 },
      { source: 'C', target: 'A', value: 0, from: 2, to: 0 },
    ],
  })
  expect(() => arcGraph([{ source: 'A', target: 'B', value: -1 }])).toThrow('非负')
})
it('separates reciprocal arcs and encodes weight by proportional stroke width', () => {
  const option = arcOption(edges)
  const series = (option.series as any[])[0]
  const draw = (values: number[]) =>
    series.renderItem(
      {},
      {
        value: (index: number) => values[index],
        getWidth: () => 960,
        getHeight: () => 600,
      },
    )
  const forward = draw([0, 1, 5]),
    reverse = draw([1, 0, 10])
  expect(forward.shape.cpy1).toBeLessThan(forward.shape.y1)
  expect(reverse.shape.cpy1).toBeGreaterThan(reverse.shape.y1)
  expect(reverse.style.lineWidth / forward.style.lineWidth).toBe(2)
  expect(draw([1, 1, 1]).type).toBe('circle')
  expect(draw([2, 0, 0])).toBeUndefined()
})
it('renders standalone SVG and refuses unreadable labels', () => {
  const request = {
    chartId: 'arc',
    x: 'source',
    target: 'target',
    y: ['weight'],
    title: '关系',
    table: {
      columns: ['source', 'target', 'weight'],
      rows: edges.map((edge) => [edge.source, edge.target, edge.value]),
    },
  }
  const svg = renderChartSvg(request)
  expect(svg).toContain('自连接')
  expect(svg).not.toMatch(/NaN|Infinity/)
  expect(() => renderChartSvg(request, 240, 180)).toThrow('完整显示')
})
