import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, type WebContents } from 'electron'
import { copyFile, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, join, relative, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'
import { chatForProvider, defaultAiSettings, resolveAiSettings } from '@genoffice/ai-provider'
import { restoreAiSettingsFromDisk } from '@genoffice/electron-utils'
import { requestTranslationWithRetry } from './translation-retry'
import { translateNativePdf } from './native-pdf-translation'
import { NativePdfWorkbench } from './native-pdf-workbench'
import { PDF_CHANNELS } from '../shared/ipc'
import type { PdfTranslationOptions } from '../shared/pdf-engines'
const parseCraftResult = (
  result: import('../shared/pdf-engines').PdfEngineResult,
): Record<string, unknown> =>
  JSON.parse(result.content.find((c) => c.type === 'text')?.text || '{}')

export function registerPdfEnginesIpc(access: {
  has(id: number, path: string): boolean
  grant(id: number, path: string): void
}): void {
  const jobs = new Map<string, { owner: number; controller: AbortController }>()
  const sessions = new Map<number, { session: NativePdfWorkbench; root: string; doc: number }>()
  const closeSession = async (id: number) => {
    const entry = sessions.get(id)
    if (!entry) return
    sessions.delete(id)
    entry.session.close()
    await rm(entry.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
  const watched = new Set<number>()
  const watch = (wc: WebContents) => {
    if (watched.has(wc.id)) return
    watched.add(wc.id)
    wc.once('destroyed', () => {
      watched.delete(wc.id)
      void closeSession(wc.id).catch(() => {})
      for (const job of jobs.values()) if (job.owner === wc.id) job.controller.abort()
    })
  }
  const job = async <T>(
    wc: WebContents,
    id: string,
    run: (signal: AbortSignal, report: (message: string) => void) => Promise<T>,
  ): Promise<T> => {
    if (typeof id !== 'string' || jobs.has(id)) throw new Error('Invalid or duplicate request ID')
    watch(wc)
    const controller = new AbortController()
    jobs.set(id, { owner: wc.id, controller })
    try {
      return await run(controller.signal, (message) => {
        if (!wc.isDestroyed()) wc.send(PDF_CHANNELS.engineProgress, { requestId: id, message })
      })
    } finally {
      // Stop sibling paragraph requests and pending retry delays when a job ends.
      controller.abort()
      jobs.delete(id)
    }
  }
  const granted = (wc: WebContents, path: string) => {
    if (typeof path !== 'string' || !access.has(wc.id, path))
      throw new Error('PDF path not granted to this view')
  }
  ipcMain.handle(PDF_CHANNELS.engineCancel, (e, id: string) => {
    const entry = jobs.get(id)
    if (entry?.owner === e.sender.id) entry.controller.abort()
  })
  ipcMain.handle(
    PDF_CHANNELS.translateDocument,
    async (e, path: string, options: PdfTranslationOptions, id: string) => {
      granted(e.sender, path)
      return job(e.sender, id, async (signal, report) => {
        const settingsFile = join(app.getPath('userData'), 'ai-settings.json')
        const stored = existsSync(settingsFile)
          ? JSON.parse(await readFile(settingsFile, 'utf8'))
          : {}
        const settings = resolveAiSettings(
          restoreAiSettingsFromDisk(stored, safeStorage).settings,
          defaultAiSettings(),
        )
        const config = settings.providers[settings.provider]
        if (!config.apiKey || !config.model) throw new Error('请先在设置中配置 AI 模型与 API Key')
        const translationLog: string[] = []
        const output = await translateNativePdf(
          new Uint8Array(await readFile(path)),
          options,
          async (system, user) => {
            let response
            try {
              response = await requestTranslationWithRetry(
                () =>
                  chatForProvider(settings.provider, config, system, user, signal, (input, init) =>
                    net.fetch(input instanceof URL ? input.toString() : input, init),
                  ),
                signal,
                report,
              )
            } catch (error) {
              signal.throwIfAborted()
              const message = error instanceof Error ? error.message : ''
              const cause = (error as { cause?: { code?: string } } | null)?.cause?.code
              const code =
                message.match(/net::(ERR_[A-Z_]+)/)?.[1] ??
                (typeof cause === 'string' && /^[A-Z_]+$/.test(cause) ? cause : '')
              throw new Error(
                `保真翻译无法连接 AI 服务（${settings.provider} / ${config.model}）${code ? `：${code}` : ''}。请检查设置中的服务地址、网络连接和系统代理；若连接超时请稍后重试。原 PDF 未修改。`,
                { cause: error },
              )
            }
            if (!response.ok || !response.content)
              throw new Error(
                `AI 翻译服务返回错误：${response.error || '未返回译文'}。原 PDF 未修改。`,
              )
            return response.content
          },
          signal,
          (message) => {
            translationLog.push(message.trim())
            report(message)
          },
        )
        signal.throwIfAborted()
        const parent = BrowserWindow.fromWebContents(e.sender)
        const choice = await dialog.showOpenDialog(parent!, {
          title: '保存译文与双语 PDF',
          properties: ['openDirectory', 'createDirectory'],
        })
        if (choice.canceled || !choice.filePaths[0]) return []
        const directory = await mkdtemp(join(choice.filePaths[0], 'ZenOffice-translation-'))
        const base = basename(path).replace(/\.pdf$/i, '')
        const files = [join(directory, `${base}-mono.pdf`), join(directory, `${base}-dual.pdf`)]
        await writeFile(files[0]!, output.mono)
        await writeFile(files[1]!, output.dual)
        await writeFile(
          join(directory, 'translation-report.json'),
          JSON.stringify(output.report, null, 2),
        )
        await writeFile(join(directory, 'translation-log.txt'), translationLog.join('\n\n'), 'utf8')
        report(`原文、译文及公式保留记录已保存：${join(directory, 'translation-log.txt')}`)
        for (const file of files) access.grant(e.sender.id, file)
        return files
      })
    },
  )
  ipcMain.handle(PDF_CHANNELS.craftOpen, (e, path: string, id: string, password?: string) => {
    granted(e.sender, path)
    return job(e.sender, id, async (signal, _report) => {
      const root = await mkdtemp(join(app.getPath('temp'), 'zenoffice-pdfcraft-'))
      const copy = join(root, basename(path))
      await copyFile(path, copy)
      const session = new NativePdfWorkbench(root)
      const abort = () => session.close()
      signal.addEventListener('abort', abort, { once: true })
      try {
        const tools = await session.initialize()
        const result = await session.call('doc_open', {
          path: copy,
          ...(password ? { password } : {}),
        })
        const opened = parseCraftResult(result)
        const doc = Number(opened.doc ?? opened.id)
        if (!Number.isInteger(doc)) throw new Error('PdfCraft did not return a document ID')
        await closeSession(e.sender.id)
        sessions.set(e.sender.id, { session, root, doc })
        return { tools, result }
      } catch (error) {
        session.close()
        throw error
      } finally {
        signal.removeEventListener('abort', abort)
      }
    })
  })
  ipcMain.handle(PDF_CHANNELS.craftCall, async (e, tool: string, args: Record<string, unknown>) => {
    const entry = sessions.get(e.sender.id)
    if (!entry) throw new Error('Open the PDF workbench first')
    const result = await entry.session.call(tool, args)
    if (Number.isInteger(args.doc)) entry.doc = Number(args.doc)
    if (['doc_open', 'doc_create', 'doc_combine', 'doc_open_revision'].includes(tool)) {
      const value = parseCraftResult(result)
      if (Number.isInteger(value.doc)) entry.doc = Number(value.doc)
    }
    return result
  })
  ipcMain.handle(PDF_CHANNELS.craftPickPath, async (e, kind: 'file' | 'directory' | 'save') => {
    const entry = sessions.get(e.sender.id)
    if (!entry) throw new Error('Open the PDF workbench first')
    const parent = BrowserWindow.fromWebContents(e.sender)
    if (kind === 'save') {
      // Engine is root-confined; stage output here and export it with craftSave.
      return join(entry.root, `export-${Date.now()}.pdf`)
    }
    const choice = await dialog.showOpenDialog(parent!, {
      properties: kind === 'directory' ? ['openDirectory'] : ['openFile'],
    })
    if (choice.canceled || !choice.filePaths[0]) return null
    const source = choice.filePaths[0]
    const { cp } = await import('node:fs/promises')
    const target = join(entry.root, `import-${Date.now()}-${basename(source)}`)
    await cp(source, target, { recursive: true, dereference: false })
    return target
  })
  ipcMain.handle(PDF_CHANNELS.craftSave, async (e) => {
    const entry = sessions.get(e.sender.id)
    if (!entry) throw new Error('Open the PDF workbench first')
    const parent = BrowserWindow.fromWebContents(e.sender)
    const choice = await dialog.showSaveDialog(parent!, {
      title: 'Save PdfCraft result / 保存精排结果',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (choice.canceled || !choice.filePath) return null
    const staged = join(entry.root, 'zenoffice-result.pdf')
    await entry.session.call('doc_save', { doc: entry.doc, path: staged })
    // Validate the rewritten file by reopening it in the actual engine before exporting.
    const verified = parseCraftResult(await entry.session.call('doc_open', { path: staged }))
    await entry.session.call('doc_close', {
      doc: verified.doc ?? verified.id,
      discard_changes: true,
    })
    const destination = choice.filePath
    const temp = `${destination}.zenoffice-${crypto.randomUUID()}.tmp`
    const { rename } = await import('node:fs/promises')
    await copyFile(staged, temp)
    await rename(temp, destination)
    access.grant(e.sender.id, destination)
    return destination
  })
  ipcMain.handle(PDF_CHANNELS.craftFiles, async (e) => {
    const entry = sessions.get(e.sender.id)
    if (!entry) return []
    const files: { name: string; path: string }[] = []
    const visit = async (dir: string, depth = 0): Promise<void> => {
      if (depth > 8 || files.length >= 1000) return
      for (const item of await readdir(dir, { withFileTypes: true })) {
        if (files.length >= 1000) return
        const path = join(dir, item.name)
        if (item.isFile()) files.push({ name: relative(entry.root, path), path })
        else if (item.isDirectory()) await visit(path, depth + 1)
      }
    }
    await visit(entry.root)
    return files
  })
  ipcMain.handle(PDF_CHANNELS.craftExport, async (e, source: string) => {
    const entry = sessions.get(e.sender.id)
    if (!entry || typeof source !== 'string') throw new Error('No PDF output to export')
    const resolved = await realpath(source)
    const rel = relative(await realpath(entry.root), resolved)
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel))
      throw new Error('Output is outside the workbench')
    const parent = BrowserWindow.fromWebContents(e.sender)
    const choice = await dialog.showSaveDialog(parent!, { defaultPath: basename(source) })
    if (choice.canceled || !choice.filePath) return null
    const target = choice.filePath
    const temp = `${target}.zenoffice-${crypto.randomUUID()}.tmp`
    const { rename } = await import('node:fs/promises')
    await copyFile(resolved, temp)
    await rename(temp, target)
    access.grant(e.sender.id, target)
    return target
  })
  ipcMain.handle(PDF_CHANNELS.craftClose, (e) => {
    return closeSession(e.sender.id)
  })
}
