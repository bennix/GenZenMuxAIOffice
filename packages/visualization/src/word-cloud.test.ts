import { expect, it } from 'vitest'
import { layoutWords, wordFrequencies } from './word-cloud'
import { renderChartSvg } from './render'

const frequencies = [
  { word: ' 数据 ', value: 3 },
  { word: '数据', value: 5 },
  { word: '分析', value: 2 },
  { word: '忽略', value: 0 },
]
it('combines repeated trimmed words and omits only zero frequencies', () => {
  expect(wordFrequencies(frequencies)).toEqual([
    { word: '数据', value: 8 },
    { word: '分析', value: 2 },
  ])
  expect(() => wordFrequencies([{ word: '负数', value: -1 }])).toThrow('非负')
  expect(() => wordFrequencies([{ word: '', value: 1 }])).toThrow('单行')
  expect(() => wordFrequencies([{ word: '零', value: 0 }])).toThrow('正词频')
})
it('packs all word rectangles deterministically within the canvas without overlap', () => {
  const words = wordFrequencies(
    Array.from({ length: 40 }, (_, i) => ({ word: `词语${i}`, value: i + 1 })),
  )
  const layout = layoutWords(words, 920, 490)
  expect(layout).toEqual(layoutWords(words, 920, 490))
  expect(layout).toHaveLength(40)
  for (const [index, word] of layout.entries()) {
    expect(word.fontSize).toBeGreaterThanOrEqual(16)
    expect(word.x).toBeGreaterThanOrEqual(0)
    expect(word.y).toBeGreaterThanOrEqual(0)
    expect(word.x + word.width).toBeLessThanOrEqual(920)
    expect(word.y + word.height).toBeLessThanOrEqual(490)
    for (const other of layout.slice(index + 1)) {
      expect(
        word.x < other.x + other.width &&
          word.x + word.width > other.x &&
          word.y < other.y + other.height &&
          word.y + word.height > other.y,
      ).toBe(false)
    }
  }
  expect(layout[0]!.fontSize).toBeGreaterThan(layout[39]!.fontSize)
})
it('renders the actual terms and rejects insufficient space without dropping terms', () => {
  const request = {
    chartId: 'word-cloud',
    x: '词语',
    y: ['次数'],
    table: {
      columns: ['词语', '次数'],
      rows: frequencies.map((item) => [item.word, item.value]),
    },
  }
  const svg = renderChartSvg(request)
  expect(svg).toContain('数据')
  expect(svg).toContain('分析')
  expect(svg).not.toContain('忽略')
  expect(() => layoutWords(wordFrequencies(frequencies), 50, 50)).toThrow('完整排下')
})
