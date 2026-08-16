import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, extname, isAbsolute, join } from 'node:path'

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

interface ExtractedWordDocument {
  getBody(options?: { filterUnicode?: boolean }): string
}

function executableCandidates(): string[] {
  const candidates = [
    process.env.GENOFFICE_SOFFICE_PATH,
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
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      executable,
      ['--headless', '--convert-to', 'docx', '--outdir', outputDirectory, sourcePath],
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

async function tryLibreOffice(sourcePath: string, targetPath: string): Promise<boolean> {
  const scratch = mkdtempSync(join(tmpdir(), 'genoffice-doc-import-'))
  try {
    for (const executable of executableCandidates()) {
      if (!(await runSoffice(executable, sourcePath, scratch))) continue
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
  const extractor = new WordExtractor()
  const document = (await extractor.extract(sourcePath)) as ExtractedWordDocument
  const body = document.getBody({ filterUnicode: false })
  if (!body.trim()) throw new Error('The legacy Word document contains no recoverable body text.')
  writeFileSync(targetPath, await legacyDocTextToDocx(body))
}

/**
 * Import a binary Word 97-2003 file as a new DOCX copy. LibreOffice is used
 * when installed for the best layout fidelity; a bundled pure-JS extractor
 * provides a cross-platform text recovery path. The source file is read-only.
 */
export async function importLegacyDoc(
  sourcePath: string,
  outputDirectory: string,
): Promise<LegacyDocImportResult> {
  if (!isAbsolute(sourcePath) || !/\.doc$/i.test(sourcePath) || !existsSync(sourcePath)) {
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
  try {
    await recoverText(sourcePath, targetPath)
    return { path: targetPath, mode: 'text-recovery' }
  } catch (error) {
    if (existsSync(targetPath)) rmSync(targetPath, { force: true })
    throw error
  }
}
