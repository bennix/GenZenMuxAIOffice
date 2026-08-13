export function resolveModelOptions(
  builtIns: readonly string[],
  saved: readonly string[],
  removed: readonly string[],
  active: string,
): string[] {
  return [...new Set([...builtIns, ...saved, active].filter(Boolean))].filter(
    (name) => name === active || !removed.includes(name),
  )
}

export function removeActiveModel(
  models: readonly string[],
  active: string,
): { models: string[]; active: string } | null {
  if (models.length <= 1) return null
  const remaining = models.filter((name) => name !== active)
  if (!remaining.length) return null
  return { models: remaining, active: remaining[0] }
}
