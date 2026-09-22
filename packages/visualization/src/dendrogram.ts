import type { EChartsOption } from 'echarts'

interface Cluster {
  members: number[]
  height: number
  children?: [Cluster, Cluster]
}
export interface ClusterMerge {
  leftX: number
  rightX: number
  leftHeight: number
  rightHeight: number
  height: number
  size: number
}

/** Average linkage (UPGMA) over Euclidean distances of the provided, unscaled features. */
export function clusterSamples(
  labels: readonly string[],
  samples: readonly (readonly (number | null)[])[],
) {
  if (labels.length < 2 || labels.length > 80 || samples.length !== labels.length)
    throw new Error('聚类图需要 2–80 个样本。')
  if (labels.some((name) => !name.trim()) || new Set(labels).size !== labels.length)
    throw new Error('聚类样本名称必须非空且唯一。')
  const dimensions = samples[0]!.length
  if (
    dimensions < 1 ||
    dimensions > 20 ||
    samples.some(
      (row) =>
        row.length !== dimensions || row.some((value) => value === null || !Number.isFinite(value)),
    )
  )
    throw new Error('聚类需要 1–20 个完整数值特征，不接受缺失值。')
  const distances = samples.map((a) =>
    samples.map((b) => {
      const distance = Math.hypot(...a.map((value, i) => value! - b[i]!))
      if (!Number.isFinite(distance)) throw new Error('样本距离超出有限数值范围，请先缩放特征。')
      return distance
    }),
  )
  let clusters: Cluster[] = samples.map((_, i) => ({ members: [i], height: 0 }))
  while (clusters.length > 1) {
    let best = Infinity,
      first = 0,
      second = 1
    for (let a = 0; a < clusters.length; a++)
      for (let b = a + 1; b < clusters.length; b++) {
        let mean = 0,
          count = 0
        for (const i of clusters[a]!.members)
          for (const j of clusters[b]!.members) mean += (distances[i]![j]! - mean) / ++count
        if (mean < best) {
          best = mean
          first = a
          second = b
        }
      }
    const left = clusters[first]!,
      right = clusters[second]!
    const merged: Cluster = {
      members: [...left.members, ...right.members],
      height: best,
      children: [left, right],
    }
    clusters = clusters.filter((_, i) => i !== first && i !== second)
    clusters.push(merged)
    clusters.sort((a, b) => Math.min(...a.members) - Math.min(...b.members))
  }
  const names: string[] = [],
    merges: ClusterMerge[] = []
  function visit(node: Cluster): { x: number; height: number } {
    if (!node.children) {
      const x = names.length
      names.push(labels[node.members[0]!]!)
      return { x, height: 0 }
    }
    const left = visit(node.children[0]),
      right = visit(node.children[1])
    merges.push({
      leftX: left.x,
      rightX: right.x,
      leftHeight: left.height,
      rightHeight: right.height,
      height: node.height,
      size: node.members.length,
    })
    return { x: (left.x + right.x) / 2, height: node.height }
  }
  visit(clusters[0]!)
  return { names, merges, height: clusters[0]!.height }
}

export function dendrogramOption(
  labels: string[],
  samples: (number | null)[][],
  title = '',
): EChartsOption {
  const result = clusterSamples(labels, samples)
  return {
    backgroundColor: '#ffffff',
    animation: false,
    title: { text: title, left: 'center', subtext: '欧氏距离 · 平均连接法；原始特征未标准化' },
    tooltip: { trigger: 'item', renderMode: 'richText' },
    grid: { left: 85, right: 35, top: 95, bottom: 110, containLabel: true },
    xAxis: {
      type: 'value',
      min: -1,
      max: result.names.length,
      interval: 1,
      splitLine: { show: false },
      axisLabel: {
        formatter: (value: number) => (Number.isInteger(value) ? (result.names[value] ?? '') : ''),
        rotate: result.names.length > 10 ? 60 : 0,
        fontSize: 14,
      },
    },
    yAxis: {
      type: 'value',
      name: '合并距离',
      min: 0,
      max: result.height || 1,
      axisLine: { onZero: false },
    },
    series: [
      {
        type: 'custom',
        clip: true,
        dimensions: ['左位置', '右位置', '左高度', '右高度', '合并距离', '样本数'],
        encode: { x: [0, 1], y: [2, 3, 4], tooltip: [4, 5] },
        data: result.merges.map((merge) => [
          merge.leftX,
          merge.rightX,
          merge.leftHeight,
          merge.rightHeight,
          merge.height,
          merge.size,
        ]),
        renderItem: (_params, api) => {
          const left = Number(api.value(0)),
            right = Number(api.value(1)),
            height = Number(api.value(4))
          return {
            type: 'polyline',
            shape: {
              points: [
                api.coord([left, Number(api.value(2))]),
                api.coord([left, height]),
                api.coord([right, height]),
                api.coord([right, Number(api.value(3))]),
              ],
            },
            style: { stroke: '#2563eb', lineWidth: 2, fill: 'none' },
          }
        },
      },
    ],
  }
}
