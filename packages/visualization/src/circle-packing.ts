import { hierarchy, pack } from 'd3-hierarchy'
import { format, type EChartsOption } from 'echarts'
import type { HierarchyNode } from './hierarchy'

export function packedCircles(roots: HierarchyNode[]) {
  let count = 0, omitted = 0, maximum = 0
  function prune(node: HierarchyNode, depth: number): HierarchyNode | null {
    count++
    if (count > 300 || depth > 12) throw new Error('圆形打包最多支持 300 个节点、12 层，请先筛选。')
    if (!Number.isFinite(node.value) || node.value < 0) throw new Error('节点权重必须有限非负。')
    const children = node.children?.map((child) => prune(child, depth + 1)).filter((child): child is HierarchyNode => child !== null)
    if (!node.value) { omitted++; return null }
    if (!node.children?.length) maximum = Math.max(maximum, node.value)
    return { ...node, ...(children ? { children } : {}) }
  }
  const children = roots.map((node) => prune(node, 1)).filter((node): node is HierarchyNode => node !== null)
  if (!maximum) throw new Error('圆形打包需要正的叶子总权重。')
  const root = hierarchy<HierarchyNode>({ id: '', name: '', value: 0, children })
    .sum((node) => {
      if (node.children?.length) return 0
      const value = node.value / maximum
      if (!value) throw new Error('叶子权重比例超出精度，请先筛选或调整数据范围。')
      return value
    })
    .sort((a, b) => (b.value! - a.value!) || (a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0))
  const layout = pack<HierarchyNode>().size([1000, 1000]).padding(8)(root)
  const circles = layout.descendants().slice(1).map((node) => ({
    id: node.data.id, name: node.data.name, value: node.data.value,
    parent: node.parent?.data.id ?? '', depth: node.depth,
    leaf: !node.children?.length,
    x: node.x / 1000, y: node.y / 1000, r: node.r / 1000,
    path: node.ancestors().reverse().slice(1).map((ancestor) => ancestor.data.name).join(' / '),
  }))
  if (circles.some((node) => ![node.x, node.y, node.r].every(Number.isFinite) || node.r <= 0))
    throw new Error('圆形布局超出数值精度。')
  return { circles, omitted }
}

export function circlePackingOption(roots: HierarchyNode[], title = ''): EChartsOption {
  const { circles, omitted } = packedCircles(roots)
  const colors = ['#bfdbfe', '#99f6e4', '#ddd6fe', '#fed7aa', '#fecdd3']
  return {
    backgroundColor: '#fff', animation: false,
    title: { text: title, left: 'center', subtext: `叶子圆面积与权重成正比；父圆表示包含关系\n小圆名称可悬停查看；零权重节点不占面积（${omitted} 个）` },
    tooltip: { trigger: 'item', renderMode: 'richText', formatter: (input) => {
      const item = Array.isArray(input) ? input[0] : input
      const node = item ? circles[item.dataIndex] : undefined
      return node ? `${node.path}\n${node.leaf ? '叶子权重' : '子节点合计'}：${node.value}` : ''
    } },
    series: [{ type: 'custom', coordinateSystem: 'none',
      dimensions: ['权重'], encode: { tooltip: [0] },
      data: circles.map((node) => ({ name: node.path, value: [node.value] })),
      renderItem: (params, api) => {
        if (api.getWidth() < 400 || api.getHeight() < 300)
          throw new Error('圆形打包画布至少需要 400×300，请增大尺寸。')
        const node = circles[params.dataIndex]!
        const size = Math.min(api.getWidth() - 40, api.getHeight() - 115)
        const cx = (api.getWidth() - size) / 2 + node.x * size
        const cy = 90 + node.y * size, r = node.r * size
        const text = `${node.name}\n${node.value}`
        const bounds = format.getTextRect(text, '14px sans-serif', 'center', 'middle', undefined, undefined, false, 18)
        const childTop = node.leaf ? node.y : Math.min(...circles.filter((child) => child.parent === node.id).map((child) => child.y - child.r))
        const clearHeight = (childTop - (node.y - node.r)) * size
        const labelY = node.leaf ? cy : cy - r + clearHeight / 2
        const showLabel = (node.leaf || clearHeight >= bounds.height + 10) &&
          Math.hypot(bounds.width / 2, Math.abs(labelY - cy) + bounds.height / 2) <= r - 5
        return { type: 'group', children: [
          { type: 'circle', shape: { cx, cy, r }, style: {
            fill: node.leaf ? colors[(node.depth - 1) % colors.length]! : '#f1f5f9',
            stroke: node.leaf ? '#475569' : '#94a3b8', lineWidth: 1,
          }, emphasis: { style: { stroke: '#2563eb', lineWidth: 3 } } },
          ...(showLabel ? [{ type: 'text' as const, silent: true, style: {
            x: cx, y: labelY, text, align: 'center' as const, verticalAlign: 'middle' as const,
            fontSize: 14, lineHeight: 18, fill: '#0f172a',
          } }] : []),
        ] }
      },
    }],
  }
}
