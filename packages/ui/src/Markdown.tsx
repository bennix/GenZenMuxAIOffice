import { Fragment, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/contrib/mhchem'
import 'katex/dist/katex.min.css'
import { stripNestedMathDelimiters } from './latex'

/**
 * Minimal dependency-free markdown for chat bubbles: paragraphs, ul/ol,
 * headings, GFM tables, **bold**, *italic*, `inline code`, and LaTeX. Tolerates
 * partial (streaming) input — anything unrecognized renders as plain text.
 */

const INLINE_RE =
  /(`[^`\n]+`|\$\$[^$\n]+?\$\$|\$[^$\n]+?\$|\\\([^\n]+?\\\)|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g

/**
 * AI providers do not always return strict CommonMark. Repair only patterns
 * whose intent is unambiguous before the small chat renderer tokenizes them.
 * Code fences and inline code are deliberately left byte-for-byte unchanged.
 */
function normalizeAiMarkdown(text: string): string {
  const lines = text.split('\n')
  let codeFence: string | null = null
  return lines
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
      return transformOutsideCodeAndMath(line, (plain) => {
        let normalized = plain
          // Zero-width characters copied from rich text can split Markdown
          // delimiters while remaining invisible in the UI.
          .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
          // Some models escape Markdown even though their response is already
          // being rendered as Markdown.
          .replace(/\\\*\\\*/g, '**')
          .replace(/\\_\\_/g, '__')
          .replace(/\\\$\\\$/g, '$$$$')
          // CommonMark does not permit whitespace immediately before a strong
          // closing delimiter. Move it after the delimiter.
          .replace(/(\*\*|__)([^\n]*?\S)[ \t]+\1/g, '$1$2$1 ')
          // Standard TeX delimiters are normalized so block parsing and inline
          // parsing follow the same path.
          .replace(/\\\((.+?)\\\)/g, (_all, latex: string) => `$${latex.trim()}$`)

        // Review models sometimes drop only the surrounding `\(` and `\)` and
        // leave `(R_{t-1}\in\mathbb{R}^{...})`. A parenthesized span containing
        // a real LaTeX command is safe to recognize; ordinary prose, filenames
        // and parenthetical English remain untouched.
        normalized = normalized.replace(
          /\(([^()\n]*\\(?:mathbb|mathcal|mathrm|mathbf|operatorname|frac|sqrt|sum|prod|int|in|notin|subset|supset|times|theta|lambda|mu|sigma|ell|hat|widetilde|tilde|overline|underline|cdot|leq|geq|neq)[^()\n]*)\)/g,
          (_all, latex: string) => `$${latex.trim()}$`,
        )
        normalized = normalized.replace(
          /\(([A-Za-z][^()\n]*?(?:_\{[^{}\n]+\}|_[A-Za-z0-9]|\^\{[^{}\n]+\})[^()\n]*)\)/g,
          (_all, latex: string) => `$${latex.trim()}$`,
        )
        return normalized
      })
    })
    .join('\n')
}

function transformOutsideCodeAndMath(line: string, transform: (plain: string) => string): string {
  let out = ''
  let cursor = 0
  while (cursor < line.length) {
    const codeOpen = line.indexOf('`', cursor)
    const mathOpen = line.indexOf('$', cursor)
    const open = codeOpen < 0 ? mathOpen : mathOpen < 0 ? codeOpen : Math.min(codeOpen, mathOpen)
    if (open < 0) {
      out += transform(line.slice(cursor))
      break
    }
    out += transform(line.slice(cursor, open))
    const marker = line[open]!
    let width = 1
    while (line[open + width] === marker) width++
    const delimiter = marker.repeat(width)
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

function renderMath(tex: string, displayMode: boolean, key: number): ReactNode {
  try {
    // Models often Markdown-escape underscores inside already-delimited math
    // (`F\_1`). In LaTeX that means a literal underscore, not a subscript.
    const normalized = stripNestedMathDelimiters(tex).replace(/\\_/g, '_')
    return (
      <span
        key={key}
        className={displayMode ? 'ai-math ai-math-display' : 'ai-math ai-math-inline'}
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(normalized, {
            displayMode,
            throwOnError: false,
            strict: 'ignore',
            trust: false,
            output: 'htmlAndMathml',
          }),
        }}
      />
    )
  } catch {
    const delimiter = displayMode ? '$$' : '$'
    return `${delimiter}${tex}${delimiter}`
  }
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    const tok = m[0] ?? ''
    if (tok.startsWith('`')) out.push(<code key={key++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('$$')) out.push(renderMath(tok.slice(2, -2), true, key++))
    else if (tok.startsWith('$')) out.push(renderMath(tok.slice(1, -1), false, key++))
    else if (tok.startsWith('\\(')) out.push(renderMath(tok.slice(2, -2), false, key++))
    else if (tok.startsWith('**'))
      out.push(<strong key={key++}>{renderInline(tok.slice(2, -2))}</strong>)
    else out.push(<em key={key++}>{renderInline(tok.slice(1, -1))}</em>)
    last = i + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type MdBlock =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'math'; tex: string }
  | { kind: 'code'; language: string; text: string }
  | {
      kind: 'table'
      header: string[]
      rows: string[][]
      align: Array<'left' | 'center' | 'right' | undefined>
    }

