/// <reference lib="dom" />
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { fileURLToPath } from 'node:url'
import { repairGeneratedNamespaces } from '../src/save-namespaces'
import { openPptx, savePptx, setSlideBackground, addElement, commitSaved } from '../src/index'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.querySelector('parsererror')?.textContent).toBeUndefined()
  return doc
}

it('preserves valid local declarations and repairs an unbound presentation relationship', () => {
  const valid = `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="${R}"/></p:sldIdLst></p:presentation>`
  expect(repairGeneratedNamespaces(valid)).toBe(valid)
  const invalid = valid.replace('</p:sldIdLst>', '<p:sldId id="257" r:id="rId2"/></p:sldIdLst>')
  const fixed = repairGeneratedNamespaces(invalid)
  expect(parseXml(fixed).documentElement.lookupNamespaceURI('r')).toBe(R)
})

describe('saving imported slides with descendant namespace declarations', () => {
  it('keeps generated backgrounds and text namespace-valid through repeated saves', async () => {
    const zip = await JSZip.loadAsync(
      readFileSync(
        fileURLToPath(import.meta.url).replace(/[^/]+$/, 'fixtures/01_standard_business.pptx'),
      ),
    )
    const path = 'ppt/slides/slide1.xml'
    let xml = (await zip.file(path)!.async('string')).replace(/ xmlns:(a|r)="[^"]*"/g, '')
    // Valid source XML like Office exports: prefixes scoped to descendants.
    xml = xml.replace(/<a:([\w]+)(?=[\s/>])/g, `<a:$1 xmlns:a="${A}"`)
    xml = xml.replace(/<([\w:]+)([^<>]*\sr:\w+=[^<>]*)>/g, `<$1 xmlns:r="${R}"$2>`)
    parseXml(xml)
    zip.file(path, xml)
    const opened = await openPptx(await zip.generateAsync({ type: 'uint8array' }))
    for (let cycle = 0; cycle < 2; cycle++) {
      const slide = opened.deck.slides[0]!
      setSlideBackground(slide, '#F4F7FB')
      addElement(slide, {
        kind: 'textbox',
        offset: { x: 914400, y: 914400, cx: 6096000, cy: 914400 },
        paragraphs: [{ runs: [{ text: `Visible content ${cycle}`, fontSize: 28 }] }],
      })
      const saved = await JSZip.loadAsync(await savePptx(opened))
      const doc = parseXml(await saved.file(path)!.async('string'))
      expect(doc.documentElement.lookupNamespaceURI('a')).toBe(A)
      expect(doc.getElementsByTagNameNS(A, 't').length).toBeGreaterThan(0)
      expect(doc.documentElement.textContent).toContain(`Visible content ${cycle}`)
      commitSaved(opened)
    }
  })
})
