/**
 * Round-trip envelope for a .md file: the TipTap editor only ever sees the
 * markdown body; the YAML frontmatter block, EOL style and EOF-newline state
 * are captured on load and re-applied verbatim on save, so a file written by
 * another tool survives an open→save cycle without envelope churn.
 */
export interface DocEnvelope {
  /** raw frontmatter block including both fences and any blank lines after it; '' when absent */
  frontmatter: string
  /** markdown body, \n line endings */
  body: string
  eol: '\n' | '\r\n'
  /** whether the original file ended with a newline (new documents: true) */
  trailingNewline: boolean
  /** the original file started with a UTF-8 BOM (Windows Notepad) — re-emitted on save */
  bom: boolean
}

const FENCE = '---'

export function parseDocText(raw: string): DocEnvelope {
  const bom = raw.startsWith('\uFEFF')
  if (bom) raw = raw.slice(1)
  const eol: DocEnvelope['eol'] = raw.includes('\r\n') ? '\r\n' : '\n'
  const text = raw.replace(/\r\n/g, '\n')
  const trailingNewline = text === '' || text.endsWith('\n')

  let frontmatter = ''
  let body = text
  if (text.startsWith(`${FENCE}\n`)) {
    let searchFrom = FENCE.length
    for (;;) {
      const close = text.indexOf(`\n${FENCE}`, searchFrom)
      if (close < 0) break
      const closeEnd = close + 1 + FENCE.length
      // the closing fence must be a whole line: EOF or followed by a newline
      if (closeEnd === text.length || text[closeEnd] === '\n') {
        let end = closeEnd
        while (text[end] === '\n') end++
        frontmatter = text.slice(0, end)
        body = text.slice(end)
        break
      }
      searchFrom = close + 1
    }
  }
  return { frontmatter, body, eol, trailingNewline, bom }
}

/** Inner YAML text of a raw frontmatter block (fences and trailing blank lines stripped) */
export function frontmatterInner(raw: string): string {
  if (!raw.startsWith(`${FENCE}\n`)) return ''
  const inner = raw.slice(FENCE.length + 1).replace(/\n+$/, '')
  return inner.endsWith(`\n${FENCE}`) ? inner.slice(0, -(FENCE.length + 1)) : ''
}

/** Rebuild a raw frontmatter block from edited inner YAML; blank input removes the block */
export function buildFrontmatterRaw(inner: string): string {
  const trimmed = inner.replace(/^\n+|\n+$/g, '')
  return trimmed === '' ? '' : `${FENCE}\n${trimmed}\n${FENCE}\n\n`
}

/**
 * One-way migration for legacy documents: earlier versions serialized callout
 * and toggle blocks as Pandoc-style fenced divs (`:::callout {type="…"}` /
 * `:::toggle {summary="…"}` / `:::`). Those extensions are gone — without this
 * strip the fence lines would show up as literal `:::` text in the editor.
 * The body content is kept; a toggle summary degrades to a bold paragraph.
 */
export function stripLegacyFencedDivs(body: string): string {
  const lines = body.split('\n')
  const out: string[] = []
  let codeFence: string | null = null
  let openDivs = 0
  for (const line of lines) {
    const fence = /^(`{3,}|~{3,})/.exec(line.trimStart())
    if (codeFence) {
      out.push(line)
      if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length) {
        codeFence = null
      }
      continue
    }
    if (fence) {
      codeFence = fence[1]
      out.push(line)
      continue
    }
    // the attribute block is matched greedily to the last `}` on the line:
    // the legacy serializer escaped only quotes, so a summary containing `}`
    // (e.g. {summary="a } b"}) would not match a [^}]* pattern
    const open = /^:::(callout|toggle)\s*(\{.*\})?\s*$/.exec(line)
    if (open) {
      openDivs++
      const summary = open[2] ? /summary="((?:[^"\\]|\\.)*)"/.exec(open[2]) : null
      if (summary?.[1]) out.push(`**${summary[1].replace(/\\"/g, '"')}**`, '')
      continue
    }
    if (openDivs > 0 && /^:::\s*$/.test(line)) {
      openDivs--
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Repair Markdown produced by older AI prompts that told the model math was
 * unsupported. Those prompts made the model escape formatting markers and
 * double LaTeX backslashes, so the editor correctly displayed the source
 * characters instead of formatting them. Keep fenced code byte-for-byte and
 * only migrate documents with an unmistakable over-escaping signature.
 */
export function repairOverescapedMarkdown(body: string): string {
  body = repairEscapedWhitespaceEntities(body)
  body = normalizeAlternateMathDelimiters(body)
  const hasEscapedFormatting = /\\\*\\\*[^\n]+?\\\*\\\*/.test(body)
  const hasDoubledLatex = /\${1,2}[\s\S]*?\\\\(?:[A-Za-z]+|[{}_^])[\s\S]*?\${1,2}/.test(body)
  if (!hasEscapedFormatting && !hasDoubledLatex) return delimitBareLatex(body)

  const lines = body.split('\n')
  let codeFence: string | null = null
  let displayMath = false
  const repaired = lines
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)
      if (codeFence) {
        if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length) {
          codeFence = null
        }
        return line
      }
      if (fence) {
        codeFence = fence[1]
        return line
      }

      let repaired = line
        // A closing italic `*` followed by an escaped bold opener `\*` was
        // emitted as `*\*...\*\*`. Separate the adjacent marks first so the
        // generic escaped-bold migration cannot pair the wrong delimiters.
        .replace(/(?<!\\)\*\\\*([^\n]+?)\\\*\\\*/g, '* **$1**')
        .replace(/\\\*\\\*([^\n]+?)\\\*\\\*/g, '**$1**')
        .replace(/^(\s*)\\\*\s+/, '$1* ')

      // Only touch delimited math. Outside math, Markdown backslash escapes
      // may be intentional and must remain unchanged.
      repaired = repaired.replace(/(\${1,2})([^$\n]+?)\1/g, (_all, delimiter, latex) => {
        const normalized = normalizeLegacyLatex(String(latex))
        return `${delimiter}${normalized}${delimiter}`
      })
      const displayDelimiters = (repaired.match(/(?<!\\)\$\$/g) ?? []).length
      if (displayMath || displayDelimiters % 2 === 1) {
        repaired = normalizeLegacyLatex(repaired)
        if (displayDelimiters % 2 === 1) displayMath = !displayMath
      }
      return repaired
    })
    .join('\n')
  return delimitBareLatex(repaired)
}

