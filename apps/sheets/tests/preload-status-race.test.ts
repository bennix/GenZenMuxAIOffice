import { afterEach, expect, it, vi } from 'vitest'
import { createEditJournal } from '../src/renderer/edit-journal'
import { loadVisibleRange } from '../src/renderer/univer-sync'
import type { LazyWorkbookState, UniverRuntime } from '../src/renderer/univer-state'

afterEach(() => vi.unstubAllGlobals())

it('does not let a late viewport response overwrite a completed workbook status', async () => {
  let finish!: (result: unknown) => void
  const read = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  vi.stubGlobal('window', { desktopApi: { readWorkbookRange: read } })
  const worksheet = { getSheetId: () => 's', getVisibleRange: () => null }
  const runtime = {
    univerAPI: { getActiveWorkbook: () => ({ getActiveSheet: () => worksheet }) },
  } as unknown as UniverRuntime
  const state = {
    file: {
      sessionId: 'session',
      name: 'chart.xlsx',
      sheets: [{ id: 's', rowCount: 3, columnCount: 2, tables: [] }],
    },
    flags: { preloadComplete: false },
    formulaMode: true,
    editJournal: createEditJournal(),
    loadedRanges: new Map(),
    loadingKeys: new Map(),
    retryTimers: new Map(),
    sheetProtections: new Map(),
    appliedFilterSheets: new Set(),
    appliedDvSheets: new Set(),
    appliedCfSheets: new Set(),
  } as unknown as LazyWorkbookState
  const setMessage = vi.fn()
  const pending = loadVisibleRange(runtime, { current: state }, worksheet as never, setMessage)
  expect(read).toHaveBeenCalledOnce()
  // Full preload wins the race before this viewport request resolves.
  state.flags.preloadComplete = true
  state.loadedRanges.set('s', { startRow: 0, endRow: 2, startColumn: 0, endColumn: 1 })
  finish({
    indexingComplete: true,
    indexedThroughRow: 2,
    cells: [],
    rows: [],
    merges: [],
    hyperlinks: [],
    conditionalRules: [],
    dataValidations: [],
    autoFilter: null,
  })
  await pending
  expect(state.sheetProtections.has('s')).toBe(true)
  expect(setMessage).not.toHaveBeenCalled()
})
