export function priceIntervals(columns: readonly (readonly (number | null)[])[]) {
  if (columns.length !== 4) throw new Error('价格图需要四个数值列，依次为开盘、收盘、最低、最高。')
  if (columns.some((column) => column.length !== columns[0]!.length))
    throw new Error('价格列长度必须一致。')
  return columns[0]!.map((_, i) => {
    const [open, close, low, high] = columns.map((column) => column[i])
    if ([open, close, low, high].some((value) => value === null || !Number.isFinite(value)))
      throw new Error(`第 ${i + 1} 行的开盘、收盘、最低、最高必须完整且为有限数值。`)
    if (low! > Math.min(open!, close!) || high! < Math.max(open!, close!) || low! > high!)
      throw new Error(
        `第 ${i + 1} 行价格区间无效：最低值不得高于开盘或收盘，最高值不得低于开盘或收盘。`,
      )
    return [open!, close!, low!, high!] as [number, number, number, number]
  })
}
