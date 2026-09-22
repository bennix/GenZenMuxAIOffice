export function pyramidBands(values: readonly number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('金字塔图需要完整非负数值。')
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('金字塔合计必须为有限正数。')
  let sum = 0
  return values.map((value) => {
    const top = Math.sqrt(sum / total)
    sum += value
    return { top, bottom: Math.sqrt(sum / total), share: value / total }
  })
}
