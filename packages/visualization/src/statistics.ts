/** Statistical transforms shared by interactive rendering and exported charts. */
function sample(values: readonly number[]): number[] {
  if (!values.length || values.some((n) => !Number.isFinite(n))) {
    throw new Error('统计计算需要非空且有限的数值样本。')
  }
  return [...values].sort((a, b) => a - b)
}

function sortedQuantile(sorted: readonly number[], probability: number): number {
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const fraction = index - lower
  return sorted[lower]! * (1 - fraction) + sorted[Math.ceil(index)]! * fraction
}

export function quantile(values: readonly number[], probability: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error('分位点必须在 0–1 之间。')
  }
  return sortedQuantile(sample(values), probability)
}

export function boxSummary(values: readonly number[]) {
  const sorted = sample(values)
  const q1 = sortedQuantile(sorted, 0.25)
  const median = sortedQuantile(sorted, 0.5)
  const q3 = sortedQuantile(sorted, 0.75)
  const iqr = q3 - q1
  const inside = sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr)
  return {
    min: inside[0]!,
    q1,
    median,
    q3,
    max: inside[inside.length - 1]!,
    outliers: sorted.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr),
  }
}

export function histogram(values: readonly number[], binCount?: number) {
  const sorted = sample(values)
  const minimum = sorted[0]!
  const maximum = sorted[sorted.length - 1]!
  if (binCount !== undefined && (!Number.isInteger(binCount) || binCount < 1 || binCount > 200)) {
    throw new Error('直方图分箱数量必须为 1–200。')
  }
  if (minimum === maximum)
    return [{ lower: minimum - 0.5, upper: maximum + 0.5, count: sorted.length }]
  const iqr = sortedQuantile(sorted, 0.75) - sortedQuantile(sorted, 0.25)
  const fdWidth = (2 * iqr) / Math.cbrt(sorted.length)
  const count =
    binCount ??
    Math.min(
      200,
      Math.max(
        1,
        fdWidth > 0
          ? Math.ceil((maximum - minimum) / fdWidth)
          : Math.ceil(Math.log2(sorted.length) + 1),
      ),
    )
  const width = (maximum - minimum) / count
  const bins = Array.from({ length: count }, (_, i) => ({
    lower: minimum + i * width,
    upper: i === count - 1 ? maximum : minimum + (i + 1) * width,
    count: 0,
  }))
  for (const value of sorted)
    bins[Math.min(count - 1, Math.floor((value - minimum) / width))]!.count++
  return bins
}

export function kernelDensity(values: readonly number[], points = 128, bandwidth?: number) {
  const sorted = sample(values)
  if (!Number.isInteger(points) || points < 2 || points > 2048)
    throw new Error('密度采样点必须为 2–2048。')
  if (bandwidth !== undefined && (!Number.isFinite(bandwidth) || bandwidth <= 0))
    throw new Error('带宽必须为正数。')
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const sd = Math.sqrt(
    sorted.reduce((sum, n) => sum + (n - mean) ** 2, 0) / Math.max(1, sorted.length - 1),
  )
  const robust = (sortedQuantile(sorted, 0.75) - sortedQuantile(sorted, 0.25)) / 1.34
  const scale = robust > 0 ? Math.min(sd, robust) : sd
  const h =
    bandwidth ??
    (scale > 0 ? 0.9 * scale * sorted.length ** -0.2 : Math.max(1, Math.abs(mean) * 0.01))
  const lower = sorted[0]! - 3 * h
  const upper = sorted[sorted.length - 1]! + 3 * h
  return Array.from({ length: points }, (_, i) => {
    const x = lower + ((upper - lower) * i) / (points - 1)
    const density =
      sorted.reduce((sum, value) => sum + Math.exp(-0.5 * ((x - value) / h) ** 2), 0) /
      (sorted.length * h * Math.sqrt(2 * Math.PI))
    return { x, density }
  })
}

export function pearson(x: readonly number[], y: readonly number[]): number | null {
  sample(x)
  sample(y)
  if (x.length !== y.length || x.length < 2) throw new Error('相关系数需要至少两对一一对应的观测。')
  const mx = x.reduce((a, b) => a + b, 0) / x.length
  const my = y.reduce((a, b) => a + b, 0) / y.length
  let covariance = 0,
    sx = 0,
    sy = 0
  for (let i = 0; i < x.length; i++) {
    const dx = x[i]! - mx,
      dy = y[i]! - my
    covariance += dx * dy
    sx += dx * dx
    sy += dy * dy
  }
  return sx === 0 || sy === 0 ? null : Math.max(-1, Math.min(1, covariance / Math.sqrt(sx * sy)))
}