/**
 * Convert the standard LaTeX `\(...\)` and `\[...\]` delimiters to the
 * dollar delimiters understood by the Tiptap Markdown equation extensions.
 * Markdown otherwise treats the leading backslash as punctuation escaping,
 * leaving visible `(R_...)` or standalone `[` / `]` text in the document.
 * Explicit inline and fenced code stays byte-for-byte unchanged.
 */
export function normalizeAlternateMathDelimiters(body: string): string {
  const lines = body.split('\n')
  let codeFence: string | null = null
  let displayMath = false
  return lines
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)
      if (codeFence) {
        if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length) {
          codeFence = null
        }
        return line
      }
      if (fence) {
        codeFence = fence[1]
        return line
      }

      if (!displayMath) {
        const oneLineDisplay = /^(\s*)\\\[\s*(.*?)\s*\\\](\s*)$/.exec(line)
        if (oneLineDisplay?.[2]) {
          return `${oneLineDisplay[1]}$$\n${oneLineDisplay[2]}\n${oneLineDisplay[3]}$$`
        }
        if (/^\s*\\\[\s*$/.test(line)) {
          displayMath = true
          return line.replace(/\\\[\s*$/, () => '$$')
        }
      } else if (/^\s*\\\]\s*$/.test(line)) {
        displayMath = false
        return line.replace(/\\\]\s*$/, () => '$$')
      }

      if (displayMath) return line
      return transformOutsideInlineCode(line, (plain) =>
        plain.replace(/\\\((.+?)\\\)/g, (_all, latex: string) => `$${latex.trim()}$`),
      )
    })
    .join('\n')
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
 * Remove HTML non-breaking-space placeholders leaked by model output or an
 * HTML→Markdown round trip. Repeated escaping (`&amp;nbsp;`,
 * `&amp;amp;nbsp;`) is handled in one pass. A four-space-indented placeholder
 * also becomes a blank line before Markdown parsing instead of an accidental
 * code block. Explicit inline/fenced code remains byte-for-byte unchanged.
 */
export function repairEscapedWhitespaceEntities(body: string): string {
  const lines = removeEntityOnlyCodeBlocks(body.split('\n'))
  let codeFence: string | null = null
  return lines
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)
      if (codeFence) {
        if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length) {
          codeFence = null
        }
        return line
      }
      if (fence) {
        codeFence = fence[1]
        return line
      }

      let out = ''
      let cursor = 0
      while (cursor < line.length) {
        const open = line.indexOf('`', cursor)
        if (open < 0) {
          out += normalizeWhitespaceEntities(line.slice(cursor))
          break
        }
        out += normalizeWhitespaceEntities(line.slice(cursor, open))
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
    })
    .join('\n')
}

/** Remove legacy code blocks that contain nothing except leaked nbsp entities. */
function removeEntityOnlyCodeBlocks(lines: string[]): string[] {
  const out: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const open = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[index])
    if (!open) {
      out.push(lines[index])
      continue
    }
    let close = index + 1
    for (; close < lines.length; close++) {
      const marker = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[close])
      if (marker && marker[1][0] === open[1][0] && marker[1].length >= open[1].length) {
        break
      }
    }
    if (close >= lines.length) {
      out.push(lines[index])
      continue
    }
    const content = lines.slice(index + 1, close)
    const hasEntity = content.some((line) => isWhitespaceEntityOnly(line.trim()))
    const onlyWhitespaceEntities = content.every(
      (line) => line.trim() === '' || isWhitespaceEntityOnly(line.trim()),
    )
    if (hasEntity && onlyWhitespaceEntities) {
      out.push('')
      index = close
      continue
    }
    out.push(...lines.slice(index, close + 1))
    index = close
  }
  return out
}

