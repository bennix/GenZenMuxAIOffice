/** Deterministic offsets change only the grouping axis, never sample values. */
export function jitterPoints(values: readonly (number | null)[], group: number) {
  return values.flatMap((value, index) => {
    if (value === null) return []
    if (!Number.isFinite(value)) throw new Error('抖动图需要有限数值样本。')
    let hash = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(group + 1, 0x27d4eb2d)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    const offset = (((hash ^ (hash >>> 16)) >>> 0) / 0x100000000 - 0.5) * 0.7
    return [[group + offset, value, index] as [number, number, number]]
  })
}
