export function residualPoints(
  actual: readonly (number | null)[],
  predicted: readonly (number | null)[],
) {
  if (actual.length !== predicted.length) throw new Error('实际值与预测值必须逐行对应。')
  const points = actual.flatMap((value, i) => {
    const prediction = predicted[i]!
    if (value === null || prediction === null) return []
    const residual = value - prediction
    if (!Number.isFinite(value) || !Number.isFinite(prediction) || !Number.isFinite(residual))
      throw new Error('残差计算需要有限数值。')
    return [[prediction, residual, i] as [number, number, number]]
  })
  if (!points.length) throw new Error('没有完整的实际值与预测值配对。')
  return points
}

export function sampleQq(first: readonly (number | null)[], second: readonly (number | null)[]) {
  const samples = [first, second].map((column) => {
    const values = column.filter((value): value is number => value !== null).sort((a, b) => a - b)
    if (values.length < 2 || values.some((value) => !Number.isFinite(value)))
      throw new Error('QQ 图每组至少需要两个有限样本。')
    return values
  })
  const count = Math.min(512, samples[0]!.length, samples[1]!.length)
  const at = (values: number[], p: number) => {
    const index = (values.length - 1) * p,
      fraction = index - Math.floor(index)
    return values[Math.floor(index)]! * (1 - fraction) + values[Math.ceil(index)]! * fraction
  }
  return Array.from({ length: count }, (_, i) => {
    const p = (i + 0.5) / count
    return [at(samples[0]!, p), at(samples[1]!, p), p] as [number, number, number]
  })
}
