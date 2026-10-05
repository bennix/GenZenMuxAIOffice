import { expect, it } from 'vitest'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { publishCompatibleOffice } from '../src/office-compatible-export'
import { invokeOfficeCli, resolveOfficeCli } from '../src/officecli-runtime'
const runtime = {
  isPackaged: false,
  appPath: resolve(import.meta.dirname, '../../../apps/shell'),
  resourcesPath: '',
}
it('validates and publishes native PPTX/DOCX/XLSX without rewriting source bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-compat-test-'))
  try {
    const binary = await resolveOfficeCli(runtime)
    for (const extension of ['pptx', 'docx', 'xlsx']) {
      const source = join(directory, `source.${extension}`)
      await invokeOfficeCli(binary, ['create', source, '--locale', 'zh-CN'])
      if (extension === 'pptx')
        await invokeOfficeCli(binary, [
          'batch',
          source,
          '--commands',
          JSON.stringify([
            { command: 'add', parent: '/', type: 'slide' },
            {
              command: 'add',
              parent: '/slide[1]',
              type: 'shape',
              props: {
                text: '可编辑 Editable',
                x: '914400',
                y: '914400',
                width: '3657600',
                height: '914400',
              },
            },
          ]),
        ])
      if (extension === 'docx') {
        await invokeOfficeCli(binary, [
          'add',
          source,
          '/body',
          '--type',
          'paragraph',
          '--prop',
          'text=可编辑段落 Editable paragraph',
        ])
        await invokeOfficeCli(binary, [
          'add',
          source,
          '/body',
          '--type',
          'table',
          '--prop',
          'rows=2',
          '--prop',
          'cols=2',
        ])
      }
      if (extension === 'xlsx') {
        await invokeOfficeCli(binary, ['set', source, '/Sheet1/A1', '--prop', 'value=12'])
        await invokeOfficeCli(binary, ['set', source, '/Sheet1/A2', '--prop', 'formula=A1*2'])
      }
      await invokeOfficeCli(binary, ['save', source])
      await invokeOfficeCli(binary, ['close', source])
      const original = await readFile(source)
      const destination = join(directory, `副本.${extension}`)
      const result = await publishCompatibleOffice(
        destination,
        (path) => copyFile(source, path),
        runtime,
        extension === 'pptx' ? async () => ({ status: 'review-required', accepted: 0 }) : undefined,
      )
      expect(await readFile(result.path)).toEqual(original)
      const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
      expect(report.validation.success).toBe(true)
      if (extension === 'pptx') expect(report.layoutVerification.status).toBe('review-required')
      else expect(report.layoutVerification).toBe('not-run')
    }
    const old = join(directory, 'existing.pptx')
    await writeFile(old, 'original')
    await expect(
      publishCompatibleOffice(old, (path) => writeFile(path, 'broken'), runtime),
    ).rejects.toThrow()
    expect(await readFile(old, 'utf8')).toBe('original')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
