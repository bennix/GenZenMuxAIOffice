/** Choose the dominant opaque color around a rendered text box. Quantization keeps
 * antialiasing noise from splitting one PDF page/cell background into many colors. */
export function dominantBackdrop(
  samples: readonly [number, number, number, number][],
): string | undefined {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (const [r, g, b, a] of samples) {
    if (a < 192) continue
    const key = `${r >> 4},${g >> 4},${b >> 4}`
    const hit = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    hit.count++
    hit.r += r
    hit.g += g
    hit.b += b
    buckets.set(key, hit)
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0]
  if (!best) return undefined
  return `rgb(${Math.round(best.r / best.count)}, ${Math.round(best.g / best.count)}, ${Math.round(best.b / best.count)})`
}
