import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseDocx } from '@genoffice/docx-engine'
import { afterEach, describe, expect, it } from 'vitest'

import { legacyDocTextToDocx, nextConvertedDocxPath } from '../src/main/legacy-doc-import'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('legacy Word import', () => {
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
})
