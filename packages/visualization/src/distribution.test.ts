import { expect, it } from 'vitest'
import { distributionProfiles } from './distribution'
import { renderChartSvg } from './render'

it('preserves sample medians, ignores missing samples and shares the density scale', () => {
  const profiles = distributionProfiles([
    [0, 1, 2, 3, 4, null],
    [0, 10, 20, 30, 40],
  ])
  expect(profiles[0]!.count).toBe(5)
  expect(profiles[0]!.summary.median).toBe(2)
  expect(profiles[1]!.summary.median).toBe(20)
  const peak = (index: number) => Math.max(...profiles[index]!.points.map((point) => point.width))
  expect(peak(0)).toBeCloseTo(1)
  expect(peak(1)).toBeCloseTo(0.1)
  for (const profile of profiles) {
    const points = profile.density
    const integral = points
      .slice(1)
      .reduce(
        (sum, point, i) =>
          sum + ((point.x - points[i]!.x) * (point.density + points[i]!.density)) / 2,
        0,
      )
    expect(integral).toBeCloseTo(1, 2)
  }
})

it('handles constant groups and rejects inadequate or overflowing distributions', () => {
  const [profile] = distributionProfiles([[5, 5, 5]])
  expect(profile!.summary.median).toBe(5)
  expect(profile!.points.every((point) => Number.isFinite(point.width))).toBe(true)
  expect(() => distributionProfiles([[1, null]])).toThrow('两个')
  expect(() => distributionProfiles([[1e308, -1e308]])).toThrow('范围过大')
})

it('exports distinct violin and ridgeline geometries for multiple groups', () => {
  const request = {
    x: 'id',
    y: ['narrow', 'wide'],
    title: '分布对比',
    table: {
      columns: ['id', 'narrow', 'wide'],
      rows: [
        [1, 0, 0],
        [2, 1, 10],
        [3, 2, 20],
        [4, 3, 30],
      ],
    },
  }
  const violin = renderChartSvg({ ...request, chartId: 'violin' })
  const ridge = renderChartSvg({ ...request, chartId: 'ridgeline' })
  for (const svg of [violin, ridge]) {
    expect(svg).toContain('分布对比')
    expect(svg).toContain('narrow')
    expect(svg).toContain('wide')
    expect(svg).not.toMatch(/NaN|Infinity/)
  }
  expect(violin).not.toEqual(ridge)
})
