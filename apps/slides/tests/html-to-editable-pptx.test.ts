import { describe, expect, it } from 'vitest'
import { openPptx } from '@genoffice/pptx-engine'
import {
  buildEditableSlidePptx,
  fitTextInsideDecorations,
  orderEditableHtmlNodes,
  type EditableHtmlPage,
  type EditableHtmlNode,
} from '../src/main/html-to-editable-pptx'

const RED_DOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const PAGE: EditableHtmlPage = {
  width: 1280,
  height: 720,
  background: 'F5F7FB',
  nodes: [
    { kind: 'shape', x: 72, y: 80, w: 540, h: 500, fill: 'FFFFFF', radius: 20 },
    {
      kind: 'text',
      x: 110,
      y: 120,
      w: 460,
      h: 90,
      text: 'Editable title',
      fontSize: 48,
      bold: true,
      color: '112233',
    },
    {
      kind: 'text',
      x: 110,
      y: 240,
      w: 460,
      h: 180,
      text: 'Editable body copy',
      fontSize: 24,
      color: '334455',
    },
    { kind: 'image', x: 680, y: 80, w: 520, h: 500, src: 'https://example.test/a.png' },
  ],
}

describe('HTML to editable PPTX conversion', () => {
  it('places late backgrounds and nested cards behind text and images in the saved PPTX', async () => {
    const text: EditableHtmlNode = {
      kind: 'text',
      x: 120,
      y: 120,
      w: 180,
      h: 60,
      text: 'Visible label',
    }
    const image: EditableHtmlNode = { kind: 'image', x: 120, y: 220, w: 100, h: 100, src: 'photo' }
    const card: EditableHtmlNode = { kind: 'shape', x: 80, y: 80, w: 500, h: 500, fill: 'FFFFFF' }
    const background: EditableHtmlNode = {
      kind: 'shape',
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
      fill: '112233',
    }
    const nodes = [text, image, card, background]
    expect(orderEditableHtmlNodes(nodes)).toEqual([background, card, text, image])
    expect(nodes).toEqual([text, image, card, background])
    const result = await buildEditableSlidePptx({ ...PAGE, nodes }, async () => RED_DOT)
    const opened = await openPptx(result.bytes)
    const elements = opened.deck.slides[0]!.elements
    expect(elements).toHaveLength(4)
    expect(elements[0]!.transform.offset.cx).toBeGreaterThan(elements[1]!.transform.offset.cx)
    expect(
      elements[2]!.type === 'text' || elements[2]!.type === 'shape'
        ? Boolean(elements[2]!.text)
        : false,
    ).toBe(true)
    expect(elements[3]!.type).toBe('picture')
  })

  it('respects explicit layers, image overlays and unrelated object order', () => {
    const photo: EditableHtmlNode = {
      kind: 'image',
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
      src: 'photo',
      zIndex: -2,
    }
    const overlay: EditableHtmlNode = {
      kind: 'shape',
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
      fill: '000000',
      fillTransparency: 50,
      zIndex: -1,
    }
    const label: EditableHtmlNode = {
      kind: 'text',
      x: 100,
      y: 100,
      w: 400,
      h: 80,
      text: 'Title',
      zIndex: 1,
    }
    expect(orderEditableHtmlNodes([label, overlay, photo])).toEqual([photo, overlay, label])
    const outline: EditableHtmlNode = {
      kind: 'shape',
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
      lineColor: '000000',
    }
    expect(
      orderEditableHtmlNodes([label, outline].map((n) => ({ ...n, zIndex: undefined }))),
    ).toEqual([
      { ...label, zIndex: undefined },
      { ...outline, zIndex: undefined },
    ])
    expect(
      orderEditableHtmlNodes([
        { ...photo, zIndex: 0 },
        { ...overlay, zIndex: 0 },
      ]),
    ).toEqual([
      { ...photo, zIndex: 0 },
      { ...overlay, zIndex: 0 },
    ])
  })

  it('writes text, shapes, and photos as separate PowerPoint objects', async () => {
    const result = await buildEditableSlidePptx(PAGE, async () => RED_DOT)
    const opened = await openPptx(result.bytes)
    const elements = opened.deck.slides[0]!.elements
    const textObjects = elements.filter((element) =>
      element.type === 'text' || element.type === 'shape' ? Boolean(element.text) : false,
    )
    const pictures = elements.filter((element) => element.type === 'picture')

    expect(textObjects.length).toBe(2)
    expect(
      textObjects.every((element) =>
        element.type === 'text' || element.type === 'shape'
          ? element.text?.autofit !== 'shrink'
          : true,
      ),
    ).toBe(true)
    expect(pictures.length).toBe(1)
    expect(elements.length).toBeGreaterThanOrEqual(4)
    expect(
      pictures.some(
        (picture) =>
          picture.transform.offset.cx >= opened.deck.size.cx * 0.95 &&
          picture.transform.offset.cy >= opened.deck.size.cy * 0.95,
      ),
    ).toBe(false)
  })

  it('pulls a short wrapped tail back onto the previous line and keeps it inside the card', () => {
    const card: EditableHtmlNode = { kind: 'shape', x: 40, y: 40, w: 280, h: 220, fill: 'FFFFFF' }
    const line: EditableHtmlNode = {
      kind: 'text',
      x: 56,
      y: 120,
      w: 240,
      h: 72,
      text: '提出"每换一人改代码"',
      fontSize: 28,
      lineHeight: 36,
      widenPx: 80,
      unwrapLines: 1,
    }
    const next: EditableHtmlNode = {
      kind: 'text',
      x: 56,
      y: 192,
      w: 200,
      h: 36,
      text: '是否方便？',
      fontSize: 28,
    }
    const bar: EditableHtmlNode = { kind: 'shape', x: 20, y: 248, w: 360, h: 36, fill: '1E293B' }
    const before = [card, line, next, bar].map((node) => ({ ...node }))
    const [fittedCard, fittedLine, fittedNext, fittedBar] = fitTextInsideDecorations(
      [card, line, next, bar],
      1280,
      720,
    )

    expect(line.w).toBe(before[1]!.w)
    expect(fittedLine!.w).toBe(320)
    expect(fittedLine!.h).toBe(36)
    expect(fittedNext!.y).toBe(156)
    expect(fittedCard!.w).toBeGreaterThan(card.w)
    expect(fittedCard!.h).toBeLessThan(card.h)
    expect(fittedCard!.y + fittedCard!.h).toBeLessThanOrEqual(fittedBar!.y)
    expect(fittedLine!.x + fittedLine!.w).toBeLessThanOrEqual(fittedCard!.x + fittedCard!.w)
  })

  it('grows a banner to cover text that hangs below it and shifts the block underneath', () => {
    const bar: EditableHtmlNode = { kind: 'shape', x: 0, y: 80, w: 1200, h: 48, fill: 'F5E6C8' }
    const tip: EditableHtmlNode = {
      kind: 'text',
      x: 40,
      y: 86,
      w: 1100,
      h: 80,
      text: '提示：先手算，再用 Python 核对',
      fontSize: 24,
    }
    const code: EditableHtmlNode = { kind: 'shape', x: 40, y: 140, w: 1100, h: 200, fill: '1E293B' }
    const codeLine: EditableHtmlNode = {
      kind: 'text',
      x: 56,
      y: 160,
      w: 1000,
      h: 32,
      text: 'print(minutes)',
      fontSize: 20,
    }
    const [fittedBar, fittedTip, fittedCode, fittedCodeLine] = fitTextInsideDecorations(
      [bar, tip, code, codeLine],
      1280,
      720,
    )

    expect(fittedTip!.y + fittedTip!.h).toBeLessThanOrEqual(fittedBar!.y + fittedBar!.h)
    expect(fittedBar!.h).toBeGreaterThan(bar.h)
    expect(fittedCode!.y).toBeGreaterThan(code.y)
    expect(fittedCodeLine!.y - fittedCode!.y).toBe(codeLine.y - code.y)
  })

  it('fits hanging text back into a banner when the slide cannot move downward', () => {
    const bar: EditableHtmlNode = { kind: 'shape', x: 0, y: 80, w: 400, h: 40, fill: 'F5E6C8' }
    const tip: EditableHtmlNode = {
      kind: 'text',
      x: 16,
      y: 84,
      w: 360,
      h: 72,
      text: '提示：先手算，再用 Python 核对',
      fontSize: 24,
    }
    const below: EditableHtmlNode = { kind: 'shape', x: 0, y: 130, w: 400, h: 80, fill: '111111' }
    const [fittedBar, fittedTip, fittedBelow] = fitTextInsideDecorations(
      [bar, tip, below],
      400,
      200,
    )

    expect(fittedTip!.y + fittedTip!.h).toBeLessThanOrEqual(fittedBar!.y + fittedBar!.h)
    expect(fittedTip!.fontSize).toBeLessThan(24)
    expect(fittedBelow!.y).toBe(below.y)
  })

  it('shrinks the font instead of widening a tail into the next card', () => {
    const card: EditableHtmlNode = { kind: 'shape', x: 40, y: 40, w: 260, h: 160, fill: 'FFFFFF' }
    const line: EditableHtmlNode = {
      kind: 'text',
      x: 56,
      y: 80,
      w: 220,
      h: 64,
      text: '提出"每换一人改代码"',
      fontSize: 28,
      lineHeight: 32,
      widenPx: 90,
      unwrapLines: 1,
    }
    const neighbor: EditableHtmlNode = { kind: 'shape', x: 312, y: 40, w: 260, h: 160, fill: 'FFFFFF' }
    const [, fittedLine, fittedNeighbor] = fitTextInsideDecorations(
      [card, line, neighbor],
      1280,
      720,
    )

    expect(fittedLine!.fontSize).toBeLessThan(28)
    expect(fittedLine!.x + fittedLine!.w).toBeLessThanOrEqual(fittedNeighbor!.x - 8)
    expect(fittedNeighbor!.x).toBe(neighbor.x)
  })

  it('keeps the editable content when an optional image cannot be downloaded', async () => {
    const result = await buildEditableSlidePptx(PAGE, async () => null)
    const opened = await openPptx(result.bytes)
    expect(result.imageFailures).toEqual(['https://example.test/a.png'])
    expect(
      opened.deck.slides[0]!.elements.filter(
        (element) => (element.type === 'text' || element.type === 'shape') && element.text,
      ),
    ).toHaveLength(2)
  })
})
