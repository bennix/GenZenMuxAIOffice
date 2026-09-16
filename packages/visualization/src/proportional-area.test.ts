import { expect, it } from 'vitest'
import { buildChartOption } from './render'

it('scales circle areas linearly and keeps zero invisible at normal and small sizes', () => {
  const option = buildChartOption({
    chartId: 'proportional-area',
    x: 'name',
    y: ['value'],
    table: {
      columns: ['name', 'value'],
      rows: [
        ['zero', 0],
        ['one', 1],
        ['four', 4],
      ],
    },
  })
  const series = (
    option.series as unknown as {
      renderItem(params: object, api: object): { children: { shape: { r: number } }[] }
    }[]
  )[0]!
  for (const [width, height] of [
    [960, 600],
    [240, 180],
  ]) {
    const radius = (index: number, value: number) =>
      series.renderItem(
        {},
        {
          value: (dimension: number) => (dimension === 0 ? index : value),
          getWidth: () => width,
          getHeight: () => height,
        },
      ).children[0]!.shape.r
    expect(radius(0, 0)).toBe(0)
    expect(radius(1, 1)).toBeGreaterThan(0)
    expect(radius(2, 4) ** 2 / radius(1, 1) ** 2).toBeCloseTo(4)
  }
})

it('rejects negative or all-zero measurements instead of inventing area', () => {
  for (const values of [
    [0, 0],
    [1, -1],
  ])
    expect(() =>
      buildChartOption({
        chartId: 'proportional-area',
        x: 'name',
        y: ['value'],
        table: { columns: ['name', 'value'], rows: values.map((value, i) => [String(i), value]) },
      }),
    ).toThrow()
})
