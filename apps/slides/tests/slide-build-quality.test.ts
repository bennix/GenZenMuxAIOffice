import { describe, expect, it } from 'vitest'
import {
  checkEditableSlide,
  fitTextInsideDecorations,
  type EditableHtmlPage,
} from '../src/main/html-to-editable-pptx'

describe('slide build quality gate', () => {
  it('reports tiny body copy and text below the canvas instead of silently clipping', () => {
    const page: EditableHtmlPage = {
      width: 1280,
      height: 720,
      nodes: [
        {
          kind: 'text',
          text: 'Body',
          textRole: 'body',
          x: 40,
          y: 680,
          w: 500,
          h: 80,
          fontSize: 14,
        },
      ],
    }
    expect(checkEditableSlide(page).map((issue) => issue.code)).toEqual([
      'small-text',
      'canvas-overflow',
    ])
  })
  it('does not shrink dense card text into illegibility to conceal bottom overflow', () => {
    const page: EditableHtmlPage = {
      width: 1280,
      height: 720,
      nodes: [
        { kind: 'shape', x: 40, y: 570, w: 500, h: 60, fill: 'FFFFFF' },
        {
          kind: 'text',
          text: 'Readable content',
          textRole: 'body',
          x: 56,
          y: 580,
          w: 460,
          h: 120,
          fontSize: 28,
        },
        { kind: 'shape', x: 40, y: 640, w: 500, h: 76, fill: '222222' },
      ],
    }
    const fitted = fitTextInsideDecorations(page.nodes, page.width, page.height)
    expect(fitted[1]!.fontSize).toBe(28)
    expect(checkEditableSlide(page).some((issue) => issue.code === 'container-overflow')).toBe(true)
  })
  it('allows readable body text and explicitly identified smaller footers', () => {
    expect(
      checkEditableSlide({
        width: 1280,
        height: 720,
        nodes: [
          {
            kind: 'text',
            text: 'Body',
            textRole: 'body',
            x: 50,
            y: 100,
            w: 500,
            h: 120,
            fontSize: 28,
          },
          {
            kind: 'text',
            text: 'Source',
            textRole: 'footer',
            x: 50,
            y: 670,
            w: 500,
            h: 20,
            fontSize: 16,
          },
        ],
      }),
    ).toEqual([])
  })
})
