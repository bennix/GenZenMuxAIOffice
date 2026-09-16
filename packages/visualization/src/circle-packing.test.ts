import { expect, it } from 'vitest'
import { buildHierarchy } from './hierarchy'
import { packedCircles } from './circle-packing'
import { buildChartOption, renderChartSvg } from './render'

const rows = [
  { id: '总计', name: '总计', parent: null },
  { id: '直接', name: '直接', parent: '总计', value: 5 },
  { id: '分组', name: '分组', parent: '总计' },
  { id: '甲', name: '甲', parent: '分组', value: 20 },
  { id: '乙', name: '乙', parent: '分组', value: 5 },
  { id: '零', name: '零', parent: '总计', value: 0 },
]
it('keeps every child inside its parent and siblings disjoint with globally proportional leaf areas', () => {
  const { circles, omitted } = packedCircles(buildHierarchy(rows))
  expect(omitted).toBe(1)
  expect(circles).toHaveLength(5)
  const leaves = circles.filter((node) => node.leaf)
  for (const a of leaves)
    for (const b of leaves) expect(a.r ** 2 / b.r ** 2).toBeCloseTo(a.value / b.value, 9)
  for (const node of circles) {
    const parent = circles.find((p) => p.id === node.parent)
    if (parent)
      expect(Math.hypot(node.x - parent.x, node.y - parent.y) + node.r).toBeLessThanOrEqual(
        parent.r + 1e-10,
      )
    for (const other of circles.filter((p) => p.parent === node.parent && p.id !== node.id))
      expect(Math.hypot(node.x - other.x, node.y - other.y) + 1e-10).toBeGreaterThanOrEqual(
        node.r + other.r,
      )
  }
  expect(packedCircles(buildHierarchy([...rows].reverse()))).toEqual({ circles, omitted })
})
it('rejects empty, excessive and numerically unrepresentable hierarchies', () => {
  expect(() =>
    packedCircles(buildHierarchy([{ id: 'zero', name: 'zero', parent: null, value: 0 }])),
  ).toThrow('正的')
  expect(() =>
    packedCircles(
      buildHierarchy(
        Array.from({ length: 301 }, (_, i) => ({
          id: String(i),
          name: String(i),
          parent: null,
          value: 1,
        })),
      ),
    ),
  ).toThrow('300')
  expect(() =>
    packedCircles(
      buildHierarchy([
        { id: 'a', name: 'a', parent: null, value: 1e308 },
        { id: 'b', name: 'b', parent: null, value: 1e-308 },
      ]),
    ),
  ).toThrow('精度')
})
it('uses shared hierarchy validation and exports the leaf labels and weight semantics', () => {
  const request = {
    chartId: 'circle-packing',
    x: 'id',
    parent: 'parent',
    y: ['value'],
    title: '圆形层级',
    table: {
      columns: ['id', 'parent', 'value'],
      rows: rows.map((row) => [row.id, row.parent, row.value ?? null]),
    },
  }
  const svg = renderChartSvg(request)
  for (const text of ['圆形层级', '父圆表示包含关系', '直接', '甲', '乙'])
    expect(svg).toContain(text)
  expect(svg).not.toMatch(/NaN|Infinity/)
  expect(() => renderChartSvg(request, 240, 180)).toThrow('400×300')
  expect(() =>
    buildChartOption({
      ...request,
      table: {
        columns: request.table.columns,
        rows: [
          ['a', 'b', 1],
          ['b', 'a', 1],
        ],
      },
    }),
  ).toThrow('循环')
})
