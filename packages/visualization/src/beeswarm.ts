/** Greedy collision-free placement, changing only the categorical axis. */
export function swarmOffsets(positions: number[], diameter: number): number[] {
  if (positions.every((position) => position === positions[0]))
    return positions.map((_, index) =>
      index === 0 ? 0 : Math.ceil(index / 2) * (diameter + 0.001) * (index % 2 ? -1 : 1),
    )
  const offsets = positions.map(() => 0)
  const placed: number[] = []
  for (const index of positions.map((_, i) => i).sort((a, b) => positions[a]! - positions[b]!)) {
    const neighbors = placed.filter(
      (other) => Math.abs(positions[index]! - positions[other]!) < diameter,
    )
    const candidates = [0]
    for (const other of neighbors) {
      const dy = positions[index]! - positions[other]!
      const dx = Math.sqrt(Math.max(0, diameter * diameter - dy * dy)) + 0.001
      candidates.push(offsets[other]! - dx, offsets[other]! + dx)
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
    offsets[index] = candidates.find((x) =>
      neighbors.every(
        (other) =>
          Math.hypot(x - offsets[other]!, positions[index]! - positions[other]!) >= diameter - 1e-7,
      ),
    )!
    placed.push(index)
  }
  return offsets
}
