import { Fragment, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Minimal dependency-free markdown for chat bubbles: paragraphs, ul/ol,
 * headings, GFM tables, **bold**, *italic*, `inline code`, and LaTeX. Tolerates
 * partial (streaming) input — anything unrecognized renders as plain text.
 */

const INLINE_RE =
  /(`[^`\n]+`|\$\$[^$\n]+?\$\$|\$[^$\n]+?\$|\\\([^\\\n]+?\\\)|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g

function renderMath(tex: string, displayMode: boolean, key: number): ReactNode {
  try {
    // Models often Markdown-escape underscores inside already-delimited math
    // (`F\_1`). In LaTeX that means a literal underscore, not a subscript.
    const normalized = tex.replace(/\\_/g, '_')
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
  return (
    <div className="ai-md">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === 'math') {
          return (
            <div key={i} className="ai-md-math-block">
              {renderMath(b.tex, true, 0)}
            </div>
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
