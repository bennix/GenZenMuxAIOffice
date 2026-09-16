import { expect, it } from 'vitest'
import { parseChartSuggestion, visualizationPrompt } from './ai'
const table = {
  columns: ['地区', '收入'],
  rows: [
    ['东', 10],
    ['西', 20],
  ],
}
it('validates the full contour grid beyond the AI sample', () => {
  const proposal = {
    chartId: 'contour',
    x: 'x',
    y: ['y', 'z'],
    title: '等高线',
    reason: '展示网格高度',
  }
  const input = {
    columns: ['x', 'y', 'z'],
    rows: Array.from({ length: 7 }, (_, x) =>
      Array.from({ length: 7 }, (_, y) => [x, y, x + y]),
    ).flat(),
  }
  expect(parseChartSuggestion(JSON.stringify(proposal), input)).toEqual(proposal)
  expect(() =>
    parseChartSuggestion(JSON.stringify(proposal), { ...input, rows: input.rows.slice(0, -1) }),
  ).toThrow('完整矩形')
})
it('accepts circle packing parent bindings and rejects an inconsistent parent total', () => {
  const proposal = {
    chartId: 'circle-packing',
    x: 'node',
    parent: 'parent',
    y: ['weight'],
    title: '层级',
    reason: '比较叶子权重',
  }
  const input = {
    columns: ['node', 'parent', 'weight'],
    rows: [
      ['root', null, null],
      ['A', 'root', 4],
      ['B', 'root', 1],
    ],
  }
  expect(parseChartSuggestion(JSON.stringify(proposal), input)).toEqual(proposal)
  expect(() =>
    parseChartSuggestion(JSON.stringify(proposal), {
      ...input,
      rows: [['root', null, 10], ...input.rows.slice(1)],
    }),
  ).toThrow('合计不一致')
})
it('accepts horizon proposals with dates and rejects repeated times outside the sample', () => {
  const input = {
    columns: ['time', 'value'],
    rows: Array.from({ length: 31 }, (_, i) => [i, i - 15]),
  }
  const proposal = {
    chartId: 'horizon',
    x: 'time',
    y: ['value'],
    title: '正负变化',
    reason: '紧凑趋势比较',
  }
  expect(parseChartSuggestion(JSON.stringify(proposal), input)).toEqual(proposal)
  const invalid = { ...input, rows: [...input.rows.slice(0, 30), [0, 1]] }
  expect(() => parseChartSuggestion(JSON.stringify(proposal), invalid)).toThrow('重复')
  expect(
    parseChartSuggestion(JSON.stringify(proposal), {
      columns: input.columns,
      rows: [
        ['2026-01-01', -3],
        ['2026-01-02', 3],
      ],
    }),
  ).toEqual(proposal)
})
it('accepts hexbin AI proposals and checks coordinates outside the 30-row sample', () => {
  const input = { columns: ['x', 'y'], rows: Array.from({ length: 31 }, (_, i) => [i, i * i]) }
  const proposal = {
    chartId: 'hexbin',
    x: 'x',
    y: ['y'],
    title: '分箱计数',
    reason: '显示密集观测',
  }
  expect(parseChartSuggestion(JSON.stringify(proposal), input)).toEqual(proposal)
  const invalid = { ...input, rows: [...input.rows.slice(0, 30), [null, 1]] }
  expect(() => parseChartSuggestion(JSON.stringify(proposal), invalid)).toThrow('完整')
})
it('accepts text classification and pivot bindings from AI', () => {
  const input = { columns: ['地区', '渠道', '金额'], rows: [['东', '网店', 12]] }
  for (const chartId of ['table', 'crosstab', 'pivot']) {
    const proposal = {
      chartId,
      x: '地区',
      y: chartId === 'pivot' ? ['金额'] : ['渠道'],
      target: '渠道',
      title: '分类汇总',
      reason: '展示记录与汇总',
    }
    expect(parseChartSuggestion(JSON.stringify(proposal), input)).toEqual(proposal)
  }
})
it('validates AI field bindings against actual data', () => {
  const proposal = {
    chartId: 'bar',
    x: '地区',
    y: ['收入'],
    title: '收入比较',
    reason: '比较类别大小',
  }
  expect(parseChartSuggestion(JSON.stringify(proposal), table)).toEqual(proposal)
  expect(() => parseChartSuggestion(JSON.stringify({ ...proposal, y: ['虚构列'] }), table)).toThrow(
    '有效',
  )
  expect(() => parseChartSuggestion('<script>alert(1)</script>', table)).toThrow('JSON')
})
it('accepts date field suggestions and validates dates beyond the AI sample', () => {
  const dates = {
    columns: ['任务', '开始', '结束'],
    rows: Array.from({ length: 31 }, (_, i) => [`任务 ${i}`, '2026-09-01', '2026-09-16']),
  }
  for (const chartId of ['gantt', 'timeline']) {
    const proposal = {
      chartId,
      x: '任务',
      y: chartId === 'gantt' ? ['开始', '结束'] : ['开始'],
      title: '项目安排',
      reason: '按日期展示任务',
    }
    expect(parseChartSuggestion(JSON.stringify(proposal), dates)).toEqual(proposal)
    const invalid = { ...dates, rows: dates.rows.map((row) => [...row]) }
    invalid.rows[30][1] = '2026-02-30'
    expect(() => parseChartSuggestion(JSON.stringify(proposal), invalid)).toThrow()
  }
  expect(visualizationPrompt(dates, '展示安排').system).toContain('YYYY-MM-DD')
})
it('limits the AI sample and includes explicit data profiles', () => {
  const prompt = visualizationPrompt(
    { columns: ['值'], rows: Array.from({ length: 100 }, (_, i) => [i]) },
    '看分布',
  )
  expect(JSON.parse(prompt.user).sample).toHaveLength(30)
  expect(JSON.parse(prompt.user).rowCount).toBe(100)
  expect(prompt.system).toContain('不能编造')
  expect(
    JSON.parse(prompt.user).bindings.find(
      (item: { chartId: string }) => item.chartId === 'candlestick',
    ).orderedY,
  ).toEqual(['开盘', '收盘', '最低', '最高'])
  expect(
    JSON.parse(prompt.user).bindings.find((item: { chartId: string }) => item.chartId === 'roc')
      .notes,
  ).toContain('0/1')
})
