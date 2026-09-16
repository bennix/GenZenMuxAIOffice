export function stemLeaves(values: (number | null)[]) {
  const groups = new Map<string, number[]>()
  const samples = values.filter((value): value is number => value !== null)
  if (
    !samples.length ||
    samples.length > 500 ||
    samples.some((value) => !Number.isSafeInteger(value))
  )
    throw new Error('茎叶图需要 1–500 个安全整数样本；小数请先明确换算单位。')
  samples.sort((a, b) => a - b)
  for (const value of samples) {
    const stem = `${value < 0 ? '-' : ''}${Math.floor(Math.abs(value) / 10)}`
    const leaves = groups.get(stem) ?? []
    leaves.push(Math.abs(value) % 10)
    groups.set(stem, leaves)
  }
  if (groups.size > 40) throw new Error('茎叶图最多显示 40 个茎，请先筛选样本。')
  return [...groups].map(([stem, leaves]) => ({ stem, leaves }))
}

export function stemLeafLines(
  groups: { stem: string; leaves: number[] }[],
  capacity = 20,
): string[] {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('每行叶数量必须为正整数。')
  return groups.flatMap(({ stem, leaves }) => {
    const lines: string[] = []
    for (let offset = 0; offset < leaves.length; offset += capacity)
      lines.push(`${stem} | ${leaves.slice(offset, offset + capacity).join(' ')}`)
    return lines
  })
}
