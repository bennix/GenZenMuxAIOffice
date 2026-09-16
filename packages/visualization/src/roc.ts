/** Empirical ROC. Equal scores enter together, independent of row order. */
export function rocCurve(labels: readonly number[], scores: readonly number[]) {
  if (!labels.length || labels.length !== scores.length)
    throw new Error('ROC 需要一一对应的标签和分数。')
  if (labels.some((v) => v !== 0 && v !== 1)) throw new Error('ROC 标签必须为 0 或 1。')
  if (scores.some((v) => !Number.isFinite(v))) throw new Error('ROC 分数必须为有限数值。')
  const positives = labels.reduce((sum, v) => sum + v, 0),
    negatives = labels.length - positives
  if (!positives || !negatives) throw new Error('ROC 必须同时包含正类和负类。')
  const observations = scores
    .map((score, i) => ({ score, label: labels[i]! }))
    .sort((a, b) => b.score - a.score)
  const points: [number, number][] = [[0, 0]]
  let tp = 0,
    fp = 0,
    index = 0,
    auc = 0
  while (index < observations.length) {
    const score = observations[index]!.score
    do {
      if (observations[index]!.label === 1) tp++
      else fp++
      index++
    } while (index < observations.length && observations[index]!.score === score)
    const previous = points[points.length - 1]!
    const point: [number, number] = [fp / negatives, tp / positives]
    auc += ((point[0] - previous[0]) * (point[1] + previous[1])) / 2
    points.push(point)
  }
  return { points, auc, positives, negatives }
}
