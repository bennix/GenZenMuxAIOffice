export function waterfallSteps(values: readonly number[]) {
  if (!values.length || values.some((v) => !Number.isFinite(v)))
    throw new Error('瀑布图需要完整有限数值。')
  let total = 0
  return values.map((change) => {
    const start = total
    total += change
    if (!Number.isFinite(total)) throw new Error('累计值超出范围。')
    return { start, end: total, change }
  })
}
