/**
 * Normalize unmistakable Markdown/LaTeX mistakes found in AI output and in
 * Markdown files previously saved from that output. The result is shared by
 * read-only AI bubbles and editable Markdown ingestion; code remains literal.
 */
export function normalizeAiMarkdownText(text: string): string {
  const lines = text.split('\n')
  let codeFence: string | null = null
  let displayMath = false
  const normalized = lines
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)
      if (codeFence) {
        const closingFence = fence?.[1]
        if (
          closingFence &&
          closingFence[0] === codeFence[0] &&
          closingFence.length >= codeFence.length
        ) {
          codeFence = null
        }
        return line
      }
      const openingFence = fence?.[1]
      if (openingFence) {
        codeFence = openingFence
        return line
      }

      const displayDelimiters = (line.match(/(?<!\\)\$\$/g) ?? []).length
      if (displayMath || displayDelimiters % 2 === 1) {
        const normalized = normalizeLegacyLatex(line)
        if (displayDelimiters % 2 === 1) displayMath = !displayMath
        return normalized
      }

      line = transformOutsideInlineCode(line, (plain) =>
        plain
          .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '')
          .replace(/\\\*\\\*/g, '**')
          .replace(/\\_\\_/g, '__')
          // Whitespace immediately inside an emphasis delimiter makes the
          // delimiter literal in CommonMark. AI output occasionally emits
          // `** title**`; trimming that impossible formatting boundary is
          // safe because it could never represent working bold markup.
          .replace(/(?<![\p{L}\p{N}])\*\*[ \t]+([^*\n]+?)\*\*/gu, '**$1**')
          .replace(/(?<=[\p{L}\p{N}])\*\*[ \t]+([^*\n]+?)\*\*/gu, ' **$1**')
          .replace(/(?<![\p{L}\p{N}])__[ \t]+([^_\n]+?)__/gu, '__$1__')
          .replace(/(?<=[\p{L}\p{N}])__[ \t]+([^_\n]+?)__/gu, ' __$1__')
          .replace(/(?<![\p{L}\p{N}])\*\*([^*\n]*?\S)[ \t]+\*\*/gu, '**$1** ')
          .replace(/(?<![\p{L}\p{N}])__([^_\n]*?\S)[ \t]+__/gu, '__$1__ ')
          .replace(/(?<![\p{L}\p{N}$])(\*\*)([^*\n]*?\S)\1(?=[\p{L}\p{N}])/gu, '$1$2$1 ')
          .replace(/(?<![\p{L}\p{N}$])(__)([^_\n]*?\S)\1(?=[\p{L}\p{N}])/gu, '$1$2$1 '),
      )

      return transformOutsideCodeAndMath(
        line,
        (plain) => {
          let normalized = plain
            .replace(/\\\$\\\$/g, '$$$$')
            .replace(/\\\((.+?)\\\)/g, (_all, latex: string) => {
              return `$${normalizeLegacyLatex(latex.trim())}$`
            })
          normalized = normalizeParenthesizedLatex(normalized)
          return normalized
        },
        normalizeLegacyLatex,
      )
    })
    .join('\n')
  return separateStandaloneDisplayMathBlocks(normalized)
}

function transformOutsideInlineCode(line: string, transform: (plain: string) => string): string {
  let out = ''
  let cursor = 0
  while (cursor < line.length) {
    const open = line.indexOf('`', cursor)
    if (open < 0) {
      out += transform(line.slice(cursor))
      break
    }
    out += transform(line.slice(cursor, open))
    let width = 1
    while (line[open + width] === '`') width++
    const delimiter = '`'.repeat(width)
    const close = line.indexOf(delimiter, open + width)
    if (close < 0) {
      out += line.slice(open)
      break
    }
    out += line.slice(open, close + width)
    cursor = close + width
  }
  return out
}

/**
 * A custom `$$` block cannot interrupt a lazy CommonMark list paragraph.
 * Blank lines make standalone display delimiters unambiguous to both the chat
 * block parser and TipTap, while already-valid spacing stays unchanged.
 */
function separateStandaloneDisplayMathBlocks(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let codeFence: string | null = null
  let displayMath = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    const fenceMarker = fence?.[1]
    if (codeFence) {
      out.push(line)
      if (
        fenceMarker &&
        fenceMarker[0] === codeFence[0] &&
        fenceMarker.length >= codeFence.length
      ) {
        codeFence = null
      }
      continue
    }
    if (fenceMarker) {
      codeFence = fenceMarker
      out.push(line)
      continue
    }
    if (line.trim() !== '$$') {
      out.push(line)
      continue
    }
    if (!displayMath && out.length > 0 && out[out.length - 1]!.trim() !== '') out.push('')
    out.push(line)
    displayMath = !displayMath
    const next = lines[index + 1]
    if (!displayMath && next !== undefined && next.trim() !== '') out.push('')
  }
  return out.join('\n')
}

/** Recognize balanced AI-written `(LaTeX)` spans, including nested commands. */
function normalizeParenthesizedLatex(text: string): string {
  let out = ''
  let cursor = 0
  while (cursor < text.length) {
    const open = text.indexOf('(', cursor)
    if (open < 0) {
      out += text.slice(cursor)
      break
    }
    out += text.slice(cursor, open)
    let depth = 1
    let close = open + 1
    for (; close < text.length && depth > 0; close++) {
      if (text[close] === '(') depth++
      else if (text[close] === ')') depth--
    }
    if (depth !== 0) {
      out += text.slice(open)
      break
    }
    const expression = text.slice(open, close)
    const latex = expression.slice(1, -1)
    const hasLatexCommand = /\\[A-Za-z]+/.test(latex)
    const hasMathScript = /(?:\\?_[A-Za-z0-9]|\\?_\{|\^[A-Za-z0-9]|\^\{)/.test(latex)
    out += hasLatexCommand || hasMathScript ? `$${normalizeLegacyLatex(latex.trim())}$` : expression
    cursor = close
  }
  return out
}

function transformOutsideCodeAndMath(
  line: string,
  transformPlain: (plain: string) => string,
  transformMath: (math: string) => string,
): string {
  let out = ''
  let cursor = 0
  while (cursor < line.length) {
    const codeOpen = line.indexOf('`', cursor)
    const mathOpen = line.indexOf('$', cursor)
    const open = codeOpen < 0 ? mathOpen : mathOpen < 0 ? codeOpen : Math.min(codeOpen, mathOpen)
    if (open < 0) {
      out += transformPlain(line.slice(cursor))
      break
    }
    out += transformPlain(line.slice(cursor, open))
    const marker = line[open]!
    let width = 1
    while (line[open + width] === marker) width++
    const delimiter = marker.repeat(width)
    const close = line.indexOf(delimiter, open + width)
    if (close < 0) {
      out += line.slice(open)
      break
    }
    const content = line.slice(open + width, close)
    out +=
      marker === '$'
        ? `${delimiter}${transformMath(content)}${delimiter}`
        : line.slice(open, close + width)
    cursor = close + width
  }
  return out
}

function normalizeLegacyLatex(latex: string): string {
  // A single `\_` can intentionally mean a literal underscore. Only remove
  // those escapes when the same expression has the unmistakable doubled
  // command signature produced by old AI prompts (`\\in`, `\\theta`, ...).
  const hasDoubledCommand = /\\\\(?=[A-Za-z{}_^])/.test(latex)
  const collapsed = latex.replace(/\\\\(?=[A-Za-z{}_^])/g, '\\')
  return hasDoubledCommand ? collapsed.replace(/\\_/g, '_') : collapsed
}
