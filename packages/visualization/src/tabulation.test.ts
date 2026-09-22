import { expect, it } from 'vitest'
import { tabulate } from './tabulation'
import { renderChartSvg } from './render'

const table = {
  columns: ['地区', '渠道', '销售'],
  rows: [
    ['东', '网店', 10],
    ['东', '网店', -2],
    ['西', '门店', 0],
    ['西', null, null],
    ['东', '门店', 5],
  ],
}
it('preserves raw text, empty cells and duplicate records', () => {
  const result = tabulate(table, 'table', '地区', ['渠道', '销售'])
  expect(result.cells).toEqual([
    table.columns,
    ...table.rows.map((row) => row.map((value) => String(value ?? ''))),
  ])
})
it('counts records including missing classifications, with consistent margins', () => {
  expect(tabulate(table, 'crosstab', '地区', ['渠道']).cells).toEqual([
    ['地区 / 渠道', '"网店"', '"门店"', '（空值）', '合计'],
    ['"东"', '2', '1', '0', '3'],
    ['"西"', '0', '1', '1', '2'],
    ['合计', '2', '2', '1', '5'],
  ])
})
it('sums duplicate combinations while retaining zero, signed and missing data', () => {
  expect(tabulate(table, 'pivot', '地区', ['销售'], '渠道').cells).toEqual([
    ['地区 / 渠道', '"网店"', '"门店"', '（空值）', '合计'],
    ['"东"', '8', '5', '0', '13'],
    ['"西"', '0', '0', '0', '0'],
    ['合计', '8', '5', '0', '13'],
  ])
  expect(() => tabulate(table, 'pivot', '地区', ['渠道'], '渠道')).toThrow('非数值')
})
it('does not conflate numeric and text categories or missing-category text', () => {
  const input = {
    columns: ['row', 'column'],
    rows: [
      [1, null],
      ['1', '（空值）'],
    ],
  }
  expect(tabulate(input, 'crosstab', 'row', ['column']).cells).toEqual([
    ['row / column', '（空值）', '"（空值）"', '合计'],
    ['1', '1', '0', '1'],
    ['"1"', '0', '1', '1'],
    ['合计', '1', '1', '2'],
  ])
})
it('renders readable tables and rejects overflow instead of hiding rows or shrinking fonts', () => {
  for (const chartId of ['table', 'crosstab', 'pivot']) {
    const svg = renderChartSvg({
      chartId,
      table,
      x: '地区',
      y: chartId === 'crosstab' ? ['渠道'] : ['销售'],
      target: '渠道',
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('14px')
  }
  expect(() =>
    renderChartSvg(
      {
        chartId: 'table',
        table: { columns: ['a', 'b'], rows: Array.from({ length: 40 }, (_, i) => [i, '文字']) },
        x: 'a',
        y: ['b'],
      },
      240,
      180,
    ),
  ).toThrow('清晰')
})
