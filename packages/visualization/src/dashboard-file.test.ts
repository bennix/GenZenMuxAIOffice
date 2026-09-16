import { expect, it } from 'vitest'
import { parseDashboardFile, serializeDashboardFile } from './dashboard-file'

const dashboard = {
  title: '季度分析',
  columns: 2 as const,
  cards: [
    {
      chartId: 'column',
      x: '地区',
      y: ['收入'],
      table: {
        columns: ['地区', '收入'],
        rows: [
          ['东', 0],
          ['西', -2],
          ['南', null],
        ],
      },
    },
  ],
}
it('round-trips the editable configuration and exact data including missing and signed values', () => {
  const source = serializeDashboardFile(dashboard)
  const restored = parseDashboardFile(source)
  expect(restored).toEqual(dashboard)
  restored.cards[0]!.table.rows[0]![1] = 100
  expect(dashboard.cards[0]!.table.rows[0]![1]).toBe(0)
})
it('rejects unsupported files and validates all chart data before accepting them', () => {
  expect(() => serializeDashboardFile({ ...dashboard, cards: [{ ...dashboard.cards[0]!, table: { columns: ['地区', '收入'], rows: [['东', NaN]] } }] })).toThrow()
  const envelope = JSON.parse(serializeDashboardFile(dashboard))
  expect(() => parseDashboardFile('not json')).toThrow('JSON')
  expect(() => parseDashboardFile(JSON.stringify({ ...envelope, version: 2 }))).toThrow('版本')
  envelope.dashboard.cards.push({ ...envelope.dashboard.cards[0], y: ['不存在'] })
  expect(() => parseDashboardFile(JSON.stringify(envelope))).toThrow('第 2 张')
  envelope.dashboard.cards.pop()
  envelope.dashboard.cards[0].renderItem = 'execute code'
  expect(() => parseDashboardFile(JSON.stringify(envelope))).toThrow('不支持的字段')
})
