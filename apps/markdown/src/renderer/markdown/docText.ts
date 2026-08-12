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
  const hasEscapedFormatting = /\\\*\\\*[^\n]+?\\\*\\\*/.test(body)
  const hasDoubledLatex = /\${1,2}[\s\S]*?\\\\(?:[A-Za-z]+|[{}_^])[\s\S]*?\${1,2}/.test(body)
  if (!hasEscapedFormatting && !hasDoubledLatex) return body

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

      let repaired = line
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
