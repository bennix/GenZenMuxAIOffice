import { spawn } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, extname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildBlankDocx,
  parseDocx,
  saveDocx,
  type Run,
  type SaveBlock,
} from '@genoffice/docx-engine'
import WordExtractor from 'word-extractor'

const MAX_LEGACY_DOC_BYTES = 100 * 1024 * 1024
const CONVERSION_TIMEOUT_MS = 60_000

export type LegacyDocImportMode = 'libreoffice' | 'text-recovery'

export interface LegacyDocImportResult {
  readonly path: string
  readonly mode: LegacyDocImportMode
}

export interface LegacyDocImportOptions {
  /** Plain-text recovery loses layout and must therefore require explicit user consent. */
  readonly allowTextRecovery?: boolean
}

export class LegacyDocFidelityError extends Error {
  constructor() {
    super(
      'A layout-preserving Word converter is unavailable. Text-only recovery would lose fonts, spacing, tables, and pagination.',
    )
    this.name = 'LegacyDocFidelityError'
  }
}

export type WordContainerKind = 'ooxml' | 'ole' | 'html' | 'unknown'

/**
 * Word and WPS documents in the wild frequently have misleading extensions:
 * HTML may be saved as .doc, and an OLE Word 97 document may be named .docx.
 * Route by the container signature so the OOXML parser never receives either.
 */
export function sniffWordContainer(path: string): WordContainerKind {
  if (!isAbsolute(path) || !existsSync(path)) return 'unknown'
  const head = Buffer.allocUnsafe(4096)
  let descriptor: number
  try {
    if (!statSync(path).isFile()) return 'unknown'
    descriptor = openSync(path, 'r')
  } catch {
    return 'unknown'
  }
  let bytesRead = 0
  try {
    bytesRead = readSync(descriptor, head, 0, head.length, 0)
  } finally {
    closeSync(descriptor)
  }
  const sampleBytes = head.subarray(0, bytesRead)
  if (sampleBytes.length >= 4 && sampleBytes[0] === 0x50 && sampleBytes[1] === 0x4b) return 'ooxml'
  if (
    sampleBytes.length >= 8 &&
    sampleBytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  ) {
    return 'ole'
  }
  const sample = sampleBytes
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase()
  if (/^(?:<!doctype\s+html\b|<html\b|<head\b|<meta\b)/.test(sample)) return 'html'
  return 'unknown'
}

interface ExtractedWordDocument {
  getBody(options?: { filterUnicode?: boolean }): string
}

function executableCandidates(): string[] {
  // An explicit override is authoritative. Besides making deployments
  // predictable, this lets callers verify the no-converter path without
  // accidentally picking up a different soffice from PATH.
  if (process.env.GENOFFICE_SOFFICE_PATH !== undefined) {
    const configured = process.env.GENOFFICE_SOFFICE_PATH
    return configured && isAbsolute(configured) && existsSync(configured) ? [configured] : []
  }
  const candidates = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/snap/bin/libreoffice',
  ]
  if (process.platform === 'win32') {
    for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (root) candidates.push(join(root, 'LibreOffice', 'program', 'soffice.exe'))
    }
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory)
      candidates.push(join(directory, process.platform === 'win32' ? 'soffice.exe' : 'soffice'))
  }
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))].filter(
    (value) => isAbsolute(value) && existsSync(value),
  )
}

function safeStem(path: string): string {
  const withoutControls = Array.from(basename(path, extname(path)), (character) =>
    character.charCodeAt(0) < 32 ? '_' : character,
  ).join('')
  const stem = withoutControls.trim().replace(/[<>:"/\\|?*]/g, '_')
  return stem || 'Legacy Word Document'
}

export function nextConvertedDocxPath(sourcePath: string, outputDirectory: string): string {
  const stem = `${safeStem(sourcePath)}-converted`
  let candidate = join(outputDirectory, `${stem}.docx`)
  for (let suffix = 2; existsSync(candidate); suffix += 1) {
    candidate = join(outputDirectory, `${stem}-${suffix}.docx`)
  }
  return candidate
}

function runSoffice(
  executable: string,
  sourcePath: string,
  outputDirectory: string,
  userProfileDirectory: string,
  convertTo = 'docx:Office Open XML Text',
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      executable,
      [
        `-env:UserInstallation=${pathToFileURL(userProfileDirectory).href}`,
        '--headless',
        '--convert-to',
        convertTo,
        '--outdir',
        outputDirectory,
        sourcePath,
      ],
      { stdio: 'ignore', windowsHide: true },
    )
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(false)
    }, CONVERSION_TIMEOUT_MS)
    child.once('error', () => finish(false))
    child.once('exit', (code) => finish(code === 0))
  })
}

