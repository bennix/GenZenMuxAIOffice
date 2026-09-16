import type { EChartsOption } from 'echarts'
import { buildFlow, type FlowEdge } from './network'

export function arcGraph(edges: readonly FlowEdge[]) {
  const graph = buildFlow(edges, false)
  if (graph.nodes.length > 30 || graph.links.length > 200)
    throw new Error('弧形图最多支持 30 个节点、200 条汇总连接，请先筛选。')
  const indices = new Map(graph.nodes.map((node, index) => [node.name, index]))
  return {
    names: graph.nodes.map((node) => node.name),
    links: graph.links.map((edge) => ({
      ...edge,
      from: indices.get(edge.source)!,
      to: indices.get(edge.target)!,
    })),
  }
}

export function arcOption(edges: readonly FlowEdge[], title = ''): EChartsOption {
  const graph = arcGraph(edges)
  const maximum = Math.max(...graph.links.map((edge) => edge.value))
  return {
    backgroundColor: '#ffffff',
    animation: false,
    title: {
      text: title,
      left: 'center',
      subtext: `上弧：左→右；下弧：右→左；圆环：自连接\n线宽与权重成正比；最大权重：${maximum}`,
    },
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'none',
        dimensions: ['源位置', '目标位置', '权重'],
        encode: { tooltip: [2] },
        data: graph.links.map((edge) => ({
          name: `${edge.source} → ${edge.target}`,
          value: [edge.from, edge.to, edge.value],
        })),
        renderItem: (_params, api) => {
          const from = Number(api.value(0)),
            to = Number(api.value(1)),
            value = Number(api.value(2))
          if (!value) return
          const step = (api.getWidth() - 80) / Math.max(graph.names.length, 1)
          const x1 = 40 + (from + 0.5) * step,
            x2 = 40 + (to + 0.5) * step
          const baseline = (api.getHeight() + 50) / 2
          const lineWidth = (6 * value) / maximum
          if (from === to)
            return {
              type: 'circle',
              shape: { cx: x1, cy: baseline - 15, r: 15 },
              style: { stroke: '#7c3aed', fill: 'none', lineWidth },
            }
          const direction = from < to ? -1 : 1
          const rise = Math.min(Math.abs(x2 - x1) * 0.6, (api.getHeight() - 180) / 2)
          return {
            type: 'bezierCurve',
            shape: {
              x1,
              y1: baseline,
              x2,
              y2: baseline,
              cpx1: x1,
              cpy1: baseline + (direction * rise * 4) / 3,
              cpx2: x2,
              cpy2: baseline + (direction * rise * 4) / 3,
            },
            style: {
              stroke: direction < 0 ? '#2563eb' : '#e8590c',
              fill: 'none',
              lineWidth,
              opacity: 0.75,
            },
            emphasis: { style: { opacity: 1 } },
          }
        },
      },
      {
        type: 'custom',
        coordinateSystem: 'none',
        silent: true,
        data: graph.names.map((name, index) => ({ name, value: [index] })),
        renderItem: (_params, api) => {
          const index = Number(api.value(0)),
            name = graph.names[index]!
          const step = (api.getWidth() - 80) / Math.max(graph.names.length, 1)
          const width = [...name].reduce(
            (sum, ch) => sum + (ch.charCodeAt(0) <= 0x7f ? 8.5 : 14),
            0,
          )
          if (width > step - 8 || api.getHeight() < 260 || /[\r\n]/.test(name))
            throw new Error('节点标签无法完整显示，请减少节点、缩短名称或增大尺寸。')
          const x = 40 + (index + 0.5) * step,
            baseline = (api.getHeight() + 50) / 2
          return {
            type: 'group',
            children: [
              { type: 'circle', shape: { cx: x, cy: baseline, r: 5 }, style: { fill: '#0f172a' } },
              {
                type: 'text',
                style: {
                  x,
                  y: api.getHeight() - 25,
                  text: name,
                  align: 'center',
                  fontSize: 14,
                  fill: '#0f172a',
                },
              },
            ],
          }
        },
      },
    ],
  }
}
