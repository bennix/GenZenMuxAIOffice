import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { XlsxSidecarClient } from '../src/main/xlsx-sidecar-client'
import { WorkbookSqlEngine } from '../src/renderer/sql/sql-engine'
import { inferWorkbookDatabase, materializeDatabase } from '../src/renderer/sql/sql-workbook-loader'
import type {
  SqlColumnType,
  SqlMaterializedTable,
  SqlScalar,
  SqlTableSchema,
  WorkbookDatabaseSchema,
} from '../src/renderer/sql/sql-types'
import {
  workbookFileSchema,
  workbookRangeResultSchema,
  type WorkbookFile,
} from '../src/shared/desktop-api'

interface ManifestTable {
  sheetName: string
  tableName: string
  primaryKey: string[]
  nullable: string[]
  types: Record<string, SqlColumnType>
  indexes: Array<{ name: string; columns: string[]; unique: boolean }>
}

interface ManifestSample {
  file: string
  schema: ManifestTable[]
  sheets: Record<string, unknown[][]>
  queries: Array<{ name: string; sql: string; rows?: number; min_rows?: number }>
}

function scalar(value: unknown): SqlScalar {
  return value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? value
    : String(value)
}

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/sql/sql-samples.manifest.json'), 'utf8'),
) as { version: number; samples: Record<string, ManifestSample> }

const sidecarOpenResultSchema = workbookFileSchema.omit({ sha256: true, readOnly: true })

function sidecarBinaryPath(): string {
  const executable = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'
  return fileURLToPath(
    new URL(`../native/xlsx-engine/target/release/${executable}`, import.meta.url),
  )
}

function database(sample: ManifestSample): {
  schema: WorkbookDatabaseSchema
  tables: SqlMaterializedTable[]
} {
  const tables: SqlMaterializedTable[] = sample.schema.map((meta, tableIndex) => {
    const matrix = sample.sheets[meta.sheetName] ?? []
    const headers = (matrix[0] ?? []).map(String)
    const nullable = new Set(meta.nullable)
    const primary = new Set(meta.primaryKey)
    const schema: SqlTableSchema = {
      sheetId: `sheet-${tableIndex + 1}`,
      sheetName: meta.sheetName,
      tableName: meta.tableName,
      headerRow: 0,
      columns: headers.map((name, sourceColumn) => ({
        sourceColumn,
        name,
        type: meta.types[name] ?? 'TEXT',
        nullable: nullable.has(name),
        primaryKey: primary.has(name),
      })),
      indexes: meta.indexes,
    }
    return {
      schema,
      rows: matrix
        .slice(1)
        .map((values) =>
          Object.fromEntries(
            headers.map((header, index) => [header, scalar(values[index] ?? null)]),
          ),
        ),
    }
  })
  return {
    schema: {
      version: 1,
      workbookKey: sample.file,
      updatedAt: '2026-08-17T00:00:00.000Z',
      tables: tables.map((table) => table.schema),
    },
    tables,
  }
}

describe.each(Object.entries(manifest.samples))('%s SQL sample workbook', (_key, sample) => {
  it(`validates every documented query in ${sample.file}`, () => {
    const input = database(sample)
    const engine = new WorkbookSqlEngine()
    engine.load(input.schema, input.tables)
    for (const query of sample.queries) {
      const execution = engine.execute(query.sql, { readOnly: true })
      expect(execution.error, query.name).toBeNull()
      const rowCount = execution.results.at(-1)?.rows.length ?? 0
      if (query.rows !== undefined) expect(rowCount, query.name).toBe(query.rows)
      if (query.min_rows !== undefined)
        expect(rowCount, query.name).toBeGreaterThanOrEqual(query.min_rows)
    }
    engine.reset()
  })

  it('contains a primary key and at least one secondary index per table', () => {
    const input = database(sample)
    for (const table of input.schema.tables) {
      expect(
        table.columns.some((column) => column.primaryKey),
        table.tableName,
      ).toBe(true)
      expect(table.indexes.length, table.tableName).toBeGreaterThan(0)
    }
  })

  it(`opens the real ${sample.file} through the application XLSX gateway`, async () => {
    const samplePath = resolve(__dirname, '../fixtures/sql', sample.file)
    const client = new XlsxSidecarClient(sidecarBinaryPath())
    let sessionId: string | null = null
    try {
      const opened = sidecarOpenResultSchema.parse(await client.open(samplePath, 'zh'))
      sessionId = opened.sessionId
      const file: WorkbookFile = workbookFileSchema.parse({
        ...opened,
        path: samplePath,
        sha256: createHash('sha256').update(readFileSync(samplePath)).digest('hex'),
        readOnly: false,
      })
      const inferred = await inferWorkbookDatabase({
        file,
        readRange: async (request) =>
          workbookRangeResultSchema.parse(await client.readRange(request)),
      })

      expect(inferred.schema.tables.map((table) => table.tableName)).toEqual(
        sample.schema.map((table) => table.tableName),
      )
      for (const expected of sample.schema) {
        const actual = inferred.schema.tables.find(
          (table) => table.tableName === expected.tableName,
        )
        expect(actual, expected.tableName).toBeDefined()
        expect(
          actual?.columns.filter((column) => column.primaryKey).map((column) => column.name),
        ).toEqual(expected.primaryKey)
        expect(actual?.indexes).toEqual(expected.indexes)
      }

      const engine = new WorkbookSqlEngine()
      engine.load(inferred.schema, materializeDatabase(inferred.schema, inferred.matrices))
      for (const query of sample.queries) {
        const execution = engine.execute(query.sql, { readOnly: true })
        expect(execution.error, query.name).toBeNull()
        const rowCount = execution.results.at(-1)?.rows.length ?? 0
        if (query.rows !== undefined) expect(rowCount, query.name).toBe(query.rows)
        if (query.min_rows !== undefined)
          expect(rowCount, query.name).toBeGreaterThanOrEqual(query.min_rows)
      }
      engine.reset()
    } finally {
      if (sessionId) await client.close(sessionId)
      client.stop()
    }
  })
})
