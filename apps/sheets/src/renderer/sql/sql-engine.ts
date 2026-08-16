import alasql from 'alasql'
import { isReadOnlySql, splitSqlScript } from './sql-script'
import { validateDatabaseSchema } from './sql-schema'
import type {
  SqlColumnType,
  SqlExecutionError,
  SqlExecutionResult,
  SqlMaterializedTable,
  SqlScalar,
  SqlScriptExecution,
  SqlStatement,
  WorkbookDatabaseSchema,
} from './sql-types'

const RESULT_ROW_LIMIT = 10_000

export function quoteSqlIdentifier(value: string): string {
  if (!value.trim()) throw new Error('SQL identifier must not be empty.')
  if (value.includes(']')) throw new Error(`SQL identifier cannot contain ]: ${value}`)
  return `[${value}]`
}

function alasqlType(type: SqlColumnType): string {
  switch (type) {
    case 'INTEGER':
      return 'INT'
    case 'NUMBER':
      return 'NUMBER'
    case 'BOOLEAN':
      return 'BOOLEAN'
    case 'DATE':
      return 'DATE'
    case 'DATETIME':
      return 'DATETIME'
    default:
      return 'STRING'
  }
}

function excelSerialDate(serial: number): Date {
  // Excel's 1900 calendar intentionally includes the fictitious 1900-02-29.
  const wholeDays = Math.floor(serial)
  const adjusted = wholeDays >= 60 ? wholeDays - 1 : wholeDays
  const millis = Date.UTC(1899, 11, 31) + adjusted * 86_400_000 + (serial - wholeDays) * 86_400_000
  return new Date(millis)
}

export function coerceSqlValue(value: SqlScalar, type: SqlColumnType): SqlScalar {
  if (value === null || value === '') return null
  if (type === 'TEXT') return String(value)
  if (type === 'BOOLEAN') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    return /^(true|yes|y|1|是)$/i.test(String(value).trim())
  }
  if (type === 'INTEGER' || type === 'NUMBER') {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? (type === 'INTEGER' ? Math.trunc(number) : number) : null
  }
  if (value instanceof Date) return value
  if (typeof value === 'number') return excelSerialDate(value)
  const date = new Date(String(value))
  return Number.isNaN(date.valueOf()) ? null : date
}

function errorPosition(
  statement: SqlStatement,
  error: unknown,
): Pick<SqlExecutionError, 'line' | 'column'> {
  const message = error instanceof Error ? error.message : String(error)
  const match = /(?:line|at)\s+(\d+)(?:\s*[:,]\s*(?:column\s*)?(\d+))?/i.exec(message)
  return {
    line: statement.startLine + (match ? Number(match[1]) - 1 : 0),
    column: match?.[2] ? Number(match[2]) : 1,
  }
}

export class WorkbookSqlEngine {
  private databaseId = ''
  private ready = false

  get isReady(): boolean {
    return this.ready
  }

  reset(): void {
    if (this.databaseId) {
      try {
        alasql(`DROP DATABASE ${quoteSqlIdentifier(this.databaseId)}`)
      } catch {
        // Session database may already have been released.
      }
    }
    this.databaseId = ''
    this.ready = false
  }

  load(schema: WorkbookDatabaseSchema, tables: readonly SqlMaterializedTable[]): void {
    const errors = validateDatabaseSchema(schema)
    if (errors.length > 0) throw new Error(errors.join('\n'))
    this.reset()
    this.databaseId = `genoffice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    alasql(`CREATE DATABASE ${quoteSqlIdentifier(this.databaseId)}`)
    alasql(`USE ${quoteSqlIdentifier(this.databaseId)}`)
    try {
      for (const table of tables) {
        const { schema: tableSchema } = table
        const primary = tableSchema.columns.filter((column) => column.primaryKey)
        const definitions = tableSchema.columns.map(
          (column) =>
            `${quoteSqlIdentifier(column.name)} ${alasqlType(column.type)}${column.nullable ? '' : ' NOT NULL'}`,
        )
        if (primary.length > 0) {
          definitions.push(
            `PRIMARY KEY (${primary.map((column) => quoteSqlIdentifier(column.name)).join(', ')})`,
          )
        }
        alasql(
          `CREATE TABLE ${quoteSqlIdentifier(tableSchema.tableName)} (${definitions.join(', ')})`,
        )
        const columns = tableSchema.columns
          .map((column) => quoteSqlIdentifier(column.name))
          .join(', ')
        const placeholders = tableSchema.columns.map(() => '?').join(', ')
        const insert = `INSERT INTO ${quoteSqlIdentifier(tableSchema.tableName)} (${columns}) VALUES (${placeholders})`
        for (const row of table.rows) {
          alasql(
            insert,
            tableSchema.columns.map((column) =>
              coerceSqlValue(row[column.name] ?? null, column.type),
            ),
          )
        }
        for (const index of tableSchema.indexes) {
          alasql(
            `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteSqlIdentifier(index.name)} ON ${quoteSqlIdentifier(tableSchema.tableName)} (${index.columns.map(quoteSqlIdentifier).join(', ')})`,
          )
        }
      }
      this.ready = true
    } catch (error) {
      this.reset()
      throw error
    }
  }

  execute(
    script: string,
    options: { readOnly?: boolean; maxRows?: number } = {},
  ): SqlScriptExecution {
    if (!this.ready) throw new Error('Workbook database has not been loaded.')
    alasql(`USE ${quoteSqlIdentifier(this.databaseId)}`)
    const statements = splitSqlScript(script)
    const results: SqlExecutionResult[] = []
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index]!
      if (options.readOnly && !isReadOnlySql(statement.text)) {
        return {
          results,
          error: {
            statement,
            statementIndex: index,
            line: statement.startLine,
            column: 1,
            message: 'AI safety policy allows only SELECT, WITH or EXPLAIN queries.',
          },
        }
      }
      const started = performance.now()
      try {
        const raw: unknown = alasql(statement.text)
        const elapsedMs = performance.now() - started
        const rowLimit = Math.max(
          1,
          Math.min(options.maxRows ?? RESULT_ROW_LIMIT, RESULT_ROW_LIMIT),
        )
        const array = Array.isArray(raw) ? raw : []
        const objectRows = array.filter(
          (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
        )
        const rows = objectRows.slice(0, rowLimit)
        const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
        results.push({
          statement,
          elapsedMs,
          columns,
          rows,
          affectedRows: typeof raw === 'number' ? raw : null,
          truncated: objectRows.length > rowLimit,
        })
      } catch (error) {
        const position = errorPosition(statement, error)
        return {
          results,
          error: {
            statement,
            statementIndex: index,
            ...position,
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
    }
    return { results, error: null }
  }
}
