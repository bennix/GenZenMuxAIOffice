import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ATTACHMENT_IMAGE_EXTS,
  type AttachmentMeta,
  type WorkbookFile,
} from '../shared/desktop-api'
import type { EditJournal } from './edit-journal'
import attachIcon from './assets/attach-icon.png'
import fileImageIcon from './assets/file-image.png'
import {
  AttachmentCardIcon,
  formatAttachmentSize,
  PASTE_MIME_EXT,
  truncateCardName,
} from './ai/AiChatPanel'
import { WorkbookSqlBridge } from './sql/sql-bridge'
import { loadStoredSchema, saveStoredSchema, validateDatabaseSchema } from './sql/sql-schema'
import {
  inferWorkbookDatabase,
  materializeDatabase,
  workbookDatabaseKey,
} from './sql/sql-workbook-loader'
import type {
  SqlExecutionResult,
  SqlIndexSchema,
  SqlScalar,
  SqlTableSchema,
  WorkbookDatabaseSchema,
} from './sql/sql-types'
import { SQL_COLUMN_TYPES } from './sql/sql-types'
import { sqlForSelectionOrCursor } from './sql/sql-script'

interface SqlWorkspaceProps {
  readonly file: WorkbookFile | null
  readonly journal: EditJournal | undefined
  readonly engine: WorkbookSqlBridge
  readonly onReady: (schema: WorkbookDatabaseSchema) => void
  readonly onBackfill: (
    columns: readonly string[],
    rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  ) => string | null
  readonly aiBusy: boolean
  readonly aiConfigured: boolean
  readonly aiFailed: boolean
  readonly aiReply: string
  readonly attachments: readonly AttachmentMeta[]
  readonly attachNotice: string | null
  readonly onPickAttachments: () => void
  readonly onAddAttachmentPaths: (paths: readonly string[]) => void
  readonly onAddPastedImage: (data: ArrayBuffer, ext: string) => void
  readonly onRemoveAttachment: (path: string) => void
  readonly onAskAi: (question: string, retryAttachments?: readonly AttachmentMeta[]) => void
  readonly onClose: () => void
}

const STARTER_SQL = `-- 工作簿 = 数据库；每个可见工作表 = 数据表
-- 中文表名和字段名请使用方括号
SELECT *
FROM [表名]
LIMIT 100;`

function replaceTable(
  schema: WorkbookDatabaseSchema,
  sheetId: string,
  update: (table: SqlTableSchema) => SqlTableSchema,
): WorkbookDatabaseSchema {
  return {
    ...schema,
    updatedAt: new Date().toISOString(),
    tables: schema.tables.map((table) => (table.sheetId === sheetId ? update(table) : table)),
  }
}

function resultLabel(result: SqlExecutionResult): string {
  if (result.rows.length > 0)
    return `${result.rows.length.toLocaleString()} 行 · ${result.elapsedMs.toFixed(1)} ms`
  if (result.affectedRows !== null)
    return `影响 ${result.affectedRows.toLocaleString()} 行 · ${result.elapsedMs.toFixed(1)} ms`
  return `已完成 · ${result.elapsedMs.toFixed(1)} ms`
}

function sqlFromAiReply(reply: string): string | null {
  const fenced = /```sql\s*([\s\S]*?)```/i.exec(reply)?.[1]?.trim()
  if (fenced) return fenced
  const statement = /\b(?:SELECT|WITH|EXPLAIN)\b[\s\S]*?(?:;|$)/i.exec(reply)?.[0]?.trim()
  return statement || null
}

