export function marimekkoCells(rows: readonly (readonly number[])[]) {
  if (
    !rows.length ||
    rows.some(
      (row) =>
        !row.length ||
        row.length !== rows[0]!.length ||
        row.some((v) => !Number.isFinite(v) || v < 0),
    )
  )
    throw new Error('Marimekko 需要完整非负矩形数据。')
  const totals = rows.map((row) => row.reduce((sum, value) => sum + value, 0))
  const total = totals.reduce((sum, value) => sum + value, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('Marimekko 总量必须为有限正数。')
  let left = 0
  return rows.flatMap((row, category) => {
    const width = totals[category]! / total
    let bottom = 0
    const cells = row.map((value, series) => {
      const height = totals[category] === 0 ? 0 : value / totals[category]!
      const cell = { category, series, value, left, bottom, width, height }
      bottom += height
      return cell
    })
    left += width
    return cells
  })
}
