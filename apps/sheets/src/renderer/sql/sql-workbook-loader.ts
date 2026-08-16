import type { WorkbookFile, WorkbookRangeResult } from '../../shared/desktop-api'
import type { EditJournal } from '../edit-journal'
import { createDatabaseSchema, inferTableSchema } from './sql-schema'
import type {
  SqlMaterializedTable,
  SqlScalar,
  SqlTableSchema,
  WorkbookDatabaseSchema,
} from './sql-types'

const RANGE_CELL_LIMIT = 18_000
const WORKBOOK_CELL_LIMIT = 2_000_000

export interface WorkbookRangeReader {
  (request: {
    sessionId: string
    sheetId: string
    range: { startRow: number; endRow: number; startColumn: number; endColumn: number }
  }): Promise<WorkbookRangeResult>
}

export function workbookDatabaseKey(file: WorkbookFile): string {
  return file.path ? `path:${file.path}` : `sha256:${file.sha256}`
}

function journalValue(
  journal: EditJournal | undefined,
  sheetId: string,
  row: number,
  column: number,
): SqlScalar | undefined {
  const entry = journal?.cells.get(sheetId)?.get(`${row}:${column}`)
  if (!entry?.hasValue) return undefined
  return entry.value
}

export async function readWorksheetMatrix(input: {
  file: WorkbookFile
  sheet: WorkbookFile['sheets'][number]
  readRange: WorkbookRangeReader
  journal?: EditJournal
  signal?: AbortSignal
}): Promise<SqlScalar[][]> {
  const { file, sheet, readRange, journal, signal } = input
  if ((journal?.structuralOps.get(sheet.id)?.length ?? 0) > 0) {
    throw new Error(
      `“${sheet.name}” has unsaved row/column structure changes. Save it before refreshing SQL.`,
    )
  }
  const width = sheet.columnCount
  const height = sheet.rowCount
  if (width * height > WORKBOOK_CELL_LIMIT) {
    throw new Error(
      `“${sheet.name}” declares ${(width * height).toLocaleString()} cells; the SQL session limit is ${WORKBOOK_CELL_LIMIT.toLocaleString()}. Remove unused rows/columns or define a smaller data range.`,
    )
  }
  const matrix: SqlScalar[][] = []
  const batchRows = Math.max(1, Math.floor(RANGE_CELL_LIMIT / Math.max(1, width)))
  for (let startRow = 0; startRow < height; startRow += batchRows) {
    if (signal?.aborted) throw new DOMException('SQL database loading was cancelled.', 'AbortError')
    const endRow = Math.min(height - 1, startRow + batchRows - 1)
    const result = await readRange({
      sessionId: file.sessionId,
      sheetId: sheet.id,
      range: { startRow, endRow, startColumn: 0, endColumn: width - 1 },
    })
    for (const cell of result.cells) {
      const row = matrix[cell.row] ?? []
      row[cell.column] = cell.value
      matrix[cell.row] = row
    }
  }
  const entries = journal?.cells.get(sheet.id)
  if (entries) {
    for (const entry of entries.values()) {
      if (!entry.hasValue) continue
      const row = matrix[entry.row] ?? []
      row[entry.column] = journalValue(journal, sheet.id, entry.row, entry.column) ?? null
      matrix[entry.row] = row
    }
  }
  // Keep the header even for an empty table, but do not retain thousands of
  // trailing dimension-only rows in memory.
  let last = Math.min(matrix.length - 1, height - 1)
  while (last > 0 && !(matrix[last] ?? []).some((value) => value !== null && value !== ''))
    last -= 1
  return Array.from({ length: Math.max(1, last + 1) }, (_, row) => matrix[row] ?? [])
}

export function materializeTable(
  schema: SqlTableSchema,
  matrix: readonly SqlScalar[][],
): SqlMaterializedTable {
  const rows: Array<Record<string, SqlScalar>> = []
  for (let rowIndex = schema.headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
    const source = matrix[rowIndex] ?? []
    if (
      schema.columns.every(
        (column) =>
          source[column.sourceColumn] === null ||
          source[column.sourceColumn] === '' ||
          source[column.sourceColumn] === undefined,
      )
    ) {
      continue
    }
    const row: Record<string, SqlScalar> = {}
    for (const column of schema.columns) row[column.name] = source[column.sourceColumn] ?? null
    rows.push(row)
  }
  return { schema, rows }
}

export async function inferWorkbookDatabase(input: {
  file: WorkbookFile
  readRange: WorkbookRangeReader
  journal?: EditJournal
  signal?: AbortSignal
}): Promise<{ schema: WorkbookDatabaseSchema; matrices: Map<string, SqlScalar[][]> }> {
  const tables: SqlTableSchema[] = []
  const matrices = new Map<string, SqlScalar[][]>()
  for (const sheet of input.file.sheets) {
    if (sheet.hidden || sheet.name === '_GenOfficeSchema') continue
    const matrix = await readWorksheetMatrix({ ...input, sheet })
    matrices.set(sheet.id, matrix)
    tables.push(inferTableSchema({ sheetId: sheet.id, sheetName: sheet.name, matrix }))
  }
  const inferred = createDatabaseSchema(workbookDatabaseKey(input.file), tables)
  const metadataSheet = input.file.sheets.find((sheet) => sheet.name === '_GenOfficeSchema')
  if (!metadataSheet) return { schema: inferred, matrices }
  try {
    const metadata = await readWorksheetMatrix({ ...input, sheet: metadataSheet })
    const raw = metadata[0]?.[0]
    if (typeof raw !== 'string') return { schema: inferred, matrices }
    const parsed = JSON.parse(raw) as {
      tables?: Array<{
        sheetName?: string
        tableName?: string
        primaryKey?: string[]
        types?: Record<string, SqlTableSchema['columns'][number]['type']>
        nullable?: string[]
        indexes?: SqlTableSchema['indexes']
      }>
    }
    const configured = inferred.tables.map((table) => {
      const meta = parsed.tables?.find((candidate) => candidate.sheetName === table.sheetName)
      if (!meta) return table
      const primary = new Set(meta.primaryKey ?? [])
      const nullable = new Set(
        meta.nullable ??
          table.columns.filter((column) => column.nullable).map((column) => column.name),
      )
      return {
        ...table,
        tableName: meta.tableName?.trim() || table.tableName,
        columns: table.columns.map((column) => ({
          ...column,
          type: meta.types?.[column.name] ?? column.type,
          primaryKey: primary.has(column.name),
          nullable: primary.has(column.name) ? false : nullable.has(column.name),
        })),
        indexes: meta.indexes ?? table.indexes,
      }
    })
    return { schema: createDatabaseSchema(workbookDatabaseKey(input.file), configured), matrices }
  } catch {
    // Metadata is optional. A malformed hidden sheet must never prevent the
    // workbook itself from opening as an inferred database.
    return { schema: inferred, matrices }
  }
}

export function materializeDatabase(
  schema: WorkbookDatabaseSchema,
  matrices: ReadonlyMap<string, readonly SqlScalar[][]>,
): SqlMaterializedTable[] {
  return schema.tables.map((table) => materializeTable(table, matrices.get(table.sheetId) ?? []))
}