export function SqlWorkspace({
  file,
  journal,
  engine,
  onReady,
  onBackfill,
  aiBusy,
  aiConfigured,
  aiFailed,
  aiReply,
  attachments,
  attachNotice,
  onPickAttachments,
  onAddAttachmentPaths,
  onAddPastedImage,
  onRemoveAttachment,
  onAskAi,
  onClose,
}: SqlWorkspaceProps): React.JSX.Element {
  const chinese = navigator.language.toLowerCase().startsWith('zh')
  const [schema, setSchema] = useState<WorkbookDatabaseSchema | null>(null)
  const [matrices, setMatrices] = useState<Map<string, SqlScalar[][]>>(new Map())
  const [activeSheetId, setActiveSheetId] = useState('')
  const [script, setScript] = useState(
    () => localStorage.getItem('genoffice-sql-last-script') ?? STARTER_SQL,
  )
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(chinese ? '正在读取工作簿结构…' : 'Reading workbook schema…')
  const [allowWrites, setAllowWrites] = useState(false)
  const [results, setResults] = useState<readonly SqlExecutionResult[]>([])
  const [resultIndex, setResultIndex] = useState(0)
  const [aiPrompt, setAiPrompt] = useState('')
  const [lastAiRequest, setLastAiRequest] = useState<{
    readonly question: string
    readonly attachments: readonly AttachmentMeta[]
  } | null>(null)
  const [aiDragOver, setAiDragOver] = useState(false)
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})
  const previewRequestedRef = useRef(new Set<string>())
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  useEffect(() => {
    const alive = new Set(attachments.map((attachment) => attachment.path))
    setAttachmentPreviews((previous) => {
      const stale = Object.keys(previous).filter((path) => !alive.has(path))
      if (stale.length === 0) return previous
      const next = { ...previous }
      for (const path of stale) delete next[path]
      return next
    })
    for (const path of previewRequestedRef.current) {
      if (!alive.has(path)) previewRequestedRef.current.delete(path)
    }
    for (const attachment of attachments) {
      if (
        !ATTACHMENT_IMAGE_EXTS.has(attachment.ext) ||
        previewRequestedRef.current.has(attachment.path)
      )
        continue
      previewRequestedRef.current.add(attachment.path)
      void window.desktopApi.readAttachmentImage(attachment.path).then((result) => {
        if (!previewRequestedRef.current.has(attachment.path)) return
        if (result.ok && result.base64 && result.mime) {
          setAttachmentPreviews((previous) => ({
            ...previous,
            [attachment.path]: `data:${result.mime};base64,${result.base64}`,
          }))
        }
      })
    }
  }, [attachments])

  useEffect(() => {
    if (!file) {
      setLoading(false)
      setNotice(chinese ? '请先打开一个 Excel 工作簿。' : 'Open an Excel workbook first.')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setNotice(
      chinese ? '正在把工作表装载为本地数据库…' : 'Loading worksheets into a local database…',
    )
    void inferWorkbookDatabase({
      file,
      ...(journal ? { journal } : {}),
      readRange: (request) => window.desktopApi.readWorkbookRange(request),
      signal: controller.signal,
    })
      .then(async (inferred) => {
        if (controller.signal.aborted) return
        const stored = loadStoredSchema(workbookDatabaseKey(file))
        const inferredIds = new Set(inferred.schema.tables.map((table) => table.sheetId))
        const usableStored = stored?.tables.every((table) => inferredIds.has(table.sheetId))
          ? stored
          : null
        const next = usableStored ?? inferred.schema
        await engine.load(next, materializeDatabase(next, inferred.matrices))
        setSchema(next)
        setMatrices(inferred.matrices)
        setActiveSheetId(next.tables[0]?.sheetId ?? '')
        onReady(next)
        setNotice(
          chinese
            ? `已装载 ${next.tables.length} 张表；数据仅存在于本次本地会话。`
            : `${next.tables.length} tables loaded; data remains in this local session.`,
        )
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setNotice(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // The SQL snapshot is intentionally rebuilt only when the workbook
    // session changes. Live cell edits are overlaid from the journal when the
    // workspace is opened, while callback identity changes must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.sessionId])

  useEffect(() => {
    localStorage.setItem('genoffice-sql-last-script', script)
  }, [script])

  const activeTable = schema?.tables.find((table) => table.sheetId === activeSheetId) ?? null
  const activeResult = results[resultIndex] ?? null
  const aiSql = useMemo(() => sqlFromAiReply(aiReply), [aiReply])
  const schemaErrors = useMemo(() => (schema ? validateDatabaseSchema(schema) : []), [schema])

  const applySchema = async (): Promise<void> => {
    if (!schema || schemaErrors.length > 0) return
    try {
      await engine.load(schema, materializeDatabase(schema, matrices))
      saveStoredSchema(schema)
      onReady(schema)
      setNotice(
        chinese ? '结构与键设置已永久保存在本机。' : 'Schema and key settings saved locally.',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const runSource = async (source: string): Promise<void> => {
    if (!schema || schemaErrors.length > 0) return
    try {
      const editor = editorRef.current?.view
      if (editor) editor.dispatch(setDiagnostics(editor.state, []))
      // Rebuild before each run so field/type edits in the inspector take effect.
      await engine.load(schema, materializeDatabase(schema, matrices))
      const execution = await engine.execute(source, { readOnly: !allowWrites })
      setResults(execution.results)
      setResultIndex(Math.max(0, execution.results.length - 1))
      if (execution.error) {
        if (editor) {
          editor.dispatch(
            setDiagnostics(editor.state, [
              {
                from: execution.error.statement.startOffset,
                to: Math.max(
                  execution.error.statement.startOffset + 1,
                  execution.error.statement.endOffset,
                ),
                severity: 'error',
                message: execution.error.message,
              },
            ]),
          )
        }
        setNotice(
          `${chinese ? '第' : 'Line '}${execution.error.line}${chinese ? ' 行' : ''}: ${execution.error.message}`,
        )
      } else {
        const last = execution.results.at(-1)
        setNotice(
          last ? resultLabel(last) : chinese ? '没有可执行语句。' : 'No executable statement.',
        )
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const runScript = (): void => void runSource(script)

  const runCurrent = (): void => {
    const selection = editorRef.current?.view?.state.selection.main
    if (!selection) return
    const source = sqlForSelectionOrCursor(script, selection)
    if (!source) {
      setNotice(
        chinese
          ? '请选中 SQL，或把光标放在一条语句中。'
          : 'Select SQL or place the cursor in a statement.',
      )
      return
    }
    void runSource(source)
  }

  return (
    <div className="sql-workspace-backdrop" role="presentation">
      <section className="sql-workspace" role="dialog" aria-modal="true" aria-label="SQL database">
        <header className="sql-workspace-header">
          <div>
            <span className="sql-kicker">ZENOFFICE DATA LAB</span>
            <h2>{chinese ? '工作簿数据库' : 'Workbook Database'}</h2>
            <p>{file?.name ?? (chinese ? '未打开工作簿' : 'No workbook open')}</p>
          </div>
          <div className="sql-header-actions">
            <span className={`sql-status-dot${loading ? ' loading' : ''}`} />
            <span className="sql-notice">{notice}</span>
            <button type="button" onClick={onClose} aria-label={chinese ? '关闭' : 'Close'}>
              ×
            </button>
          </div>
        </header>

        <div className="sql-workspace-grid">
          <aside className="sql-catalog">
            <div className="sql-section-title">
              <span>{chinese ? '数据表' : 'TABLES'}</span>
              <b>{schema?.tables.length ?? 0}</b>
            </div>
            {schema?.tables.map((table) => (
              <button
                key={table.sheetId}
                className={table.sheetId === activeSheetId ? 'active' : ''}
                type="button"
                onClick={() => setActiveSheetId(table.sheetId)}
              >
                <span className="sql-table-glyph">▦</span>
                <span>
                  <strong>{table.tableName}</strong>
                  <small>
                    {table.columns.length} {chinese ? '个字段' : 'fields'}
                  </small>
                </span>
              </button>
            ))}
            <div className="sql-catalog-note">
              <strong>{chinese ? '关系模型' : 'Relational model'}</strong>
              <span>
                {chinese
                  ? '工作簿是数据库；工作表是表。键设置只保存在本机。'
                  : 'Workbook as database; sheets as tables. Keys stay local.'}
              </span>
            </div>
          </aside>

          <main className="sql-console">
            <form
              className={`sql-ai-bar${aiDragOver ? ' is-dragover' : ''}`}
              onSubmit={(event) => {
                event.preventDefault()
                const question = aiPrompt.trim()
                if (!question || aiBusy || !aiConfigured) return
                setLastAiRequest({ question, attachments: [...attachments] })
                onAskAi(question)
                setAiPrompt('')
              }}
              onDragEnter={(event) => {
                event.preventDefault()
                setAiDragOver(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setAiDragOver(false)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                setAiDragOver(false)
                const paths = Array.from(event.dataTransfer.files)
                  .map((file) => window.desktopApi.getPathForFile(file))
                  .filter(Boolean)
                if (paths.length > 0) onAddAttachmentPaths(paths)
              }}
            >
              <div className="sql-ai-heading">
                <span className="sql-ai-mark" aria-hidden="true">
                  ✦
                </span>
                <div className="sql-ai-copy">
                  <strong>ZenMux AI · SQL</strong>
                  <small>
                    {aiBusy
                      ? chinese
                        ? '正在读取真实表结构、生成并验证查询…'
                        : 'Reading the real schema, generating and verifying SQL…'
                      : aiReply
                        ? aiReply
                            .replace(/```[a-z]*|```/gi, '')
                            .replace(/\s+/g, ' ')
                            .slice(0, 220)
                        : chinese
                          ? '用自然语言提问；可添加最多 5 个附件、拖放文件或粘贴图片。AI 会读取真实字段并运行只读查询。'
                          : 'Ask in plain language; attach up to 5 files, drop files, or paste images. AI reads real fields and runs a read-only query.'}
                  </small>
                </div>
              </div>
              {attachNotice && <div className="ai-attach-notice">{attachNotice}</div>}
              {attachments.length > 0 && (
                <div className="ai-attachments sql-ai-attachments">
                  {attachments.map((attachment) =>
                    ATTACHMENT_IMAGE_EXTS.has(attachment.ext) ? (
                      <span
                        key={attachment.path}
                        className="ai-attachment-thumb"
                        title={attachment.path}
                      >
                        {attachmentPreviews[attachment.path] ? (
                          <img src={attachmentPreviews[attachment.path]} alt={attachment.name} />
                        ) : (
                          <span className="ai-attachment-thumb-pending" aria-hidden>
                            <img src={fileImageIcon} alt="" />
                          </span>
                        )}
                        <button
                          className="ai-attachment-thumb-remove"
                          type="button"
                          onClick={() => onRemoveAttachment(attachment.path)}
                          aria-label={chinese ? '移除附件' : 'Remove attachment'}
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <span
                        key={attachment.path}
                        className="ai-attachment-card"
                        title={attachment.path}
                      >
                        <span className="ai-attachment-card-icon">
                          <AttachmentCardIcon ext={attachment.ext} />
                        </span>
                        <span className="ai-attachment-card-meta">
                          <span className="ai-attachment-card-name">
                            {truncateCardName(attachment.name)}
                          </span>
                          <span className="ai-attachment-card-size">
                            {formatAttachmentSize(attachment.sizeBytes)}
                          </span>
                        </span>
                        <button
                          className="ai-attachment-thumb-remove"
                          type="button"
                          onClick={() => onRemoveAttachment(attachment.path)}
                          aria-label={chinese ? '移除附件' : 'Remove attachment'}
                        >
                          ×
                        </button>
                      </span>
                    ),
                  )}
                </div>
              )}
              <div className="sql-ai-composer">
                <button
                  className="ai-attach-btn sql-ai-attach"
                  type="button"
                  onClick={onPickAttachments}
                  title={chinese ? '添加附件（最多 5 个）' : 'Add attachments (up to 5)'}
                  aria-label={chinese ? '添加附件' : 'Add attachments'}
                >
                  <img src={attachIcon} alt="" aria-hidden />
                </button>
                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData.files)
                    if (files.length === 0) return
                    const paths: string[] = []
                    for (const file of files) {
                      const path = window.desktopApi.getPathForFile(file)
                      if (path) paths.push(path)
                      else {
                        const ext =
                          PASTE_MIME_EXT[file.type] ??
                          file.name.split('.').pop()?.toLowerCase() ??
                          'bin'
                        void file.arrayBuffer().then((data) => onAddPastedImage(data, ext))
                      }
                    }
                    if (paths.length > 0) onAddAttachmentPaths(paths)
                  }}
                  placeholder={
                    aiConfigured
                      ? chinese
                        ? '例如：按项目类型汇总预算，并按总额降序排列'
                        : 'Example: total budget by project type, highest first'
                      : chinese
                        ? '请先在设置中配置 ZenMux API Key'
                        : 'Configure a ZenMux API Key in Settings first'
                  }
                  disabled={!aiConfigured || aiBusy}
                  aria-label={
                    chinese ? '向 ZenMux AI 描述 SQL 查询' : 'Describe a SQL query to ZenMux AI'
                  }
                />
                <div className="sql-ai-actions">
                  {aiFailed && lastAiRequest && !aiBusy && (
                    <button
                      className="sql-ai-insert"
                      type="button"
                      onClick={() => onAskAi(lastAiRequest.question, lastAiRequest.attachments)}
                    >
                      {chinese ? '重试原请求' : 'Retry request'}
                    </button>
                  )}
                  {aiSql && !aiBusy && (
                    <button
                      className="sql-ai-insert"
                      type="button"
                      onClick={() => setScript(aiSql)}
                    >
                      {chinese ? '插入 AI SQL' : 'Insert AI SQL'}
                    </button>
                  )}
                  <button
                    className="sql-ai-submit"
                    type="submit"
                    disabled={!aiConfigured || aiBusy || !aiPrompt.trim()}
                  >
                    {aiBusy
                      ? chinese
                        ? '分析中…'
                        : 'Working…'
                      : chinese
                        ? 'AI 生成并验证'
                        : 'Generate & verify'}
                  </button>
                </div>
              </div>
            </form>
            <div className="sql-console-toolbar">
              <button
                className="sql-run"
                type="button"
                onClick={runCurrent}
                disabled={loading || !schema}
                title="Ctrl/Cmd + Enter"
              >
                ▶ {chinese ? '运行选中 / 当前语句' : 'Run selection / current'}
              </button>
              <button
                type="button"
                onClick={runScript}
                disabled={loading || !schema}
                title="Ctrl/Cmd + Shift + Enter"
              >
                ▶ {chinese ? '运行脚本' : 'Run script'}
              </button>
              <label className="sql-write-toggle">
                <input
                  type="checkbox"
                  checked={allowWrites}
                  onChange={(event) => setAllowWrites(event.target.checked)}
                />
                {chinese ? '允许本地会话写语句' : 'Allow session writes'}
              </label>
              <span>
                {allowWrites
                  ? chinese
                    ? '不会自动写回 Excel'
                    : 'Does not auto-write to Excel'
                  : chinese
                    ? '安全只读模式'
                    : 'Safe read-only mode'}
              </span>
            </div>
            <div
              onKeyDownCapture={(event) => {
                if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return
                event.preventDefault()
                event.stopPropagation()
                if (event.shiftKey) runScript()
                else runCurrent()
              }}
            >
              <CodeMirror
                ref={editorRef}
                className="sql-editor"
                value={script}
                height="250px"
                extensions={[sql(), lintGutter()]}
                onChange={setScript}
                basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
              />
            </div>
            <div className="sql-results-head">
              <div>
                <strong>{chinese ? '查询结果' : 'QUERY RESULTS'}</strong>
                <span>{activeResult ? resultLabel(activeResult) : '—'}</span>
              </div>
              <div className="sql-result-tabs">
                {results.map((result, index) => (
                  <button
                    key={`${result.statement.startOffset}-${index}`}
                    className={index === resultIndex ? 'active' : ''}
                    onClick={() => setResultIndex(index)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!activeResult || activeResult.rows.length === 0}
                  onClick={() => {
                    if (!activeResult) return
                    const message = onBackfill(activeResult.columns, activeResult.rows)
                    setNotice(
                      message ??
                        (chinese
                          ? '查询结果已回填到新的工作表。'
                          : 'Results written to a new sheet.'),
                    )
                  }}
                >
                  ↳ {chinese ? '回填 Excel' : 'Write to Excel'}
                </button>
                <button
                  type="button"
                  disabled={results.length === 0}
                  onClick={() => {
                    setResults([])
                    setResultIndex(0)
                    const editor = editorRef.current?.view
                    if (editor) editor.dispatch(setDiagnostics(editor.state, []))
                  }}
                >
                  {chinese ? '清空结果' : 'Clear'}
                </button>
              </div>
            </div>
            <div className="sql-result-scroll">
              {activeResult && activeResult.rows.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      {activeResult.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeResult.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {activeResult.columns.map((column) => (
                          <td key={column}>
                            {row[column] instanceof Date
                              ? row[column].toISOString()
                              : String(row[column] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="sql-empty-result">
                  {chinese
                    ? '运行 SELECT 查询后，可在这里预览并回填结果。'
                    : 'Run a SELECT query to preview and write results.'}
                </div>
              )}
            </div>
          </main>

          <aside className="sql-schema-panel">
            <div className="sql-section-title">
              <span>{chinese ? '表结构' : 'SCHEMA'}</span>
            </div>
            {activeTable && schema ? (
              <>
                <label className="sql-field-label">
                  {chinese ? 'SQL 表名' : 'SQL table name'}
                  <input
                    value={activeTable.tableName}
                    onChange={(event) =>
                      setSchema(
                        replaceTable(schema, activeTable.sheetId, (table) => ({
                          ...table,
                          tableName: event.target.value,
                        })),
                      )
                    }
                  />
                </label>
                <div className="sql-column-head">
                  <span>{chinese ? '字段 / 类型' : 'Field / type'}</span>
                  <span>PK · NULL</span>
                </div>
                <div className="sql-columns">
                  {activeTable.columns.map((column) => (
                    <div className="sql-column-row" key={column.sourceColumn}>
                      <input
                        value={column.name}
                        onChange={(event) =>
                          setSchema(
                            replaceTable(schema, activeTable.sheetId, (table) => ({
                              ...table,
                              columns: table.columns.map((item) =>
                                item.sourceColumn === column.sourceColumn
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            })),
                          )
                        }
                      />
                      <select
                        value={column.type}
                        onChange={(event) =>
                          setSchema(
                            replaceTable(schema, activeTable.sheetId, (table) => ({
                              ...table,
                              columns: table.columns.map((item) =>
                                item.sourceColumn === column.sourceColumn
                                  ? { ...item, type: event.target.value as typeof column.type }
                                  : item,
                              ),
                            })),
                          )
                        }
                      >
                        {SQL_COLUMN_TYPES.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                      <label
                        title={
                          chinese
                            ? '主键；可多选形成复合主键'
                            : 'Primary key; select several for a composite key'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={column.primaryKey}
                          onChange={(event) =>
                            setSchema(
                              replaceTable(schema, activeTable.sheetId, (table) => ({
                                ...table,
                                columns: table.columns.map((item) =>
                                  item.sourceColumn === column.sourceColumn
                                    ? {
                                        ...item,
                                        primaryKey: event.target.checked,
                                        nullable: event.target.checked ? false : item.nullable,
                                      }
                                    : item,
                                ),
                              })),
                            )
                          }
                        />
                        PK
                      </label>
                      <label title={chinese ? '允许空值' : 'Nullable'}>
                        <input
                          type="checkbox"
                          checked={column.nullable}
                          disabled={column.primaryKey}
                          onChange={(event) =>
                            setSchema(
                              replaceTable(schema, activeTable.sheetId, (table) => ({
                                ...table,
                                columns: table.columns.map((item) =>
                                  item.sourceColumn === column.sourceColumn
                                    ? { ...item, nullable: event.target.checked }
                                    : item,
                                ),
                              })),
                            )
                          }
                        />
                        NULL
                      </label>
                    </div>
                  ))}
                </div>
                <div className="sql-index-title">
                  <span>{chinese ? '次键 / 索引' : 'SECONDARY INDEXES'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const index: SqlIndexSchema = {
                        name: `idx_${activeTable.tableName}_${activeTable.indexes.length + 1}`,
                        columns: activeTable.columns[0] ? [activeTable.columns[0].name] : [],
                        unique: false,
                      }
                      setSchema(
                        replaceTable(schema, activeTable.sheetId, (table) => ({
                          ...table,
                          indexes: [...table.indexes, index],
                        })),
                      )
                    }}
                  >
                    ＋
                  </button>
                </div>
                {activeTable.indexes.map((index, indexPosition) => (
                  <div className="sql-index-row" key={`${index.name}-${indexPosition}`}>
                    <input
                      value={index.name}
                      onChange={(event) =>
                        setSchema(
                          replaceTable(schema, activeTable.sheetId, (table) => ({
                            ...table,
                            indexes: table.indexes.map((item, pos) =>
                              pos === indexPosition ? { ...item, name: event.target.value } : item,
                            ),
                          })),
                        )
                      }
                    />
                    <input
                      value={index.columns.join(', ')}
                      onChange={(event) =>
                        setSchema(
                          replaceTable(schema, activeTable.sheetId, (table) => ({
                            ...table,
                            indexes: table.indexes.map((item, pos) =>
                              pos === indexPosition
                                ? {
                                    ...item,
                                    columns: event.target.value
                                      .split(',')
                                      .map((value) => value.trim())
                                      .filter(Boolean),
                                  }
                                : item,
                            ),
                          })),
                        )
                      }
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={index.unique}
                        onChange={(event) =>
                          setSchema(
                            replaceTable(schema, activeTable.sheetId, (table) => ({
                              ...table,
                              indexes: table.indexes.map((item, pos) =>
                                pos === indexPosition
                                  ? { ...item, unique: event.target.checked }
                                  : item,
                              ),
                            })),
                          )
                        }
                      />
                      UQ
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSchema(
                          replaceTable(schema, activeTable.sheetId, (table) => ({
                            ...table,
                            indexes: table.indexes.filter((_, pos) => pos !== indexPosition),
                          })),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                {schemaErrors.length > 0 && (
                  <div className="sql-schema-errors">
                    {schemaErrors.map((error) => (
                      <span key={error}>{error}</span>
                    ))}
                  </div>
                )}
                <button
                  className="sql-save-schema"
                  type="button"
                  disabled={schemaErrors.length > 0}
                  onClick={() => void applySchema()}
                >
                  {chinese ? '保存结构并重建数据库' : 'Save schema & rebuild'}
                </button>
              </>
            ) : (
              <div className="sql-empty-result">
                {chinese ? '没有可配置的数据表。' : 'No configurable table.'}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  )
}
