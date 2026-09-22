import type { EChartsOption } from 'echarts'
import { buildFlow, type FlowEdge } from './network'

/** Deterministic Fruchterman–Reingold layout, shared by SSR and the live chart. */
export function forceNetwork(edges: readonly FlowEdge[]) {
  const graph = buildFlow(edges, false)
  if (graph.nodes.length > 80 || graph.links.length > 500)
    throw new Error('力导向图最多支持 80 个节点和 500 条汇总边，请先筛选。')
  if (graph.links.some((edge) => edge.source === edge.target))
    throw new Error('力导向图暂不支持自连接；请使用可显示自连接的弧形图或邻接矩阵。')
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.name, i]))
  const nodes = graph.nodes.map((node, i) => ({
    ...node,
    x: Math.cos((i * Math.PI * 2) / n) * 0.7,
    y: Math.sin((i * Math.PI * 2) / n) * 0.7,
  }))
  // A directed pair contributes one spring; direction/weight remain in rendered links.
  const pairs = new Map<string, [number, number]>()
  for (const edge of graph.links) {
    if (!edge.value) continue
    const a = index.get(edge.source)!,
      b = index.get(edge.target)!
    pairs.set(JSON.stringify([Math.min(a, b), Math.max(a, b)]), [a, b])
  }
  const k = Math.sqrt(4 / n)
  for (let iteration = 0; iteration < 300; iteration++) {
    const forces = nodes.map((node) => ({ x: -node.x * 0.1, y: -node.y * 0.1 }))
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        let dx = nodes[a]!.x - nodes[b]!.x,
          dy = nodes[a]!.y - nodes[b]!.y
        if (Math.hypot(dx, dy) < 1e-8) {
          dx = 1e-4
          dy = (a + 1) * 1e-5
        }
        const distance = Math.hypot(dx, dy),
          force = (k * k) / distance
        const fx = (dx / distance) * force,
          fy = (dy / distance) * force
        forces[a]!.x += fx
        forces[a]!.y += fy
        forces[b]!.x -= fx
        forces[b]!.y -= fy
      }
    for (const [a, b] of pairs.values()) {
      const dx = nodes[a]!.x - nodes[b]!.x,
        dy = nodes[a]!.y - nodes[b]!.y
      const distance = Math.max(Math.hypot(dx, dy), 1e-8),
        force = (distance * distance) / k
      const fx = (dx / distance) * force,
        fy = (dy / distance) * force
      forces[a]!.x -= fx
      forces[a]!.y -= fy
      forces[b]!.x += fx
      forces[b]!.y += fy
    }
    const temperature = 0.12 * (1 - iteration / 300)
    for (let i = 0; i < n; i++) {
      const f = forces[i]!,
        distance = Math.hypot(f.x, f.y)
      if (!distance) continue
      const step = Math.min(distance, temperature) / distance
      nodes[i]!.x = Math.max(-1, Math.min(1, nodes[i]!.x + f.x * step))
      nodes[i]!.y = Math.max(-1, Math.min(1, nodes[i]!.y + f.y * step))
    }
  }
  return { nodes, links: graph.links }
}

export function forceNetworkOption(edges: readonly FlowEdge[], title = ''): EChartsOption {
  const graph = forceNetwork(edges)
  const maximum = Math.max(...graph.links.map((edge) => edge.value))
  return {
    backgroundColor: '#ffffff',
    animation: false,
    title: {
      text: title,
      left: 'center',
      subtext: `连接关系决定布局；距离不是业务数值\n线宽与权重成正比；最大权重：${maximum}`,
    },
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [
      {
        type: 'graph',
        layout: 'none',
        left: 70,
        right: 100,
        top: 110,
        bottom: 65,
        roam: true,
        draggable: true,
        data: graph.nodes.map((node) => ({ ...node, id: node.name, symbolSize: 14 })),
        links: graph.links
          .filter((edge) => edge.value > 0)
          .map((edge) => ({
            ...edge,
            lineStyle: { width: (6 * edge.value) / maximum, curveness: 0.15 },
          })),
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 8,
        label: { show: true, position: 'bottom', fontSize: 14, color: '#0f172a' },
        labelLayout: { moveOverlap: 'shiftY' },
        lineStyle: { color: '#64748b', opacity: 0.65 },
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 1 } },
        itemStyle: { color: '#2563eb' },
      },
    ],
  }
}
