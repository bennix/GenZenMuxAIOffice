import { expect, it } from 'vitest'
import { kaplanMeier } from './survival'
import { renderChartSvg } from './render'

it('retains censored subjects in the risk set at tied event times', () => {
  const curve = kaplanMeier([3, 1, 2, 1], [1, 1, 0, 0])
  expect(curve.points).toEqual([
    [0, 1],
    [1, 0.75],
    [2, 0.75],
    [3, 0],
  ])
  expect(curve.riskTable.map((r) => r.atRisk)).toEqual([4, 2, 1])
  expect(curve.censored).toEqual([
    [1, 0.75, 1],
    [2, 0.75, 1],
  ])
  expect(kaplanMeier([1, 1, 2, 3], [0, 1, 0, 1])).toEqual(curve)
})
it('keeps all-censored survival at one and handles time-zero events', () => {
  expect(kaplanMeier([1, 2], [0, 0]).points).toEqual([
    [0, 1],
    [1, 1],
    [2, 1],
  ])
  expect(kaplanMeier([0, 2], [1, 1]).points).toEqual([
    [0, 1],
    [0, 0.5],
    [2, 0],
  ])
  expect(() => kaplanMeier([-1], [1])).toThrow('非负')
  expect(() => kaplanMeier([1], [2])).toThrow('状态')
})
it('exports the survival step curve and censor series', () => {
  const svg = renderChartSvg({
    chartId: 'kaplan-meier',
    x: 'id',
    y: ['time', 'event'],
    table: {
      columns: ['id', 'time', 'event'],
      rows: [
        ['a', 1, 1],
        ['b', 1, 0],
        ['c', 2, 1],
      ],
    },
  })
  expect(svg).toContain('Kaplan–Meier')
  expect(svg).toContain('删失')
  expect(svg).not.toMatch(/NaN|Infinity/)
})
