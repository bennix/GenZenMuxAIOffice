import { boxSummary, kernelDensity } from './statistics'

/** Each column is one sample population. Widths use a shared density scale. */
export function distributionProfiles(columns: readonly (readonly (number | null)[])[]) {
  const profiles = columns.map((column) => {
    const samples = column.filter((value): value is number => value !== null)
    if (samples.length < 2) throw new Error('小提琴图和山脊图的每个分组至少需要两个有效样本。')
    const density = kernelDensity(samples)
    if (density.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.density)))
      throw new Error('样本数值范围过大，无法可靠计算密度。')
    return { count: samples.length, summary: boxSummary(samples), density }
  })
  const maximum = profiles.reduce(
    (max, profile) => profile.density.reduce((m, point) => Math.max(m, point.density), max),
    0,
  )
  return profiles.map((profile) => ({
    ...profile,
    points: profile.density.map((point) => ({ value: point.x, width: point.density / maximum })),
  }))
}