/** Convert an in-memory OOXML document to a genuine Word 97-2003 OLE file. */
export async function docxToLegacyDoc(docxBytes: Uint8Array): Promise<Uint8Array> {
  if (docxBytes.length === 0 || docxBytes.length > MAX_LEGACY_DOC_BYTES) {
    throw new Error('The DOCX document is empty or exceeds the 100 MB conversion limit.')
  }
  const scratch = mkdtempSync(join(tmpdir(), 'genoffice-doc-export-'))
  try {
    const sourcePath = join(scratch, 'source.docx')
    const userProfileDirectory = join(scratch, 'libreoffice-profile')
    writeFileSync(sourcePath, docxBytes)
    for (const executable of executableCandidates()) {
      if (
        !(await runSoffice(executable, sourcePath, scratch, userProfileDirectory, 'doc:MS Word 97'))
      ) {
        continue
      }
      const convertedPath = join(scratch, 'source.doc')
      if (existsSync(convertedPath) && statSync(convertedPath).isFile()) {
        return readFileSync(convertedPath)
      }
    }
    throw new Error('Word 97-2003 export requires LibreOffice, but no working converter was found.')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

async function tryLibreOffice(sourcePath: string, targetPath: string): Promise<boolean> {
  const scratch = mkdtempSync(join(tmpdir(), 'genoffice-doc-import-'))
  try {
    // LibreOffice selects its input filter partly from the filename. Word-produced
    // HTML carrying a .doc suffix otherwise opens, but fails during DOCX export.
    const conversionSource =
      sniffWordContainer(sourcePath) === 'html' ? join(scratch, 'source.html') : sourcePath
    if (conversionSource !== sourcePath) copyFileSync(sourcePath, conversionSource)
    const userProfileDirectory = join(scratch, 'libreoffice-profile')
    for (const executable of executableCandidates()) {
      if (!(await runSoffice(executable, conversionSource, scratch, userProfileDirectory))) continue
      const converted = readdirSync(scratch)
        .filter((name) => /\.docx$/i.test(name))
        .map((name) => join(scratch, name))
        .find((path) => statSync(path).isFile())
      if (!converted) continue
      copyFileSync(converted, targetPath)
      return true
    }
    return false
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function recoveredParagraphs(text: string): string[] {
  const clean = Array.from(text, (character) => {
    const code = character.charCodeAt(0)
    return code === 0 || (code >= 1 && code <= 8) || (code >= 14 && code <= 31) ? '' : character
  })
    .join('')
    .replace(/\t/g, '    ')
  const paragraphs = clean.split(/\r\n|\r|\n|\v|\f/)
  while (paragraphs.length > 1 && paragraphs.at(-1) === '') paragraphs.pop()
  return paragraphs.length > 0 ? paragraphs : ['']
}

export async function legacyDocTextToDocx(text: string): Promise<Uint8Array> {
  const parsed = await parseDocx(await buildBlankDocx())
  const blocks: SaveBlock[] = recoveredParagraphs(text).map((paragraph) => ({
    kind: 'generated',
    block: {
      type: 'paragraph',
      runs: [{ text: paragraph } satisfies Run],
    },
  }))
  return saveDocx(parsed, blocks)
}

async function recoverText(sourcePath: string, targetPath: string): Promise<void> {
  if (sniffWordContainer(sourcePath) === 'html') {
    const body = legacyHtmlToText(readFileSync(sourcePath))
    if (!body.trim()) throw new Error('The legacy HTML Word document contains no recoverable text.')
    writeFileSync(targetPath, await legacyDocTextToDocx(body))
    return
  }
  const extractor = new WordExtractor()
  const document = (await extractor.extract(sourcePath)) as ExtractedWordDocument
  const body = document.getBody({ filterUnicode: false })
  if (!body.trim()) throw new Error('The legacy Word document contains no recoverable body text.')
  writeFileSync(targetPath, await legacyDocTextToDocx(body))
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: '\u00a0',
    quot: '"',
  }
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    if (key[0] === '#') {
      const hexadecimal = key[1]?.toLowerCase() === 'x'
      const codePoint = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    return named[key.toLowerCase()] ?? entity
  })
}

/** Recover readable paragraphs from Word/WPS "Save as Web Page" .doc files. */
export function legacyHtmlToText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes)
  const utf8 = raw.toString('utf8')
  const declared = /<meta[^>]+charset\s*=\s*["']?([^\s"'/>]+)/i.exec(utf8)?.[1]?.toLowerCase()
  let html = utf8
  if (
    (declared === 'gb2312' || declared === 'gbk' || declared === 'gb18030') &&
    utf8.includes('\ufffd')
  ) {
    try {
      html = new TextDecoder('gb18030').decode(raw)
    } catch {
      // UTF-8 recovery below remains preferable to refusing the document.
    }
  }
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html
  return decodeHtmlEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|xml)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|h[1-6]|li|tr|table|blockquote)\s*>/gi, '\n')
      .replace(/<\/\s*td\s*>/gi, '\t')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Import a binary Word 97-2003 file as a new DOCX copy. LibreOffice is used
 * when installed for the best layout fidelity. A pure-JS text extractor is
 * available only after explicit caller/user consent because it cannot retain
 * document formatting. The source file is always read-only.
 */
export async function importLegacyDoc(
  sourcePath: string,
  outputDirectory: string,
  options: LegacyDocImportOptions = {},
): Promise<LegacyDocImportResult> {
  if (!isAbsolute(sourcePath) || !/\.docx?$/i.test(sourcePath) || !existsSync(sourcePath)) {
    throw new Error('Invalid legacy Word document path.')
  }
  const sourceStat = statSync(sourcePath)
  if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > MAX_LEGACY_DOC_BYTES) {
    throw new Error('Legacy Word document is empty or exceeds the 100 MB import limit.')
  }
  mkdirSync(outputDirectory, { recursive: true })
  const targetPath = nextConvertedDocxPath(sourcePath, outputDirectory)
  if (await tryLibreOffice(sourcePath, targetPath)) {
    return { path: targetPath, mode: 'libreoffice' }
  }
  if (!options.allowTextRecovery) throw new LegacyDocFidelityError()
  try {
    await recoverText(sourcePath, targetPath)
    return { path: targetPath, mode: 'text-recovery' }
  } catch (error) {
    if (existsSync(targetPath)) rmSync(targetPath, { force: true })
    throw error
  }
}
