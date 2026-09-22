import { expect, it } from 'vitest'
import { buildHierarchy } from './hierarchy'
import { icicleCells } from './icicle'
import { renderChartSvg } from './render'

it('partitions parent widths into children with one shared weight scale, including multiple roots', () => {
  const roots = buildHierarchy([
    { id: 'a', name: 'a', parent: null },
    { id: 'b', name: 'b', parent: 'a', value: 3 },
    { id: 'c', name: 'c', parent: 'a', value: 2 },
    { id: 'zero', name: 'zero', parent: 'a', value: 0 },
    { id: 'd', name: 'd', parent: null, value: 5 },
  ])
  const { cells, levels } = icicleCells(roots)
  expect(levels).toBe(2)
  expect(cells.map((cell) => cell.id)).toEqual(['a', 'b', 'c', 'd'])
  const [a, b, c, d] = cells
  expect(a).toMatchObject({ start: 0, end: 0.5, depth: 0 })
  expect(b).toMatchObject({ start: 0, end: 0.3, depth: 1 })
  expect(c).toMatchObject({ start: 0.3, end: 0.5, depth: 1 })
  expect(d).toMatchObject({ start: 0.5, end: 1, depth: 0 })
  for (const cell of cells) expect(cell.end - cell.start).toBeCloseTo(cell.value / 10)
})

it('rejects zero total and renders deep descendants without making leaves fill missing levels', () => {
  expect(() => icicleCells([{ id: 'zero', name: 'zero', value: 0 }])).toThrow('正')
  const roots = buildHierarchy([
    { id: 'root', name: 'root', parent: null },
    { id: 'branch', name: 'branch', parent: 'root' },
    { id: 'leaf', name: 'leaf', parent: 'branch', value: 2 },
    { id: 'short', name: 'short', parent: 'root', value: 3 },
  ])
  const layout = icicleCells(roots)
  expect(layout.levels).toBe(3)
  expect(layout.cells.filter((cell) => cell.depth === 2).map((cell) => cell.id)).toEqual(['leaf'])
  const svg = renderChartSvg({
    chartId: 'icicle',
    x: 'id',
    parent: 'parent',
    y: ['value'],
    title: '层级分区',
    table: {
      columns: ['id', 'parent', 'value'],
      rows: [
        ['root', null, null],
        ['branch', 'root', null],
        ['leaf', 'branch', 2],
        ['short', 'root', 3],
      ],
    },
  })
  expect(svg).toContain('层级分区')
  expect(svg).toContain('leaf')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
