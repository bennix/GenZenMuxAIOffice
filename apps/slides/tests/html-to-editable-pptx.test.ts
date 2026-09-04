import { describe, expect, it } from 'vitest'
import { openPptx } from '@genoffice/pptx-engine'
import { buildEditableSlidePptx, type EditableHtmlPage } from '../src/main/html-to-editable-pptx'

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
