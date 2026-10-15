import { expect, it } from 'vitest'
import { nativeParagraphs } from '../src/main/native-pdf-layout'
import type { NativeTextRun } from '../src/main/text-edit'

const run = (
  text: string,
  x: number,
  y: number,
  width: number,
  font = 'NimbusRoman-Regular',
): NativeTextRun => ({
  text,
  x,
  y,
  rect: [x, y - 2, x + width, y + 8],
  size: 10,
  font,
  rotated: false,
})
it('keeps ordinary prose together while isolating only lines beside a formula', () => {
  const first = 'This ordinary line has no formula and fills the column width.'
  const second = 'This second line also fills the column with ordinary prose.'
  const runs = [
    run(first, 50, 700, 270),
    run(second, 50, 686, 270),
    run('A formula prefix', 50, 672, 115),
    run('x', 180, 672, 6, 'CMMI10'),
    run('and suffix', 200, 672, 120),
  ]
  const paragraphs = nativeParagraphs({ width: 595, height: 842, runs }, (r) => r.font === 'CMMI10')
  expect(paragraphs.some((p) => p.text.includes(`${first}\n${second}`))).toBe(true)
  expect(
    paragraphs
      .map((p) => p.text)
      .join('\n')
      .split(first),
  ).toHaveLength(2)
  expect(paragraphs.every((p) => p.font !== 'CMMI10')).toBe(true)
})

it('excludes text inside figures and reserves the picture below a paragraph', () => {
  const paragraphs = nativeParagraphs({
    width: 595,
    height: 842,
    imageRects: [[40, 400, 330, 600]],
    runs: [
      run('Body paragraph above a chart', 50, 630, 270),
      run('Chart axis label', 60, 500, 100),
    ],
  })
  expect(paragraphs).toHaveLength(1)
  expect(paragraphs[0]!.text).toContain('Body paragraph')
  expect(paragraphs[0]!.maxHeight).toBeLessThan(40)
})

it('does not take a neighboring long run into a narrow stacked block a second time', () => {
  const neighbor = 'is a conjunction of targeted predicates. Con-'
  const paragraphs = nativeParagraphs(
    {
      width: 595,
      height: 842,
      runs: [
        run('AST', 382, 388, 19),
        run('where', 322, 368, 24),
        run(neighbor, 376, 368, 187),
        run('constructs absent from', 312, 356, 85),
        run('x', 350, 368, 10, 'CMMI10'),
      ],
    },
    (r) => r.font === 'CMMI10',
  )
  expect(paragraphs.flatMap((p) => p.lines).filter((line) => line.text === neighbor)).toHaveLength(
    1,
  )
})
