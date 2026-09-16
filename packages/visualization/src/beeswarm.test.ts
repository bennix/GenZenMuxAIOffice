import { expect, it } from 'vitest'
import { swarmOffsets } from './beeswarm'

it('handles dense identical samples with equal collision-free spacing', () => {
  const offsets = swarmOffsets(Array(600).fill(20), 9).sort((a, b) => a - b)
  expect(offsets).toHaveLength(600)
  for (let i = 1; i < offsets.length; i++)
    expect(offsets[i]! - offsets[i - 1]!).toBeGreaterThanOrEqual(9)
})

it('separates duplicate and nearby samples without moving their value coordinates', () => {
  const positions = [10, 10, 10, 12, 15, 90]
  const offsets = swarmOffsets(positions, 8)
  expect(offsets).toEqual(swarmOffsets(positions, 8))
  expect(offsets[5]).toBe(0)
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++)
      expect(
        Math.hypot(offsets[i]! - offsets[j]!, positions[i]! - positions[j]!),
      ).toBeGreaterThanOrEqual(8 - 1e-7)
  expect(positions).toEqual([10, 10, 10, 12, 15, 90])
})
