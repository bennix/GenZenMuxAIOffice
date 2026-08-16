import { describe, expect, it } from 'vitest'
import { WorkbookSqlEngine } from '../src/renderer/sql/sql-engine'
import {
  isReadOnlySql,
  splitSqlScript,
  sqlForSelectionOrCursor,
} from '../src/renderer/sql/sql-script'
import type { SqlMaterializedTable, WorkbookDatabaseSchema } from '../src/renderer/sql/sql-types'

const schema: WorkbookDatabaseSchema = {
  version: 1,
  workbookKey: 'test',
  updatedAt: '2026-08-17T00:00:00.000Z',
  tables: [
    {
      sheetId: 'customers',
      sheetName: '客户',
      tableName: '客户',
      headerRow: 0,
      columns: [
        { sourceColumn: 0, name: '客户ID', type: 'TEXT', nullable: false, primaryKey: true },
        { sourceColumn: 1, name: '城市', type: 'TEXT', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'idx_客户_城市', columns: ['城市'], unique: false }],
    },
    {
      sheetId: 'orders',
      sheetName: '订单',
      tableName: '订单',
      headerRow: 0,
      columns: [
        { sourceColumn: 0, name: '订单ID', type: 'TEXT', nullable: false, primaryKey: true },
        { sourceColumn: 1, name: '客户ID', type: 'TEXT', nullable: false, primaryKey: false },
        { sourceColumn: 2, name: '金额', type: 'NUMBER', nullable: false, primaryKey: false },
      ],
      indexes: [{ name: 'idx_订单_客户', columns: ['客户ID'], unique: false }],
    },
  ],
}

const tables: SqlMaterializedTable[] = [
  {
    schema: schema.tables[0]!,
    rows: [
      { 客户ID: 'C001', 城市: '上海' },
      { 客户ID: 'C002', 城市: '北京' },
    ],
  },
  {
    schema: schema.tables[1]!,
    rows: [
      { 订单ID: 'O001', 客户ID: 'C001', 金额: 120 },
      { 订单ID: 'O002', 客户ID: 'C001', 金额: 80 },
      { 订单ID: 'O003', 客户ID: 'C002', 金额: 90 },
    ],
  },
]

describe('SQL script parsing', () => {
  it('keeps semicolons inside strings and comments', () => {
    const sql = "SELECT ';' AS x; -- ;\nSELECT 2 AS y; /* ; */"
    const statements = splitSqlScript(sql)
    expect(statements).toHaveLength(2)
    expect(statements[1]?.startLine).toBe(2)
  })

  it('recognizes safe AI queries and rejects writes', () => {
    expect(isReadOnlySql('SELECT * FROM [客户]')).toBe(true)
    expect(isReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true)
    expect(isReadOnlySql('SELECT * INTO backup FROM [客户]')).toBe(false)
    expect(isReadOnlySql("UPDATE [客户] SET [城市] = '深圳'")).toBe(false)
  })

  it('runs selected or current SQL while preserving global source positions', () => {
    const source = 'SELECT 1;\n-- second query\nSELECT * FROM [不存在];\nSELECT 3;'
    const selectedStart = source.indexOf('SELECT *')
    const selectedEnd = source.indexOf(';', selectedStart) + 1
    const selected = sqlForSelectionOrCursor(source, {
      from: selectedStart,
      to: selectedEnd,
      head: selectedStart,
    })
    const selectedStatement = splitSqlScript(selected ?? '')[0]
    expect(selectedStatement?.startOffset).toBe(selectedStart)
    expect(selectedStatement?.startLine).toBe(3)

    const current = sqlForSelectionOrCursor(source, {
      from: source.indexOf('SELECT 3'),
      to: source.indexOf('SELECT 3'),
      head: source.indexOf('SELECT 3') + 3,
    })
    const currentStatement = splitSqlScript(current ?? '')[0]
    expect(currentStatement?.text).toBe('SELECT 3')
    expect(currentStatement?.startLine).toBe(4)
  })
})

describe('WorkbookSqlEngine', () => {
  it('queries Chinese tables with joins and grouping', () => {
    const engine = new WorkbookSqlEngine()
    engine.load(schema, tables)
    const result = engine.execute(`
      SELECT c.[城市], SUM(o.[金额]) AS [销售额]
      FROM [客户] AS c
      JOIN [订单] AS o ON o.[客户ID] = c.[客户ID]
      GROUP BY c.[城市]
      ORDER BY [销售额] DESC;
    `)
    expect(result.error).toBeNull()
    expect(result.results[0]?.rows).toEqual([
      { 城市: '上海', 销售额: 200 },
      { 城市: '北京', 销售额: 90 },
    ])
    engine.reset()
  })

  it('reports the failing statement and source line', () => {
    const engine = new WorkbookSqlEngine()
    engine.load(schema, tables)
    const result = engine.execute('SELECT 1 AS ok;\nSELECT * FROM [不存在];\nSELECT 3;')
    expect(result.results).toHaveLength(1)
    expect(result.error?.statementIndex).toBe(1)
    expect(result.error?.line).toBe(2)
    engine.reset()
  })

  it('blocks write statements in AI read-only mode', () => {
    const engine = new WorkbookSqlEngine()
    engine.load(schema, tables)
    const result = engine.execute('DELETE FROM [订单]', { readOnly: true })
    expect(result.error?.message).toContain('AI safety policy')
    engine.reset()
  })
})
