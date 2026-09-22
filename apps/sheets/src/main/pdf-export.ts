/// PDF export: renders the print HTML (laid out by the renderer) in a hidden
/// scripting-disabled window and writes webContents.printToPDF's output where
/// the save dialog points.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BrowserWindow, dialog } from 'electron'

import { showSaveDialogWithMemory } from '@genoffice/electron-utils'

import type { IpcMainInvokeEvent } from 'electron'
import type { WorkbookExportPdfRequest, WorkbookExportPdfResult } from '../shared/desktop-api'
import type { WorkbookPrintRequest } from '../shared/desktop-api'

export async function exportPdf(
  event: IpcMainInvokeEvent,
  request: WorkbookExportPdfRequest,
): Promise<WorkbookExportPdfResult> {
  const parent = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions = {
    defaultPath: request.fileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  }
  const selection = await showSaveDialogWithMemory(dialog, parent, dialogOptions)
  if (selection.canceled || !selection.filePath) return { canceled: true }

  const workDir = await mkdtemp(join(tmpdir(), 'ai-excel-pdf-'))
  const htmlPath = join(workDir, 'print.html')
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false },
  })
  try {
    await writeFile(htmlPath, request.html, 'utf8')
    await window.loadFile(htmlPath)
    const pdf = await window.webContents.printToPDF({
      landscape: request.landscape,
      pageSize: request.pageSize,
      margins: request.margins,
      scale: request.scale,
      printBackground: true,
    })
    await writeFile(selection.filePath, pdf)
    return { canceled: false, path: selection.filePath }
  } finally {
    window.destroy()
    await rm(workDir, { recursive: true, force: true })
  }
}

/** Opens an application preview of the exact paginated HTML. Printing uses the
 * platform's native dialog; on Windows the window is deliberately shown and
 * focused first so the system panel cannot appear behind the main window. */
export async function printWorkbook(
  event: IpcMainInvokeEvent,
  request: WorkbookPrintRequest,
): Promise<{ ok: boolean; error?: string }> {
  const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const workDir = await mkdtemp(join(tmpdir(), 'zenoffice-sheet-print-'))
  const htmlPath = join(workDir, 'print.html')
  const window = new BrowserWindow({
    ...(parent ? { parent } : {}),
    width: 1100,
    height: 820,
    show: false,
    title: `${request.fileName} — ${request.mode === 'preview' ? 'Print Preview (⌘/Ctrl+P to print)' : 'Print'}`,
    webPreferences: { sandbox: true, javascript: false },
  })
  const cleanup = async () => {
    if (!window.isDestroyed()) window.destroy()
    await rm(workDir, { recursive: true, force: true })
  }
  const systemPrint = () => {
    if (window.isDestroyed()) return
    window.show()
    window.focus()
    window.webContents.print(
      {
        silent: false,
        printBackground: true,
        landscape: request.landscape,
        pageSize: request.pageSize,
        margins: { marginType: 'custom', ...request.margins },
        scaleFactor: Math.round(request.scale * 100),
      },
      (_success, failureReason) => {
        if (request.mode === 'print') void cleanup()
        else if (failureReason && failureReason !== 'Print job canceled') {
          console.error('[sheets] print failed:', failureReason)
        }
      },
    )
  }
  try {
    await writeFile(htmlPath, request.html, 'utf8')
    await window.loadFile(htmlPath)
    window.webContents.on('before-input-event', (event, input) => {
      if ((input.meta || input.control) && input.key.toLowerCase() === 'p') {
        event.preventDefault()
        systemPrint()
      }
    })
    window.on('closed', () => void rm(workDir, { recursive: true, force: true }))
    window.show()
    window.focus()
    if (request.mode === 'print') systemPrint()
    return { ok: true }
  } catch (error) {
    await cleanup()
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
