export function waffleAllocation(values: readonly number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('华夫饼图需要完整非负数值。')
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('华夫饼图合计必须为有限正数。')
  const shares = values.map((value) => value / total)
  const counts = shares.map((share) => Math.floor(share * 100))
  const ranking = shares
    .map((share, i) => ({ i, fraction: share * 100 - counts[i]! }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  const remaining = 100 - counts.reduce((sum, count) => sum + count, 0)
  for (let i = 0; i < remaining; i++) counts[ranking[i]!.i]!++
  return { shares, counts, total }
}
