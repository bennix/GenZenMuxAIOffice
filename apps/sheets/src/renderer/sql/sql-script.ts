import type { SqlStatement } from './sql-types'

function lineAt(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index += 1) if (source.charCodeAt(index) === 10) line += 1
  return line
}

/** Split SQL without treating semicolons in strings, quoted identifiers or comments as boundaries. */
export function splitSqlScript(source: string): SqlStatement[] {
  const statements: SqlStatement[] = []
  let start = 0
  let quote: "'" | '"' | '`' | ']' | null = null
  let lineComment = false
  let blockComment = false
  const push = (end: number): void => {
    let left = start
    let right = end
    // A comment after the previous semicolon belongs to the inter-statement
    // trivia, not to the following statement's error location.
    for (;;) {
      while (left < right && /\s/.test(source[left]!)) left += 1
      if (source.slice(left, left + 2) === '--') {
        const newline = source.indexOf('\n', left + 2)
        left = newline < 0 || newline >= right ? right : newline + 1
        continue
      }
      if (source.slice(left, left + 2) === '/*') {
        const close = source.indexOf('*/', left + 2)
        left = close < 0 || close + 2 > right ? right : close + 2
        continue
      }
      break
    }
    while (right > left && /\s/.test(source[right - 1]!)) right -= 1
    if (right > left && withoutComments(source.slice(left, right)).length > 0) {
      statements.push({
        text: source.slice(left, right),
        startOffset: left,
        endOffset: right,
        startLine: lineAt(source, left),
        endLine: lineAt(source, right),
      })
    }
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!
    const next = source[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (quote === ']' ? char === ']' : char === quote) {
        if (next === char && quote !== ']') index += 1
        else quote = null
      } else if (char === '\\' && quote !== ']' && index + 1 < source.length) index += 1
      continue
    }
    if (char === '-' && next === '-') {
      lineComment = true
      index += 1
    } else if (char === '/' && next === '*') {
      blockComment = true
      index += 1
    } else if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '[') quote = ']'
    else if (char === ';') {
      push(index)
      start = index + 1
    }
  }
  push(source.length)
  return statements
}

function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim()
}

/** AI may execute only data-returning statements; manual UI can explicitly enable writes. */
export function isReadOnlySql(sql: string): boolean {
  const normalized = withoutComments(sql)
    .replace(/^\(+\s*/, '')
    .toLocaleUpperCase()
  if (!/^(SELECT|WITH|EXPLAIN)\b/.test(normalized)) return false
  // SELECT ... INTO and data-changing CTEs must not slip through the prefix check.
  return !/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|UPSERT|MERGE|INTO|ATTACH|DETACH)\b/.test(
    normalized,
  )
}

export function statementAtOffset(source: string, offset: number): SqlStatement | null {
  return (
    splitSqlScript(source).find(
      (statement) => offset >= statement.startOffset && offset <= statement.endOffset,
    ) ?? null
  )
}

function maskedPrefix(source: string, end: number): string {
  // Keep character offsets and line breaks stable so execution failures in a
  // selected/current statement still highlight the original editor range.
  return source.slice(0, end).replace(/[^\r\n]/g, ' ')
}

/**
 * Return the selection, or the statement under the cursor when no executable
 * text is selected. Earlier source is whitespace-masked rather than removed,
 * preserving global diagnostic offsets and line numbers.
 */
export function sqlForSelectionOrCursor(
  source: string,
  selection: { from: number; to: number; head: number },
): string | null {
  const from = Math.max(0, Math.min(source.length, selection.from))
  const to = Math.max(from, Math.min(source.length, selection.to))
  if (to > from && withoutComments(source.slice(from, to)).length > 0) {
    return `${maskedPrefix(source, from)}${source.slice(from, to)}`
  }
  const cursor = Math.max(0, Math.min(source.length, selection.head))
  const statement = statementAtOffset(source, cursor)
  if (!statement) return null
  return `${maskedPrefix(source, statement.startOffset)}${statement.text}`
}
