import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { parseDocx } from '@genoffice/docx-engine'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import {
  replaceEmbeddedEquation,
  replaceEquationXml,
  isLegacyEquation,
} from '../src/renderer/editor/legacy-equation'
import { formulaQuestionContext } from '../src/renderer/editor/formula-context'
import { editorExtensions } from '../src/renderer/editor/extensions'

const source =
  '<w:p w:rsidR="1234"><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Before </w:t><w:object><o:OLEObject ProgID="Equation.3"/></w:object><w:t> after</w:t></w:r><w:r><w:t>(10)</w:t></w:r></w:p>'

describe('legacy equation compatibility', () => {
  it('converts to real Office math while keeping surrounding text, numbering and paragraph properties', async () => {
    const result = replaceEmbeddedEquation(source, 'x^2 + y^2')
    expect(result).not.toContain('<w:object')
    expect(result).toContain('<m:oMath xmlns:m=')
    expect(result).toContain('<w:pPr><w:jc w:val="right"/></w:pPr>')
    expect(result).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Before </w:t>')
    expect(result).toContain('<w:rPr><w:b/></w:rPr><w:t> after</w:t>')
    expect(result).toContain('<w:r><w:t>(10)</w:t></w:r>')
    const parsed = await parseDocx(await buildDocx({ bodyXml: result }))
    expect(parsed.blocks[0].originalXml).toBe(result)
    expect(JSON.stringify(parsed.blocks[0].runs)).toContain('Before ')
    expect(JSON.stringify(parsed.blocks[0].runs)).toContain('(10)')
    const editedAgain = replaceEquationXml(result, 'z = 3')
    expect(editedAgain).toContain('(10)')
    expect(editedAgain).not.toContain('<w:object')
  })

  it('rejects ambiguous multi-object paragraphs and excludes spreadsheet objects', () => {
    expect(() =>
      replaceEmbeddedEquation(source.replace('</w:r></w:p>', '<w:object/></w:r></w:p>'), 'x'),
    ).toThrow(/多个/)
    expect(
      isLegacyEquation({
        label: 'Embedded object',
        imageDataUrl: 'data:image/png;base64,AA',
        oleProgId: 'Excel.Sheet.12',
      }),
    ).toBe(false)
    expect(
      isLegacyEquation({
        label: 'Embedded object',
        imageDataUrl: 'data:image/png;base64,AA',
        oleProgId: 'Equation.3',
      }),
    ).toBe(true)
  })

  it('provides bounded context from the live document, including heading, number, before and after', () => {
    const editor = new Editor({
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docHeading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Consistency loss' }],
          },
          {
            type: 'docParagraph',
            content: [{ type: 'text', text: 'Compare teacher and student predictions.' }],
          },
          {
            type: 'docProtected',
            attrs: { label: 'Embedded object', previewText: '(10)', oleProgId: 'Equation.3' },
          },
          {
            type: 'docParagraph',
            content: [{ type: 'text', text: 'K is the number of classes.' }],
          },
        ],
      },
    })
    try {
      const pos = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize
      const context = formulaQuestionContext(editor, pos, 'paper.docx')
      expect(context).toContain('paper.docx')
      expect(context).toContain('Consistency loss')
      expect(context).toContain('(10)')
      expect(context).toContain('teacher and student')
      expect(context).toContain('K is the number')
      expect(context.length).toBeLessThan(6000)
    } finally {
      editor.destroy()
    }
  })
})
