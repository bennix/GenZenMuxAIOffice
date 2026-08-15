import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { showOpenDialogWithMemory } from '@genoffice/electron-utils'
import { parseFileToText } from '@genoffice/file-parse'
import {
  ATTACHMENT_IMAGE_EXTS,
  PDF_CHANNELS,
  type AttachmentAddResult,
  type AttachmentImageResult,
  type AttachmentMeta,
  type AttachmentReadResult,
} from '../shared/ipc'

const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
const ATTACHMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const ATTACHMENT_TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'log',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'java',
  'c',
  'h',
  'cpp',
  'go',
  'rs',
  'rb',
  'sh',
  'sql',
  'css',
])
const ATTACHMENT_EXTS = new Set([
  ...ATTACHMENT_TEXT_EXTS,
  'docx',
  'pdf',
  'pptx',
  'ppt',
  'xlsx',
  'xls',
  ...ATTACHMENT_IMAGE_EXTS,
])
const ATTACHMENT_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

const attachmentTextCache = new Map<string, { stamp: string; text: string }>()
let pastedImageSeq = 0

function message(zh: string, en: string): string {
  return `${zh} / ${en}`
}

function statAttachment(filePath: string): { meta?: AttachmentMeta; error?: string } {
  const name = basename(filePath)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (!ATTACHMENT_EXTS.has(ext)) {
    return { error: `${name}: ${message('不支持此文件类型', 'Unsupported file type')}` }
  }
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return { error: `${name}: ${message('不是文件', 'Not a file')}` }
    if (stat.size > ATTACHMENT_MAX_BYTES) {
      return { error: `${name}: ${message('文件超过 50 MB', 'File exceeds 50 MB')}` }
    }
    if (ATTACHMENT_IMAGE_EXTS.has(ext) && stat.size > ATTACHMENT_IMAGE_MAX_BYTES) {
      return { error: `${name}: ${message('图片超过 5 MB', 'Image exceeds 5 MB')}` }
    }
    return { meta: { path: filePath, name, ext, sizeBytes: stat.size } }
  } catch {
    return { error: `${name}: ${message('无法读取', 'Unreadable')}` }
  }
}

function collectAttachments(paths: unknown): AttachmentAddResult {
  if (!Array.isArray(paths)) {
    return { accepted: [], rejected: [message('附件路径无效', 'Invalid attachment paths')] }
  }
  const accepted: AttachmentMeta[] = []
  const rejected: string[] = []
  for (const path of paths.slice(0, 50)) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 4096) {
      rejected.push(message('附件路径无效', 'Invalid attachment path'))
      continue
    }
    const result = statAttachment(path)
    if (result.meta) accepted.push(result.meta)
    else if (result.error) rejected.push(result.error)
  }
  return { accepted, rejected }
}

function savePastedImage(data: unknown, ext: unknown): string | null {
  const cleanExt = typeof ext === 'string' ? ext.toLowerCase() : ''
  if (!ATTACHMENT_IMAGE_EXTS.has(cleanExt)) return null
  const bytes =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : null
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > ATTACHMENT_IMAGE_MAX_BYTES) return null
  const dir = join(app.getPath('temp'), 'genoffice-pasted')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const filePath = join(dir, `pdf-pasted-${stamp}-${++pastedImageSeq}.${cleanExt}`)
  writeFileSync(filePath, bytes)
  return filePath
}

async function extractAttachmentText(filePath: string): Promise<string> {
  const stat = statSync(filePath)
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const cached = attachmentTextCache.get(filePath)
  if (cached?.stamp === stamp) return cached.text
  if (stat.size > ATTACHMENT_MAX_BYTES) throw new Error(message('文件过大', 'File is too large'))
  const parsed = await parseFileToText(filePath)
  if (!parsed.ok || parsed.kind !== 'text' || parsed.text == null) {
    throw new Error(parsed.error ?? message('无法解析附件', 'Could not parse attachment'))
  }
  attachmentTextCache.set(filePath, { stamp, text: parsed.text })
  if (attachmentTextCache.size > 8) {
    const oldest = attachmentTextCache.keys().next().value
    if (oldest) attachmentTextCache.delete(oldest)
  }
  return parsed.text
}

export function registerPdfAttachmentIpc(): void {
  ipcMain.handle(PDF_CHANNELS.filesPick, async (event): Promise<AttachmentAddResult | null> => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const options = {
      title: message('添加附件', 'Add attachments'),
      filters: [
        { name: message('支持的文件', 'Supported files'), extensions: [...ATTACHMENT_EXTS] },
        { name: message('所有文件', 'All files'), extensions: ['*'] },
      ],
      properties: ['openFile' as const, 'multiSelections' as const],
    }
    const result = await showOpenDialogWithMemory(dialog, parent ?? undefined, options)
    if (result.canceled || result.filePaths.length === 0) return null
    return collectAttachments(result.filePaths)
  })

  ipcMain.handle(PDF_CHANNELS.filesAdd, (_event, paths: unknown) => collectAttachments(paths))

  ipcMain.handle(
    PDF_CHANNELS.filesRead,
    async (
      _event,
      filePath: unknown,
      offset: unknown,
      maxChars: unknown,
    ): Promise<AttachmentReadResult> => {
      if (typeof filePath !== 'string') {
        return { ok: false, error: message('附件路径无效', 'Invalid attachment path') }
      }
      const meta = statAttachment(filePath)
      if (!meta.meta) return { ok: false, error: meta.error }
      if (ATTACHMENT_IMAGE_EXTS.has(meta.meta.ext)) {
        return { ok: false, error: message('图片已随消息发送给 AI', 'Image is sent to AI') }
      }
      try {
        const text = await extractAttachmentText(filePath)
        const start = Math.max(0, Math.floor(Number(offset)) || 0)
        const size = Math.min(Math.max(1, Math.floor(Number(maxChars)) || 1), 48_000)
        return {
          ok: true,
          name: meta.meta.name,
          totalChars: text.length,
          offset: start,
          text: text.slice(start, start + size),
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    PDF_CHANNELS.filesReadImage,
    (_event, filePath: unknown): AttachmentImageResult => {
      if (typeof filePath !== 'string') {
        return { ok: false, error: message('附件路径无效', 'Invalid attachment path') }
      }
      const meta = statAttachment(filePath)
      if (!meta.meta) return { ok: false, error: meta.error }
      const mime = ATTACHMENT_IMAGE_MIME[meta.meta.ext]
      if (!mime) return { ok: false, error: message('附件不是图片', 'Attachment is not an image') }
      try {
        return { ok: true, base64: readFileSync(filePath).toString('base64'), mime }
      } catch {
        return { ok: false, error: message('无法读取图片', 'Could not read image') }
      }
    },
  )

  ipcMain.handle(
    PDF_CHANNELS.filesAddPastedImage,
    (_event, data: unknown, ext: unknown): AttachmentAddResult => {
      const filePath = savePastedImage(data, ext)
      return filePath
        ? collectAttachments([filePath])
        : {
            accepted: [],
            rejected: [message('剪贴板图片无效或超过 5 MB', 'Invalid or oversized image')],
          }
    },
  )
}
