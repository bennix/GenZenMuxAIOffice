import type { HierarchyNode } from './hierarchy'

export interface IcicleCell {
  id: string
  name: string
  value: number
  start: number
  end: number
  depth: number
  branch: number
}

/** A partition layout: every level uses the same width-per-unit scale. */
export function icicleCells(roots: HierarchyNode[]): { cells: IcicleCell[]; levels: number } {
  const total = roots.reduce((sum, node) => sum + node.value, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('冰柱图需要正的总权重。')
  const cells: IcicleCell[] = []
  let levels = 0
  function visit(node: HierarchyNode, start: number, depth: number, branch: number): number {
    const end = start + node.value / total
    // Zero-weight nodes occupy no area and must not claim a visible minimum width.
    if (node.value === 0) return end
    cells.push({ id: node.id, name: node.name, value: node.value, start, end, depth, branch })
    levels = Math.max(levels, depth + 1)
    let childStart = start
    for (const child of node.children ?? [])
      childStart = visit(child, childStart, depth + 1, branch)
    return end
  }
  let start = 0
  roots.forEach((node, index) => {
    start = visit(node, start, 0, index)
  })
  return { cells, levels }
}
