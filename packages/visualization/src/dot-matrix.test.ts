import { expect, it } from 'vitest'
import { buildChartOption } from './render'

it('draws exactly one same-sized circle per unit, including zero and wrapped rows', () => {
  const option = buildChartOption({
    chartId: 'dot-matrix',
    x: 'name',
    y: ['value'],
    table: {
      columns: ['name', 'value'],
      rows: [
        ['zero', 0],
        ['one', 1],
        ['eleven', 11],
      ],
    },
  })
  const series = (
    option.series as unknown as {
      renderItem(
        params: object,
        api: object,
      ): { children: { type: string; shape?: { r: number; cx: number; cy: number } }[] }
    }[]
  )[0]!
  const radii: number[] = []
  for (const [index, count] of [0, 1, 11].entries()) {
    const circles = series
      .renderItem(
        {},
        {
          value: (dim: number) => (dim === 0 ? index : count),
          getWidth: () => 960,
          getHeight: () => 600,
        },
      )
      .children.filter((child) => child.type === 'circle')
    expect(circles).toHaveLength(count)
    radii.push(...circles.map((circle) => circle.shape!.r))
    if (count === 11) {
      expect(circles[10]!.shape!.cx).toBe(circles[0]!.shape!.cx)
      expect(circles[10]!.shape!.cy).toBeGreaterThan(circles[0]!.shape!.cy)
    }
  }
  expect(new Set(radii).size).toBe(1)
  expect(radii[0]).toBeGreaterThan(0)
})

it('rejects fractional counts instead of silently rounding', () => {
  for (const value of [0.5, -1, 101, null])
    expect(() =>
      buildChartOption({
        chartId: 'dot-matrix',
        x: 'name',
        y: ['value'],
        table: {
          columns: ['name', 'value'],
          rows: [
            ['a', value],
            ['b', 1],
          ],
        },
      }),
    ).toThrow()
})