function tableCells(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null
  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index] ?? ''
    if (ch === '\\' && body[index + 1] === '|') {
      current += '|'
      index += 1
    } else if (ch === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells.length >= 2 ? cells : null
}

function tableAlign(line: string, columns: number) {
  const cells = tableCells(line)
  if (!cells || cells.length !== columns || !cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return null
  }
  return cells.map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    return left && right ? 'center' : right ? 'right' : left ? 'left' : undefined
  }) as Array<'left' | 'center' | 'right' | undefined>
}

function parseBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  let cur: MdBlock | null = null
  const flush = (): void => {
    if (cur) {
      blocks.push(cur)
      cur = null
    }
  }
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const trimmed = line.trim()
    const codeOpen = /^\s*(`{3,}|~{3,})\s*([^\s`]*)?.*$/.exec(line)
    const delimiter = codeOpen?.[1]
    if (codeOpen && delimiter) {
      flush()
      const body: string[] = []
      let closeIndex = -1
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const candidate = lines[cursor] ?? ''
        const close = /^\s*(`{3,}|~{3,})\s*$/.exec(candidate)
        const closingDelimiter = close?.[1]
        if (
          closingDelimiter &&
          closingDelimiter[0] === delimiter[0] &&
          closingDelimiter.length >= delimiter.length
        ) {
          closeIndex = cursor
          break
        }
        body.push(candidate)
      }
      if (closeIndex >= 0) {
        blocks.push({
          kind: 'code',
          language: codeOpen[2] ?? '',
          text: body.join('\n'),
        })
        index = closeIndex
        continue
      }
      // Streaming may deliver the opener before the closing fence. Keep the
      // source visible until the block is complete instead of losing content.
    }
    const mathOpen = trimmed.startsWith('$$') ? '$$' : trimmed.startsWith('\\[') ? '\\[' : null
    if (mathOpen) {
      const mathClose = mathOpen === '$$' ? '$$' : '\\]'
      const first = trimmed.slice(mathOpen.length)
      if (first.endsWith(mathClose)) {
        flush()
        blocks.push({ kind: 'math', tex: first.slice(0, -mathClose.length).trim() })
        continue
      }
      const body: string[] = first ? [first] : []
      let closeIndex = -1
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const candidate = lines[cursor] ?? ''
        if (candidate.trimEnd().endsWith(mathClose)) {
          body.push(candidate.trimEnd().slice(0, -mathClose.length))
          closeIndex = cursor
          break
        }
        body.push(candidate)
      }
      if (closeIndex >= 0) {
        flush()
        blocks.push({ kind: 'math', tex: body.join('\n').trim() })
        index = closeIndex
        continue
      }
    }
    const h = /^#{1,6}\s+(.*)$/.exec(line)
    if (h) {
      flush()
      blocks.push({ kind: 'h', text: h[1] ?? '' })
      continue
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    if (ul) {
      if (cur?.kind !== 'ul') {
        flush()
        cur = { kind: 'ul', items: [] }
      }
      cur.items.push(ul[1] ?? '')
      continue
    }
    const ol = /^\s*\d+[.、)]\s+(.*)$/.exec(line)
    if (ol) {
      if (cur?.kind !== 'ol') {
        flush()
        cur = { kind: 'ol', items: [] }
      }
      cur.items.push(ol[1] ?? '')
      continue
    }
    const header = tableCells(line)
    const align = header ? tableAlign(lines[index + 1] ?? '', header.length) : null
    if (header && align) {
      flush()
      const rows: string[][] = []
      index += 1
      while (index + 1 < lines.length) {
        const row = tableCells(lines[index + 1] ?? '')
        if (!row || row.length !== header.length) break
        rows.push(row)
        index += 1
      }
      blocks.push({ kind: 'table', header, rows, align })
      continue
    }
    if (cur?.kind !== 'p') {
      flush()
      cur = { kind: 'p', lines: [] }
    }
    cur.lines.push(line)
  }
  flush()
  return blocks
}

export function Markdown({ text }: { text: string }): React.JSX.Element {
  const normalizedText = normalizeAiMarkdown(text)
  return (
    <div className="ai-md">
      {parseBlocks(normalizedText).map((b, i) => {
        if (b.kind === 'math') {
          return (
            <div key={i} className="ai-md-math-block">
              {renderMath(b.tex, true, 0)}
            </div>
          )
        }
        if (b.kind === 'code') {
          return (
            <pre key={i} className="ai-md-code-block">
              <code className={b.language ? `language-${b.language}` : undefined}>{b.text}</code>
            </pre>
          )
        }
        if (b.kind === 'h') {
          return (
            <p key={i} className="ai-md-h">
              {renderInline(b.text)}
            </p>
          )
        }
        if (b.kind === 'ul' || b.kind === 'ol') {
          const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)
          return b.kind === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>
        }
        if (b.kind === 'table') {
          return (
            <div className="ai-md-table-wrap" key={i}>
              <table>
                <thead>
                  <tr>
                    {b.header.map((cell, j) => (
                      <th key={j} style={b.align[j] ? { textAlign: b.align[j] } : undefined}>
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, j) => (
                        <td key={j} style={b.align[j] ? { textAlign: b.align[j] } : undefined}>
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <p key={i}>
            {b.lines.map((ln, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(ln)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
