import { format, type EChartsOption } from 'echarts'

export interface WordFrequency {
  word: string
  value: number
}
export interface PositionedWord extends WordFrequency {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export function wordFrequencies(input: readonly WordFrequency[]): WordFrequency[] {
  const words = new Map<string, number>()
  for (const item of input) {
    const word = item.word.trim()
    if (!word || word.length > 80 || /[\r\n]/.test(word))
      throw new Error('词语须为 1–80 字符的单行文本。')
    if (!Number.isFinite(item.value) || item.value < 0) throw new Error('词频必须为有限非负数。')
    const value = (words.get(word) ?? 0) + item.value
    if (!Number.isFinite(value)) throw new Error('汇总词频超出数值范围。')
    words.set(word, value)
    if (words.size > 80) throw new Error('词云最多支持 80 个不同词语，请先筛选。')
  }
  const result = [...words]
    .filter(([, value]) => value > 0)
    .map(([word, value]) => ({ word, value }))
  if (!result.length) throw new Error('词云至少需要一个正词频。')
  return result.sort((a, b) => b.value - a.value)
}

/** Padded text rectangles are packed without dropping words or shrinking below 16px. */
export function layoutWords(
  words: readonly WordFrequency[],
  width: number,
  height: number,
): PositionedWord[] {
  const maximum = Math.max(...words.map((word) => word.value))
  const measure = (item: WordFrequency, scale: number) => {
    const fontSize = 16 + 48 * scale * Math.sqrt(item.value / maximum)
    const rect = format.getTextRect(item.word, `${fontSize}px sans-serif`)
    return {
      fontSize,
      w: Math.ceil(rect.width) + 12,
      h: Math.ceil(Math.max(rect.height, fontSize * 1.2)) + 8,
    }
  }
  // Reserve whitespace for spiral packing while keeping the same scale for every word.
  let low = 0,
    high = 1
  for (let iteration = 0; iteration < 16; iteration++) {
    const scale = (low + high) / 2
    const area = words.reduce((sum, item) => {
      const size = measure(item, scale)
      return sum + size.w * size.h
    }, 0)
    if (area <= width * height * 0.35) low = scale
    else high = scale
  }
  const placed: PositionedWord[] = []
  for (const item of words) {
    const { fontSize, w, h } = measure(item, low)
    let position: PositionedWord | undefined
    for (let step = 0; step < 6000; step++) {
      const radius = (Math.sqrt(step / 6000) * Math.hypot(width, height)) / 2
      const angle = step * 2.399963229728653
      const x = width / 2 + radius * Math.cos(angle) - w / 2
      const y = height / 2 + radius * Math.sin(angle) - h / 2
      if (x < 0 || y < 0 || x + w > width || y + h > height) continue
      if (
        placed.some(
          (other) =>
            x < other.x + other.width &&
            x + w > other.x &&
            y < other.y + other.height &&
            y + h > other.y,
        )
      )
        continue
      position = { ...item, x, y, width: w, height: h, fontSize }
      break
    }
    if (!position) throw new Error('当前尺寸无法完整排下词云，请减少词语或增大导出尺寸。')
    placed.push(position)
  }
  return placed
}

export function wordCloudOption(input: readonly WordFrequency[], title = ''): EChartsOption {
  const words = wordFrequencies(input)
  let dimensions = '',
    layout: PositionedWord[] = []
  return {
    backgroundColor: '#ffffff',
    animation: false,
    title: {
      text: title,
      left: 'center',
      subtext: '重复词语合并；字号按词频平方根缩放；零频词不显示',
    },
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'none',
        dimensions: ['序号', '词频'],
        encode: { tooltip: [1] },
        data: words.map((word, index) => ({ name: word.word, value: [index, word.value] })),
        renderItem: (_params, api) => {
          const width = api.getWidth() - 40,
            height = api.getHeight() - 110
          const next = `${width}:${height}`
          if (next !== dimensions) {
            layout = layoutWords(words, width, height)
            dimensions = next
          }
          const index = Number(api.value(0)),
            word = layout[index]!
          return {
            type: 'text',
            style: {
              x: word.x + word.width / 2 + 20,
              y: word.y + word.height / 2 + 80,
              text: word.word,
              align: 'center',
              verticalAlign: 'middle',
              fontSize: word.fontSize,
              fontFamily: 'sans-serif',
              fill: ['#2563eb', '#7c3aed', '#0f766e', '#be123c', '#b45309'][index % 5]!,
            },
          }
        },
      },
    ],
  }
}
