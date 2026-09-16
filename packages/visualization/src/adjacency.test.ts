import { expect, it } from 'vitest'
import { adjacencyMatrix } from './network'
import { renderChartSvg } from './render'

it('preserves edge direction, combines duplicates and supports loops', () => {
  expect(
    adjacencyMatrix([
      { source: 'A', target: 'B', value: 2 },
      { source: 'A', target: 'B', value: 3 },
      { source: 'B', target: 'A', value: 7 },
      { source: 'B', target: 'B', value: 1 },
    ]),
  ).toEqual({
    names: ['A', 'B'],
    matrix: [
      [0, 5],
      [7, 1],
    ],
  })
})
it('exports a directed matrix with explicit axis roles', () => {
  const svg = renderChartSvg({
    chartId: 'adjacency',
    x: 'from',
    target: 'to',
    y: ['weight'],
    table: {
      columns: ['from', 'to', 'weight'],
      rows: [
        ['A', 'B', 4],
        ['B', 'A', 2],
      ],
    },
  })
  expect(svg).toContain('源节点')
  expect(svg).toContain('目标节点')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
