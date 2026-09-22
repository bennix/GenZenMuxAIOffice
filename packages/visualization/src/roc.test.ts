import { expect, it } from 'vitest'
import { rocCurve } from './roc'
import { renderChartSvg } from './render'

it('computes perfect, reversed and tied rankings correctly', () => {
  expect(rocCurve([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]).auc).toBe(1)
  expect(rocCurve([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1]).auc).toBe(0)
  expect(rocCurve([0, 1], [5, 5])).toMatchObject({
    points: [
      [0, 0],
      [1, 1],
    ],
    auc: 0.5,
  })
  expect(rocCurve([1, 0], [5, 5]).auc).toBe(0.5)
  expect(rocCurve([0, 0, 1, 1], [0.1, 0.4, 0.35, 0.8]).auc).toBe(0.75)
})
it('rejects single-class, missing and non-binary labels', () => {
  expect(() => rocCurve([1, 1], [1, 2])).toThrow('同时')
  expect(() => rocCurve([0, 2], [1, 2])).toThrow('0 或 1')
  expect(() => rocCurve([0, 1], [1])).toThrow('对应')
})
it('exports the calculated AUC with the curve', () => {
  const svg = renderChartSvg({
    chartId: 'roc',
    x: 'id',
    y: ['label', 'score'],
    table: {
      columns: ['id', 'label', 'score'],
      rows: [
        ['a', 0, 0.1],
        ['b', 0, 0.4],
        ['c', 1, 0.35],
        ['d', 1, 0.8],
      ],
    },
  })
  expect(svg).toContain('AUC = 0.7500')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
