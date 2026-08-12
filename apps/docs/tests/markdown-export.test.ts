import { describe, expect, it } from 'vitest'
import { docJsonToMarkdown } from '../src/renderer/export/markdownExport'

describe('Word to Markdown export', () => {
  it('keeps structure, tables, and editable LaTeX', () => {
    const markdown = docJsonToMarkdown({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'docInlineMath', attrs: { latex: 'E=mc^2' } },
          ],
        },
        {
          type: 'docProtected',
          attrs: { formulaDisplay: { latex: '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}' } },
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(markdown).toContain('## Title')
    expect(markdown).toContain('**bold** and $E=mc^2$')
    expect(markdown).toContain('$$\n\\begin{aligned}')
    expect(markdown).toContain('| A |')
  })
})
