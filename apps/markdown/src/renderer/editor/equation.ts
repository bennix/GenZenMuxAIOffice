import { Node, mergeAttributes, type MarkdownToken } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { latexToOmml, ommlToMathML } from '@genoffice/docx-engine'

function mathml(latex: string): string {
  try {
    const omml = latexToOmml(latex)
    return ommlToMathML(`<m:oMath>${omml}</m:oMath>`)
  } catch {
    return ''
  }
}

function equationDom(node: { attrs: Record<string, unknown> }, display: boolean): DOMOutputSpec {
  const latex = String(node.attrs.latex ?? '')
  return [
    display ? 'div' : 'span',
    mergeAttributes({
      class: display ? 'md-equation md-equation-block' : 'md-equation md-equation-inline',
      'data-latex': latex,
      title: latex,
    }),
    latex,
  ]
}

function dispatchEdit(
  dom: HTMLElement,
  getPos: (() => number | undefined) | boolean,
  latex: string,
  kind: 'inline' | 'block',
) {
  dom.addEventListener('dblclick', () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos !== 'number') return
    window.dispatchEvent(
      new CustomEvent('markdown:edit-equation', { detail: { pos, latex, kind } }),
    )
  })
  return { dom }
}

export const InlineEquation = Node.create({
  name: 'inlineEquation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ latex: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-latex]' }],
  renderHTML: ({ node }) => equationDom(node, false),
  addNodeView:
    () =>
    ({ node, getPos, HTMLAttributes }) => {
      const host = document.createElement('span')
      host.className = 'md-equation md-equation-inline'
      host.title = String(node.attrs.latex)
      host.innerHTML = mathml(String(node.attrs.latex)) || String(node.attrs.latex)
      Object.entries(HTMLAttributes).forEach(([key, value]) =>
        host.setAttribute(key, String(value)),
      )
      return dispatchEdit(host, getPos, String(node.attrs.latex), 'inline')
    },
  parseMarkdown: (token, helpers) =>
    helpers.createNode('inlineEquation', { latex: token.text ?? '' }),
  markdownTokenizer: {
    name: 'inlineEquation',
    level: 'inline',
    start: (src) => src.search(/(?<!\\)\$(?!\$)/),
    tokenize(src) {
      const match = /^\$(?!\$)([^\n$]+?)(?<!\\)\$/.exec(src)
      if (!match || !match[1].trim()) return undefined
      return { type: 'inlineEquation', raw: match[0], text: match[1] } as MarkdownToken
    },
  },
  renderMarkdown: (node) => `$${String(node.attrs?.latex ?? '')}$`,
})

export const BlockEquation = Node.create({
  name: 'blockEquation',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  addAttributes: () => ({ latex: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-latex]' }],
  renderHTML: ({ node }) => equationDom(node, true),
  addNodeView:
    () =>
    ({ node, getPos, HTMLAttributes }) => {
      const host = document.createElement('div')
      host.className = 'md-equation md-equation-block'
      host.title = String(node.attrs.latex)
      host.innerHTML = mathml(String(node.attrs.latex)) || String(node.attrs.latex)
      Object.entries(HTMLAttributes).forEach(([key, value]) =>
        host.setAttribute(key, String(value)),
      )
      return dispatchEdit(host, getPos, String(node.attrs.latex), 'block')
    },
  parseMarkdown: (token, helpers) =>
    helpers.createNode('blockEquation', { latex: token.text ?? '' }),
  markdownTokenizer: {
    name: 'blockEquation',
    level: 'block',
    start: (src) => src.search(/^\s*\$\$/m),
    tokenize(src) {
      const match = /^\s*\$\$\s*\n?([\s\S]*?)\n?\s*\$\$(?:\n|$)/.exec(src)
      if (!match || !match[1].trim()) return undefined
      return { type: 'blockEquation', raw: match[0], text: match[1].trim() } as MarkdownToken
    },
  },
  renderMarkdown: (node) => `$$\n${String(node.attrs?.latex ?? '')}\n$$`,
})
