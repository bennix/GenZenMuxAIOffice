import type { SqlMaterializedTable, SqlScriptExecution, WorkbookDatabaseSchema } from './sql-types'

/**
 * Renderer-side proxy for the per-tab SQL engine hosted in Electron's main
 * process. AlaSQL compiles query functions dynamically; keeping it outside
 * the page preserves the strict renderer CSP without adding unsafe-eval.
 */
export class WorkbookSqlBridge {
  private ready = false

  get isReady(): boolean {
    return this.ready
  }

  async reset(): Promise<void> {
    this.ready = false
    await window.desktopApi.resetSqlDatabase()
  }

  async load(
    schema: WorkbookDatabaseSchema,
    tables: readonly SqlMaterializedTable[],
  ): Promise<void> {
    this.ready = false
    await window.desktopApi.loadSqlDatabase(schema, tables)
    this.ready = true
  }

  execute(
    script: string,
    options: { readOnly?: boolean; maxRows?: number } = {},
  ): Promise<SqlScriptExecution> {
    if (!this.ready) return Promise.reject(new Error('Workbook database has not been loaded.'))
    return window.desktopApi.executeSql(script, options)
  }
}
