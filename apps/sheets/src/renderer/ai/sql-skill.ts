import type { AgentSkill, ToolExecution } from '@genoffice/agent-core'
import type { WorkbookDatabaseSchema } from '../sql/sql-types'

export interface SqlSkillDeps {
  ensureDatabase(): Promise<WorkbookDatabaseSchema>
  getSchema(): WorkbookDatabaseSchema | null
  runReadOnly(query: string): Promise<{
    rows: ReadonlyArray<Readonly<Record<string, unknown>>>
    columns: readonly string[]
    error: string | null
  }>
  writeReadOnlyResult(query: string): Promise<{ rows: number; error: string | null }>
}

const prompt = `# Workbook SQL database

The workbook can be queried as a relational database: one workbook is one database and every visible worksheet is a table. Field types, composite primary keys and secondary/composite indexes come from the user's locally persisted schema.

- Call get_sql_catalog before writing SQL. Never invent a table or field name.
- Use square brackets around Chinese or spaced identifiers, for example [订单明细].[商品ID].
- run_sql_query is strictly read-only and accepts only SELECT/WITH/EXPLAIN. Use it to verify generated or repaired SQL before presenting a result.
- Never attempt DDL/DML or hide a write inside a CTE/SELECT INTO.
- Call write_sql_result only when the user explicitly asks to insert/backfill the query result into Excel. It creates a new worksheet and never overwrites source tables.
- SQL data is local and session-scoped. Do not claim it was uploaded or persisted to an external database.`

function describe(schema: WorkbookDatabaseSchema): string {
  return schema.tables
    .map((table) => {
      const primary = table.columns
        .filter((column) => column.primaryKey)
        .map((column) => column.name)
      const columns = table.columns
        .map(
          (column) =>
            `${column.name} ${column.type}${column.nullable ? ' NULL' : ' NOT NULL'}${column.primaryKey ? ' PK' : ''}`,
        )
        .join(', ')
      const indexes = table.indexes.length
        ? table.indexes
            .map(
              (index) =>
                `${index.name}(${index.columns.join(', ')})${index.unique ? ' UNIQUE' : ''}`,
            )
            .join('; ')
        : '(none)'
      return `- table [${table.tableName}] (worksheet “${table.sheetName}”): ${columns}\n  primary key: ${primary.join(' + ') || '(none)'}; secondary indexes: ${indexes}`
    })
    .join('\n')
}

const failure = (summary: string, output: string): ToolExecution => ({
  summary,
  output,
  isError: true,
  mutated: false,
})

export function createSqlSkill(deps: SqlSkillDeps): AgentSkill {
  return {
    id: 'workbook-sql',
    systemPrompt: prompt,
    tools: [
      {
        name: 'get_sql_catalog',
        description:
          'Load and return the real workbook SQL catalog: tables, fields, types, nullability, primary keys and secondary/composite indexes.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'run_sql_query',
        description:
          'Execute a verified read-only SELECT/WITH/EXPLAIN query against the local workbook database. Returns at most 500 rows and never changes Excel.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'AlaSQL-compatible read-only SQL' } },
          required: ['query'],
        },
      },
      {
        name: 'write_sql_result',
        description:
          'Run a read-only query and insert its result into a new Excel worksheet. Use only after the user explicitly asks for insertion/backfill/export to Excel.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'AlaSQL-compatible read-only SQL' } },
          required: ['query'],
        },
      },
    ],
    buildContext: () => {
      const schema = deps.getSchema()
      return schema
        ? `Workbook SQL catalog currently loaded:\n${describe(schema)}`
        : 'Workbook SQL catalog is not loaded. Call get_sql_catalog before composing SQL.'
    },
    async executeTool(call): Promise<ToolExecution> {
      if (call.name === 'get_sql_catalog') {
        try {
          const schema = await deps.ensureDatabase()
          return {
            output: describe(schema),
            summary: `Loaded ${schema.tables.length} SQL table(s)`,
            mutated: false,
          }
        } catch (error) {
          return failure('Load SQL catalog', error instanceof Error ? error.message : String(error))
        }
      }
      const query = typeof call.input.query === 'string' ? call.input.query.trim() : ''
      if (!query) return failure(call.name, 'query must be a non-empty SQL string')
      try {
        await deps.ensureDatabase()
        if (call.name === 'run_sql_query') {
          const result = await deps.runReadOnly(query)
          if (result.error) return failure('Run SQL query', result.error)
          return {
            output: JSON.stringify(
              { columns: result.columns, rows: result.rows.slice(0, 500) },
              null,
              2,
            ),
            summary: `SQL returned ${result.rows.length} row(s)`,
            mutated: false,
          }
        }
        if (call.name === 'write_sql_result') {
          const result = await deps.writeReadOnlyResult(query)
          if (result.error) return failure('Write SQL result', result.error)
          return {
            output: `Inserted ${result.rows} query result row(s) into a new worksheet. Source tables were unchanged.`,
            summary: `Wrote ${result.rows} SQL result row(s)`,
            mutated: true,
          }
        }
        return failure(call.name, `Unknown SQL tool: ${call.name}`)
      } catch (error) {
        return failure(call.name, error instanceof Error ? error.message : String(error))
      }
    },
  }
}