function isWhitespaceEntityOnly(text: string): boolean {
  return /^(?:&(?:amp;)*(?:nbsp|#(?:0*160|x0*a0));)+$/i.test(text)
}

function normalizeWhitespaceEntities(text: string): string {
  return text.replace(/&(?:amp;)*(?:nbsp|#(?:0*160|x0*a0));/gi, ' ')
}

/**
 * Some model responses contain valid LaTeX commands but omit Markdown math
 * delimiters, for example `F_1 = 5\\text{ N}` or `\\mu = 0.2`. TipTap must
 * receive `$...$` to create an equation node. Repair only unmistakable LaTeX
 * commands, and leave fenced/inline code plus already-delimited math intact.
 */
export function delimitBareLatex(body: string): string {
  const lines = body.split('\n')
  let codeFence: string | null = null
  return lines
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)
      if (codeFence) {
        if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length) {
          codeFence = null
        }
        return line
      }
      if (fence) {
        codeFence = fence[1]
        return line
      }

      let out = ''
      let plain = ''
      const flushPlain = (): void => {
        out += delimitBareLatexSegment(plain)
        plain = ''
      }
      for (let index = 0; index < line.length;) {
        const char = line[index]
        if (char !== '`' && char !== '$') {
          plain += char
          index++
          continue
        }
        const marker = char
        let width = 1
        while (line[index + width] === marker) width++
        const delimiter = marker.repeat(width)
        const close = line.indexOf(delimiter, index + width)
        if (close < 0) {
          plain += delimiter
          index += width
          continue
        }
        flushPlain()
        out += line.slice(index, close + width)
        index = close + width
      }
      flushPlain()
      return out
    })
    .join('\n')
}

function delimitBareLatexSegment(segment: string): string {
  // A complete \left...\right pair is an unmistakable formula even when an
  // AI response omitted `$...$`.  Match the delimiter commands rather than
  // guessing from the surrounding prose, so Chinese punctuation immediately
  // after the closing delimiter stays outside the editable equation node.
  const bareFormulas: string[] = []
  const protectFormula = (_all: string, latex: string): string => {
    const index = bareFormulas.push(latex.trim()) - 1
    // Protect the whole expression from the narrower repairs below (for
    // example the `\\pi` rule must not inject nested dollar delimiters).
    return `\uE000${index}\uE001`
  }
  let result = segment.replace(
    /(\\left\s*(?:\\[A-Za-z]+|\\.|[()[\]|])[\s\S]*?\\right\s*(?:\\[A-Za-z]+|\\.|[()[\]|]))/g,
    protectFormula,
  )
  // AI explanations often express a process as bold math text joined by
  // arrows, but omit delimiters around the entire chain. Keep it as a single
  // equation so the labels, spacing and arrows render together.
  result = result.replace(
    /(\\textbf\{[^{}\n]+\}(?:\s*\\(?:longrightarrow|longleftarrow|Longrightarrow|Longleftarrow|rightarrow|leftarrow|Rightarrow|Leftarrow)\s*\\textbf\{[^{}\n]+\})+)/g,
    protectFormula,
  )
  // Include the conventional variable/assignment prefix when present so
  // `F_1 = 5\\text{ N}` becomes one editable equation instead of mixed text.
  result = result.replace(
    /(?<![\w\\])((?:[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?\s*=\s*)?[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s*\\text\{[^{}\n]+\})/g,
    (_all, latex: string) => `$${latex.trim()}$`,
  )
  // Greek symbols are also unambiguous LaTeX. An optional numeric assignment
  // is kept inside the same equation node.
  result = result.replace(
    /(?<![\w\\$])(\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|chi|psi|omega|Delta|Gamma|Lambda|Omega)(?:_\{?[A-Za-z0-9]+\}?)?(?:\s*=\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+))?)/g,
    (_all, latex: string) => `$${latex.trim()}$`,
  )
  return result.replace(/\uE000(\d+)\uE001/g, (_all, index: string) => {
    const latex = bareFormulas[Number(index)]
    return latex === undefined ? _all : `$${latex}$`
  })
}

function normalizeLegacyLatex(latex: string): string {
  // A LaTeX line break is intentionally `\\`; only collapse doubled command
  // escapes such as `\\sqrt`, `\\frac`, `\\{` and `\\_`.
  return latex.replace(/\\\\(?=[A-Za-z{}_^])/g, '\\').replace(/\\_/g, '_')
}

/** Reassemble the full file text from the envelope and the (re)serialized body */
export function serializeDocText(envelope: DocEnvelope, body: string): string {
  let text = envelope.frontmatter + body
  if (envelope.trailingNewline) {
    if (text !== '' && !text.endsWith('\n')) text += '\n'
  } else {
    text = text.replace(/\n+$/, '')
  }
  if (envelope.eol === '\r\n') text = text.replace(/\n/g, '\r\n')
  return envelope.bom ? `\uFEFF${text}` : text
}
