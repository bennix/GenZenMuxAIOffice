import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditJournal } from '../src/renderer/edit-journal'
import { readVisualizationRange } from '../src/renderer/univer-sync'
import type { LazyWorkbookState, UniverRuntime } from '../src/renderer/univer-state'

function harness() {
  const raw = vi.fn(() => [['Amount'], [42]])
  const target = { getRange: () => ({ getRawValues: raw }) }
  const runtime = {
    univerAPI: { getActiveWorkbook: () => ({ getSheetBySheetId: () => target }) },
  } as unknown as UniverRuntime
  const state = {
    file: { sessionId: 'test', sheets: [{ id: 's', rowCount: 100000, columnCount: 2 }] },
    formulaMode: false,
    flags: { preloadComplete: false },
    editJournal: createEditJournal(),
    recalc: { overlay: new Map() },
    closure: { pinned: new Map() },
  } as unknown as LazyWorkbookState
  const read = vi.fn(async ({ range }: { range: { startRow: number; endRow: number } }) => ({
    indexingComplete: true,
    indexedThroughRow: 100000,
    cells: [{ row: range.startRow, column: 0, value: range.startRow + 1 }],
  }))
  vi.stubGlobal('window', { desktopApi: { readWorkbookRange: read } })
  return { runtime, state, read, raw }
}

afterEach(() => vi.unstubAllGlobals())

describe('visualization range snapshot', () => {
  it('reads unloaded regions in bounded batches and preserves unsaved values and clearing', async () => {
    const { runtime, state, read, raw } = harness()
    state.editJournal.cells.set(
      's',
      new Map([
        ['1:0', { row: 1, column: 0, hasValue: true, value: 99 }],
        ['9000:0', { row: 9000, column: 0, hasValue: true, value: null }],
      ]),
    )
    state.recalc.overlay.set(
      's',
      new Map([
        ['1:0', { v: 12 }],
        ['9000:0', { v: 23 }],
      ]),
    )
    const result = await readVisualizationRange(state, runtime, 's', {
      startRow: 0,
      endRow: 19999,
      startColumn: 0,
      endColumn: 1,
    })
    expect(read).toHaveBeenCalledTimes(3)
    expect(raw).not.toHaveBeenCalled()
    expect(result[1]![0]).toBe(99)
    expect(result[9000]![0]).toBeNull()
    expect(result[18000]![0]).toBe(18001)
    expect(result).toHaveLength(20000)
  })

  it('rejects incompletely indexed selections rather than treating them as empty', async () => {
    const { runtime, state, read } = harness()
    read.mockResolvedValue({ indexingComplete: false, indexedThroughRow: 0, cells: [] })
    await expect(
      readVisualizationRange(state, runtime, 's', {
        startRow: 0,
        endRow: 2,
        startColumn: 0,
        endColumn: 1,
      }),
    ).rejects.toThrow()
  })

  it('uses raw runtime values for new sheets and fully loaded formula workbooks', async () => {
    const { runtime, state, read } = harness()
    const bounds = { startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 }
    expect(await readVisualizationRange(state, runtime, 'new', bounds)).toEqual([['Amount'], [42]])
    expect(
      await readVisualizationRange(
        { ...state, formulaMode: true, flags: { preloadComplete: true } },
        runtime,
        's',
        bounds,
      ),
    ).toEqual([['Amount'], [42]])
    expect(read).not.toHaveBeenCalled()
    await expect(
      readVisualizationRange({ ...state, formulaMode: true }, runtime, 's', bounds),
    ).rejects.toThrow('加载')
  })

  it('rejects structural changes during asynchronous reads', async () => {
    const { runtime, state, read } = harness()
    read.mockImplementation(async () => {
      state.editJournal.structuralOps.set('s', [{ kind: 'insert-rows', index: 1, count: 1 }])
      return { indexingComplete: true, indexedThroughRow: 100000, cells: [] }
    })
    await expect(
      readVisualizationRange(state, runtime, 's', {
        startRow: 0,
        endRow: 2,
        startColumn: 0,
        endColumn: 1,
      }),
    ).rejects.toThrow('行列结构')
  })
})
