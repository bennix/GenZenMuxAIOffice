import { groupPageBlocks, isCompactCellStack, type TextBlock } from '../renderer/text-block'
import type { PageEntry } from '../renderer/search'
import type { NativeTextPage, NativeTextRun } from './text-edit'

export interface NativeParagraph extends TextBlock {
  paragraph: number
  text: string
  font: string
  maxHeight: number
}
const overlaps = (a: number[], b: number[]) =>
  Math.min(a[2]!, b[2]!) > Math.max(a[0]!, b[0]!) && Math.min(a[3]!, b[3]!) > Math.max(a[1]!, b[1]!)
const belongsToLine = (run: NativeTextRun, line: TextBlock['lines'][number]): boolean =>
  Math.abs(run.y - line.y) <= Math.max(run.size, line.fontSize) * 0.35 &&
  Math.min(run.rect[2], line.rect[2]) - Math.max(run.rect[0], line.rect[0]) >=
    (run.rect[2] - run.rect[0]) * 0.5
const belongsToBlock = (run: NativeTextRun, block: TextBlock): boolean =>
  block.lines.some((line) => belongsToLine(run, line))

export function nativeParagraphs(
  page: NativeTextPage,
  exclude: (run: NativeTextRun) => boolean = () => false,
): NativeParagraph[] {
  let text = ''
  const pictures = page.imageRects ?? []
  const insidePicture = (r: NativeTextRun) =>
    pictures.some((rect) => {
      const area =
        Math.max(0, Math.min(rect[2], r.rect[2]) - Math.max(rect[0], r.rect[0])) *
        Math.max(0, Math.min(rect[3], r.rect[3]) - Math.max(rect[1], r.rect[1]))
      return area > (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) * 0.5
    })
  const usable = page.runs.filter((r) => !r.rotated && !exclude(r) && !insidePicture(r))
  const entry: PageEntry = {
    text: '',
    lower: '',
    items: usable.map((run) => {
      const start = text.length
      text += run.text
      return {
        start,
        end: text.length,
        x: run.x,
        y: run.y,
        w: run.rect[2] - run.rect[0],
        h: run.size,
      }
    }),
  }
  entry.text = text
  entry.lower = text.toLowerCase()
  const blocked = page.runs.filter((r) => r.rotated || exclude(r))
  const blocks = groupPageBlocks(entry).flatMap((block): TextBlock[] => {
    if (!isCompactCellStack(block) && !blocked.some((r) => overlaps(r.rect, block.rect)))
      return [block]
    if (isCompactCellStack(block)) {
      return usable
        .filter((r) => belongsToBlock(r, block))
        .map((run) => ({
          rect: run.rect,
          fontSize: run.size,
          lineHeight: run.size * 1.2,
          align: 'left',
          lines: [{ rect: run.rect, text: run.text, y: run.y, fontSize: run.size }],
        }))
    }
    // Only split lines touching a protected formula; retain neighboring prose as paragraphs.
    const parts: TextBlock[] = []
    let pending: TextBlock['lines'] = []
    const flush = () => {
      if (!pending.length) return
      parts.push({
        ...block,
        lines: pending,
        rect: [
          Math.min(...pending.map((l) => l.rect[0])),
          Math.min(...pending.map((l) => l.rect[1])),
          Math.max(...pending.map((l) => l.rect[2])),
          Math.max(...pending.map((l) => l.rect[3])),
        ],
      })
      pending = []
    }
    for (const line of block.lines) {
      if (
        !blocked.some(
          (r) =>
            Math.abs(r.y - line.y) <= Math.max(r.size, line.fontSize) * 0.65 &&
            Math.min(r.rect[2], block.rect[2]) > Math.max(r.rect[0], block.rect[0]),
        )
      ) {
        pending.push(line)
        continue
      }
      flush()
      for (const run of usable.filter((r) => belongsToLine(r, line))) {
        parts.push({
          ...block,
          rect: run.rect,
          fontSize: run.size,
          lines: [{ rect: run.rect, text: run.text, y: run.y, fontSize: run.size }],
        })
      }
    }
    flush()
    return parts
  })
  const seen = new Set<string>()
  const uniqueBlocks = blocks.filter((block) => {
    const key = JSON.stringify([
      block.rect.map((v) => Math.round(v * 1000)),
      block.lines.map((line) => line.text),
    ])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return uniqueBlocks.map((block, index) => {
    const runs = usable.filter((r) => belongsToBlock(r, block))
    const nearest = page.runs.filter(
      (r) =>
        r.rect[3] < block.rect[1] &&
        Math.min(r.rect[2], block.rect[2]) - Math.max(r.rect[0], block.rect[0]) > 0,
    )
    const belowImages = pictures.filter(
      (r) => r[3] < block.rect[1] && Math.min(r[2], block.rect[2]) > Math.max(r[0], block.rect[0]),
    )
    const bottom = Math.max(
      12,
      ...nearest.map((r) => r.rect[3] + 2),
      ...belowImages.map((r) => r[3] + 2),
    )
    const first = block.lines[0]!
    return {
      ...block,
      paragraph: index + 1,
      text: block.lines.map((line) => line.text).join('\n'),
      font: runs.sort((a, b) => b.text.length - a.text.length)[0]?.font ?? '',
      maxHeight: Math.max(block.fontSize, first.y - bottom + block.fontSize * 0.8),
    }
  })
}

export function translationPages(range: string | undefined, count: number): number[] {
  if (!range?.trim()) return Array.from({ length: count }, (_, i) => i)
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(range)) throw new Error('Invalid page range')
  const pages = new Set<number>()
  for (const item of range.split(',')) {
    const [a, b = a] = item.split('-').map(Number)
    if (!a || !b || a > b || b > count) throw new Error(`Page range must be between 1 and ${count}`)
    for (let p = a; p <= b; p++) pages.add(p - 1)
  }
  return [...pages].sort((a, b) => a - b)
}

/** Protect equation runs, URLs, identifiers and inline arithmetic from the language model. */
export function protectedTranslationText(
  text: string,
  formulaPattern?: string,
): { text: string; restore(value: string): string } {
  const saved: string[] = []
  const expressions = [
    /https?:\/\/[^\s]+/gu,
    /\b(?:[A-Za-zΑ-ω][\wΑ-ω]*(?:\^\{?[-\w]+\}?)?\s*[=<>≈≠≤≥]\s*[^,;。；\n]+)|(?:[$][^$\n]+[$])/gu,
  ]
  if (formulaPattern) expressions.unshift(new RegExp(formulaPattern, 'gu'))
  let masked = text
  for (const expression of expressions)
    masked = masked.replace(expression, (value) => {
      if (!value || /ZENKEEP/.test(value)) return value
      const token = `⟦ZENKEEP${saved.length}⟧`
      saved.push(value)
      return token
    })
  return {
    text: masked,
    restore(value) {
      let restored = value
      for (const [i, original] of saved.entries()) {
        const token = `⟦ZENKEEP${i}⟧`
        if (restored.split(token).length !== 2)
          throw new Error('AI changed a protected formula or identifier; no file was saved')
        restored = restored.replace(token, original)
      }
      if (/ZENKEEP/.test(restored)) throw new Error('AI introduced an unknown protected token')
      return restored
    },
  }
}
