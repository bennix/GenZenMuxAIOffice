export interface FlowEdge {
  source: string
  target: string
  value: number
}

export function adjacencyMatrix(edges: readonly FlowEdge[]) {
  const graph = buildFlow(edges, false)
  if (graph.nodes.length > 200) throw new Error('邻接矩阵最多支持 200 个节点。')
  const names = graph.nodes.map((node) => node.name)
  const indices = new Map(names.map((name, index) => [name, index]))
  const matrix = names.map(() => names.map(() => 0))
  for (const edge of graph.links)
    matrix[indices.get(edge.source)!]![indices.get(edge.target)!] = edge.value
  return { names, matrix }
}

export function buildFlow(edges: readonly FlowEdge[], requireAcyclic = true) {
  if (!edges.length || edges.length > 20000) throw new Error('流向数据需要 1–20000 条连接。')
  const nodes = new Set<string>()
  const combined = new Map<string, FlowEdge>()
  for (const edge of edges) {
    if (!edge.source.trim() || !edge.target.trim()) throw new Error('流向节点名称不能为空。')
    if (!Number.isFinite(edge.value) || edge.value < 0) throw new Error('流量必须为有限非负数。')
    nodes.add(edge.source)
    nodes.add(edge.target)
    const key = JSON.stringify([edge.source, edge.target])
    const previous = combined.get(key)
    const value = (previous?.value ?? 0) + edge.value
    if (!Number.isFinite(value)) throw new Error('合并后的流量超出数值范围。')
    combined.set(key, { ...edge, value })
  }
  if (nodes.size > 5000) throw new Error('流向图最多支持 5000 个节点。')
  const links = [...combined.values()]
  if (requireAcyclic) {
    const degrees = new Map([...nodes].map((name) => [name, 0]))
    const next = new Map<string, string[]>()
    for (const link of links) {
      degrees.set(link.target, degrees.get(link.target)! + 1)
      const targets = next.get(link.source) ?? []
      targets.push(link.target)
      next.set(link.source, targets)
    }
    const queue = [...nodes].filter((node) => degrees.get(node) === 0)
    for (let index = 0; index < queue.length; index++) {
      for (const target of next.get(queue[index]!) ?? []) {
        const degree = degrees.get(target)! - 1
        degrees.set(target, degree)
        if (degree === 0) queue.push(target)
      }
    }
    if (queue.length !== nodes.size)
      throw new Error('桑基图不能包含循环流向，请检查源节点和目标节点。')
  }
  return { nodes: [...nodes].map((name) => ({ name })), links }
}
