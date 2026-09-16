/** Individuals chart limits estimated using adjacent moving ranges (d2=1.128). */
export function individualsControl(values: readonly number[]) {
  if (values.length < 3 || values.some((value) => !Number.isFinite(value)))
    throw new Error('控制图至少需要三个按顺序排列的完整有限观测。')
  const center = values.reduce((sum, value) => sum + value / values.length, 0)
  const movingRange = values
    .slice(1)
    .reduce((sum, value, i) => sum + Math.abs(value - values[i]!) / (values.length - 1), 0)
  const sigma = movingRange / 1.128
  const lower = center - 3 * sigma,
    upper = center + 3 * sigma
  if (![center, movingRange, lower, upper].every(Number.isFinite))
    throw new Error('观测范围过大，无法可靠计算控制界限。')
  return {
    center,
    movingRange,
    lower,
    upper,
    outside: values.flatMap((value, i) => (value < lower || value > upper ? [i] : [])),
  }
}
