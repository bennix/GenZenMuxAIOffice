import { describe, expect, it } from 'vitest'
import { extractSlideHtml } from '../src/renderer/ai/slide-html'

describe('extractSlideHtml', () => {
  it('accepts a complete document inside an HTML fence', () => {
    expect(extractSlideHtml('```html\n<!doctype html><html><body>Slide</body></html>\n```')).toBe(
      '<!doctype html><html><body>Slide</body></html>',
    )
  })

  it('ignores model chatter around a complete document', () => {
    expect(extractSlideHtml('Here it is:\n<html><body>Slide</body></html>\nDone')).toBe(
      '<html><body>Slide</body></html>',
    )
  })

  it('rejects incomplete or non-HTML output', () => {
    expect(extractSlideHtml('<html><body>unfinished')).toBeNull()
    expect(extractSlideHtml('not html')).toBeNull()
  })
})
