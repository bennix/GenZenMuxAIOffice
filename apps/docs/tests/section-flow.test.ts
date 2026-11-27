import { describe, expect, it } from 'vitest'
import type { SectionInfo } from '@genoffice/docx-engine'
import { hasMixedSectionFlow, measureSectionWidths } from '../src/renderer/section-flow'

const section = (columns: number, first: number, last: number): SectionInfo => ({
  settings: {
    orientation: 'portrait',
    pageBorder: false,
    pageWidth: 12000,
    pageHeight: 16000,
    marginLeft: 1000,
    marginRight: 1000,
    marginTop: 1000,
    marginBottom: 1000,
    headerDist: 0,
    footerDist: 0,
    columns,
    colSpace: 400,
  },
  titlePg: false,
  headerRefs: {},
  footerRefs: {},
  startType: 'continuous',
  firstBlockIndex: first,
  lastBlockIndex: last,
  sectPrXml: '',
})

describe('mixed section text flow', () => {
  it('detects the full-width preface followed by two-column body', () => {
    expect(hasMixedSectionFlow([section(1, 0, 9), section(2, 10, 30)])).toBe(true)
    expect(hasMixedSectionFlow([section(2, 0, 9), section(2, 10, 30)])).toBe(false)
    expect(hasMixedSectionFlow([])).toBe(false)
  })

  it('clones each section at its own column width and restores the editable DOM', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<p data-idx="0" style="margin:0 10px">Title</p><p data-idx="10">Body</p><p>New body paragraph</p>'
    document.body.append(root)
    const original = root.innerHTML
    const restore = measureSectionWidths(root, [section(1, 0, 9), section(2, 10, 30)])
    const [title, body, added] = Array.from(root.children) as HTMLElement[]
    expect(parseFloat(title.style.width)).toBeCloseTo(10000 / 15 - 20)
    expect(parseFloat(body.style.width)).toBeCloseTo(4800 / 15)
    expect(added.style.width).toBe(body.style.width)
    expect(root.cloneNode(true).textContent).toBe('TitleBodyNew body paragraph')
    restore()
    expect(root.innerHTML).toBe(original)
    root.remove()
  })
})
