import katex from 'katex'
import 'katex/contrib/mhchem'
import 'katex/dist/katex.min.css'

/** Remove redundant, unescaped `$` delimiters from TeX that is already inside math mode. */
export function stripNestedMathDelimiters(tex: string): string {
  let output = ''
  for (let index = 0; index < tex.length; index += 1) {
    const character = tex[index] ?? ''
    if (character !== '$') {
      output += character
      continue
    }
    let backslashes = 0
    for (let cursor = index - 1; cursor >= 0 && tex[cursor] === '\\'; cursor -= 1) {
      backslashes += 1
    }
    if (backslashes % 2 === 1) output += character
  }
  return output
}

/**
 * The single LaTeX renderer used by AI replies and editable Markdown nodes.
 * Keeping normalization and KaTeX options here prevents the same expression
 * from looking different after it is sent from chat into a Markdown file.
 */
export function renderLatexToHtml(
  tex: string,
  displayMode: boolean,
  options: { throwOnError?: boolean } = {},
): string {
  const normalized = stripNestedMathDelimiters(tex).replace(/\\_/g, '_')
  return katex.renderToString(normalized, {
    displayMode,
    throwOnError: options.throwOnError ?? false,
    strict: 'ignore',
    trust: false,
    output: 'htmlAndMathml',
  })
}
