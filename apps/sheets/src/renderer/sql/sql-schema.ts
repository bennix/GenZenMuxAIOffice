import type {
  SqlColumnSchema,
  SqlColumnType,
  SqlIndexSchema,
  SqlScalar,
  SqlTableSchema,
  WorkbookDatabaseSchema,
} from './sql-types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/
const DATE_HEADER = /(date|time|日期|时间|年月|创建于|更新于|发表|入职)/i

function nonEmpty(values: readonly SqlScalar[]): SqlScalar[] {
  return values.filter(
    (value): value is Exclude<SqlScalar, null | ''> => value !== null && value !== '',
  )
}

export function inferColumnType(name: string, values: readonly SqlScalar[]): SqlColumnType {
  const present = nonEmpty(values)
  if (present.length === 0) return DATE_HEADER.test(name) ? 'DATE' : 'TEXT'
  if (present.every((value) => typeof value === 'boolean')) return 'BOOLEAN'
  if (present.every((value) => value instanceof Date)) {
    return present.some(
      (value) =>
        value instanceof Date &&
        (value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0),
    )
      ? 'DATETIME'
      : 'DATE'
  }
  if (present.every((value) => typeof value === 'number' && Number.isInteger(value))) {
    // Excel dates arrive from the workbook gateway as serial numbers. Header
    // semantics keep those columns queryable as dates without guessing that
    // every ordinary integer is a date.
    return DATE_HEADER.test(name) ? 'DATE' : 'INTEGER'
  }
  if (present.every((value) => typeof value === 'number')) return 'NUMBER'
  if (present.every((value) => typeof value === 'string' && ISO_DATE.test(value))) return 'DATE'
  if (present.every((value) => typeof value === 'string' && ISO_DATETIME.test(value))) {
    return 'DATETIME'
  }
  return 'TEXT'
}

export function uniqueSqlName(raw: unknown, index: number, used: Set<string>): string {
  const base = String(raw ?? '').trim() || `字段${index + 1}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLocaleLowerCase())) candidate = `${base}_${suffix++}`
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

export function inferTableSchema(input: {
  sheetId: string
  sheetName: string
  headerRow?: number
  matrix: readonly (readonly SqlScalar[])[]
}): SqlTableSchema {
  const headerRow = input.headerRow ?? 0
  const headers = input.matrix[headerRow] ?? []
  const width = input.matrix.reduce((max, row) => Math.max(max, row.length), headers.length)
  const used = new Set<string>()
  const columns: SqlColumnSchema[] = []
  for (let column = 0; column < width; column += 1) {
    const values = input.matrix
      .slice(headerRow + 1, headerRow + 201)
      .map((row) => row[column] ?? null)
    const name = uniqueSqlName(headers[column], column, used)
    columns.push({
      sourceColumn: column,
      name,
      type: inferColumnType(name, values),
      nullable: values.some((value) => value === null || value === ''),
      primaryKey: false,
    })
  }
  return {
    sheetId: input.sheetId,
    sheetName: input.sheetName,
    tableName: input.sheetName,
    headerRow,
    columns,
    indexes: [],
  }
}

export function validateTableSchema(table: SqlTableSchema): string[] {
  const errors: string[] = []
  if (!table.tableName.trim()) errors.push(`${table.sheetName}: table name is empty`)
  const names = new Set<string>()
  for (const column of table.columns) {
    const folded = column.name.trim().toLocaleLowerCase()
    if (!folded) errors.push(`${table.tableName}: a field name is empty`)
    else if (names.has(folded)) errors.push(`${table.tableName}: duplicate field ${column.name}`)
    names.add(folded)
  }
  const indexNames = new Set<string>()
  for (const index of table.indexes) {
    const folded = index.name.trim().toLocaleLowerCase()
    if (!folded) errors.push(`${table.tableName}: an index name is empty`)
    else if (indexNames.has(folded))
      errors.push(`${table.tableName}: duplicate index ${index.name}`)
    indexNames.add(folded)
    if (index.columns.length === 0) errors.push(`${table.tableName}.${index.name}: no fields`)
    for (const column of index.columns) {
      if (!names.has(column.toLocaleLowerCase())) {
        errors.push(`${table.tableName}.${index.name}: unknown field ${column}`)
      }
    }
  }
  return errors
}

export function validateDatabaseSchema(schema: WorkbookDatabaseSchema): string[] {
  const errors = schema.tables.flatMap(validateTableSchema)
  const names = new Set<string>()
  for (const table of schema.tables) {
    const folded = table.tableName.trim().toLocaleLowerCase()
    if (names.has(folded)) errors.push(`Duplicate table name: ${table.tableName}`)
    names.add(folded)
  }
  return errors
}

export function createDatabaseSchema(
  workbookKey: string,
  tables: readonly SqlTableSchema[],
): WorkbookDatabaseSchema {
  return { version: 1, workbookKey, updatedAt: new Date().toISOString(), tables }
}

export function setPrimaryKey(
  table: SqlTableSchema,
  columnNames: readonly string[],
): SqlTableSchema {
  const selected = new Set(columnNames.map((name) => name.toLocaleLowerCase()))
  return {
    ...table,
    columns: table.columns.map((column) => ({
      ...column,
      primaryKey: selected.has(column.name.toLocaleLowerCase()),
      nullable: selected.has(column.name.toLocaleLowerCase()) ? false : column.nullable,
    })),
  }
}

export function addIndex(table: SqlTableSchema, index: SqlIndexSchema): SqlTableSchema {
  return { ...table, indexes: [...table.indexes, index] }
}

const STORAGE_PREFIX = 'genoffice-sql-schema:'

export function loadStoredSchema(workbookKey: string): WorkbookDatabaseSchema | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${workbookKey}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkbookDatabaseSchema
    if (
      parsed.version !== 1 ||
      parsed.workbookKey !== workbookKey ||
      !Array.isArray(parsed.tables)
    ) {
      return null
    }
    return validateDatabaseSchema(parsed).length === 0 ? parsed : null
  } catch {
    return null
  }
}

export function saveStoredSchema(schema: WorkbookDatabaseSchema): void {
  localStorage.setItem(`${STORAGE_PREFIX}${schema.workbookKey}`, JSON.stringify(schema))
}
