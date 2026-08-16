export const SQL_COLUMN_TYPES = [
  'TEXT',
  'INTEGER',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
] as const

export type SqlColumnType = (typeof SQL_COLUMN_TYPES)[number]
export type SqlScalar = string | number | boolean | Date | null

export interface SqlColumnSchema {
  /** Zero-based source column in the worksheet. */
  readonly sourceColumn: number
  readonly name: string
  readonly type: SqlColumnType
  readonly nullable: boolean
  readonly primaryKey: boolean
}

export interface SqlIndexSchema {
  readonly name: string
  /** One or more column names. Multiple entries form a composite index. */
  readonly columns: readonly string[]
  readonly unique: boolean
}

export interface SqlTableSchema {
  readonly sheetId: string
  readonly sheetName: string
  readonly tableName: string
  /** Zero-based worksheet row containing field names. */
  readonly headerRow: number
  readonly columns: readonly SqlColumnSchema[]
  readonly indexes: readonly SqlIndexSchema[]
}

export interface WorkbookDatabaseSchema {
  readonly version: 1
  readonly workbookKey: string
  readonly updatedAt: string
  readonly tables: readonly SqlTableSchema[]
}

export interface SqlMaterializedTable {
  readonly schema: SqlTableSchema
  readonly rows: ReadonlyArray<Readonly<Record<string, SqlScalar>>>
}

export interface SqlStatement {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
  readonly startLine: number
  readonly endLine: number
}

export interface SqlExecutionResult {
  readonly statement: SqlStatement
  readonly elapsedMs: number
  readonly columns: readonly string[]
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>
  readonly affectedRows: number | null
  readonly truncated: boolean
}

export interface SqlExecutionError {
  readonly statement: SqlStatement
  readonly statementIndex: number
  readonly line: number
  readonly column: number
  readonly message: string
}

export interface SqlScriptExecution {
  readonly results: readonly SqlExecutionResult[]
  readonly error: SqlExecutionError | null
}
