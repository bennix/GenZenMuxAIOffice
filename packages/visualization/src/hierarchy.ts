export interface HierarchyRow {
  id: string
  parent: string | null
  name: string
  value?: number
}
export interface HierarchyNode {
  id: string
  name: string
  value: number
  children?: HierarchyNode[]
}

/** Leaf measurements roll up into parents; explicit parent totals must agree. */
export function buildHierarchy(rows: readonly HierarchyRow[]): HierarchyNode[] {
  if (!rows.length || rows.length > 10000) throw new Error('层级数据需要 1–10000 个节点。')
  const byId = new Map<string, HierarchyRow>()
  const children = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.id || byId.has(row.id)) throw new Error('节点 ID 必须非空且唯一。')
    if (row.value !== undefined && (!Number.isFinite(row.value) || row.value < 0))
      throw new Error('节点数值必须为有限非负数。')
    byId.set(row.id, row)
  }
  const roots: string[] = []
  for (const row of rows) {
    if (row.parent === null || row.parent === '') roots.push(row.id)
    else {
      if (!byId.has(row.parent)) throw new Error(`父节点不存在：${row.parent}`)
      const list = children.get(row.parent) ?? []
      list.push(row.id)
      children.set(row.parent, list)
    }
  }
  const state = new Map<string, 'visiting' | 'done'>()
  const built = new Map<string, HierarchyNode>()
  function visit(id: string, depth: number): HierarchyNode {
    if (state.get(id) === 'visiting') throw new Error('层级数据包含循环关系。')
    if (depth > 100) throw new Error('层级深度不能超过 100。')
    if (state.get(id) === 'done') return built.get(id)!
    state.set(id, 'visiting')
    const row = byId.get(id)!
    const descendants = (children.get(id) ?? []).map((child) => visit(child, depth + 1))
    const total = descendants.length
      ? descendants.reduce((sum, child) => sum + child.value, 0)
      : (row.value ?? 0)
    if (!Number.isFinite(total)) throw new Error('节点合计超出数值范围。')
    if (
      descendants.length &&
      row.value !== undefined &&
      Math.abs(row.value - total) > 1e-9 * Math.max(1, total)
    ) {
      throw new Error(`父节点“${row.name}”的数值与子节点合计不一致。`)
    }
    const node: HierarchyNode = {
      id,
      name: row.name,
      value: total,
      ...(descendants.length ? { children: descendants } : {}),
    }
    state.set(id, 'done')
    built.set(id, node)
    return node
  }
  // Visit disconnected components too, otherwise orphan cycles remain hidden.
  for (const row of rows) visit(row.id, 0)
  return roots.map((id) => built.get(id)!)
}
