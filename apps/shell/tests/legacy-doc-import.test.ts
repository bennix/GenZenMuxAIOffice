import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { parseDocx } from '@genoffice/docx-engine'
import { afterEach, describe, expect, it } from 'vitest'

import {
  LegacyDocFidelityError,
  legacyDocTextToDocx,
  legacyHtmlToText,
  docxToLegacyDoc,
  importLegacyDoc,
  nextConvertedDocxPath,
  sniffWordContainer,
} from '../src/main/legacy-doc-import'

const temporaryDirectories: string[] = []
const hasSoffice = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  ...(process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, 'soffice')),
].some((path) => existsSync(path))

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('legacy Word import', () => {
  it('detects OOXML, OLE and Word HTML independently of the filename suffix', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genoffice-doc-sniff-'))
    temporaryDirectories.push(directory)
    const ooxml = join(directory, 'normal.docx')
    const oleNamedDocx = join(directory, 'wps.docx')
    const htmlNamedDoc = join(directory, 'export.doc')
    writeFileSync(ooxml, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))
    writeFileSync(oleNamedDocx, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]))
    writeFileSync(htmlNamedDoc, '\uFEFF  <html xmlns:w="urn:test"><body>旧文档</body></html>')
    expect(sniffWordContainer(ooxml)).toBe('ooxml')
    expect(sniffWordContainer(oleNamedDocx)).toBe('ole')
    expect(sniffWordContainer(htmlNamedDoc)).toBe('html')
  })

  it('creates a separate converted-copy name without overwriting an existing result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genoffice-doc-name-'))
    temporaryDirectories.push(directory)
    mkdirSync(directory, { recursive: true })
    const first = nextConvertedDocxPath('/documents/旧版报告.doc', directory)
    expect(first).toBe(join(directory, '旧版报告-converted.docx'))
    writeFileSync(first, 'occupied')
    const second = nextConvertedDocxPath('/documents/旧版报告.doc', directory)
    expect(second).toBe(join(directory, '旧版报告-converted-2.docx'))
    expect(existsSync(first)).toBe(true)
  })

  it('turns recovered DOC body text into editable DOCX paragraphs', async () => {
    const bytes = await legacyDocTextToDocx('标题\r\n第一段\t数据\n\n最后一段')
    const parsed = await parseDocx(bytes)
    const texts = parsed.blocks
      .filter((block) => !block.hidden)
      .map((block) => (block.runs ?? []).map((run) => run.text).join(''))
    expect(texts).toEqual(['标题', '第一段    数据', '', '最后一段'])
  })

  it('recovers Word HTML text without requiring LibreOffice or an OLE parser', () => {
    const html = Buffer.from(
      '<html><head><style>.x{color:red}</style></head><body><h1>课程大纲</h1><p>第一段&nbsp;内容</p><table><tr><td>A</td><td>B</td></tr></table></body></html>',
    )
    expect(legacyHtmlToText(html)).toBe('课程大纲\n第一段 内容\nA\tB')
  })

  it('never performs a format-losing recovery unless the caller explicitly allows it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genoffice-doc-consent-'))
    temporaryDirectories.push(directory)
    const legacyPath = join(directory, 'web-document.doc')
    writeFileSync(legacyPath, '<html><body><p>必须保留格式</p></body></html>')
    const previousSoffice = process.env.GENOFFICE_SOFFICE_PATH
    process.env.GENOFFICE_SOFFICE_PATH = join(directory, 'missing-soffice')
    try {
      await expect(importLegacyDoc(legacyPath, directory)).rejects.toBeInstanceOf(
        LegacyDocFidelityError,
      )
      const recovered = await importLegacyDoc(legacyPath, directory, { allowTextRecovery: true })
      expect(recovered.mode).toBe('text-recovery')
      const parsed = await parseDocx(
        await import('node:fs/promises').then((fs) => fs.readFile(recovered.path)),
      )
      expect(
        parsed.blocks.map((block) => block.runs?.map((run) => run.text).join('')).join('\n'),
      ).toContain('必须保留格式')
    } finally {
      if (previousSoffice === undefined) delete process.env.GENOFFICE_SOFFICE_PATH
      else process.env.GENOFFICE_SOFFICE_PATH = previousSoffice
    }
  })

  it.skipIf(!hasSoffice)(
    'round-trips editable DOCX through a genuine Word 97-2003 DOC file',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'genoffice-doc-roundtrip-'))
      temporaryDirectories.push(directory)
      const legacyPath = join(directory, 'roundtrip.doc')
      const docx = await legacyDocTextToDocx('双向转换\nRound trip')
      writeFileSync(legacyPath, await docxToLegacyDoc(docx))
      expect(sniffWordContainer(legacyPath)).toBe('ole')
      const imported = await importLegacyDoc(legacyPath, directory)
      const parsed = await parseDocx(
        await import('node:fs/promises').then((fs) => fs.readFile(imported.path)),
      )
      expect(
        parsed.blocks.map((block) => block.runs?.map((run) => run.text).join('')).join('\n'),
      ).toContain('双向转换')
    },
  )
})
