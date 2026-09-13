import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('Excel screenwriting previews a table and saves a new sheet without changing source cells', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'screenwriting-sheet-'))
  const path = join(dir, 'script.xlsx')
  await copyFile(resolve('apps/sheets/fixtures/generated/compatibility-basic.xlsx'), path)
  const original = await JSZip.loadAsync(await readFile(path))
  const originalSheet = await original.file('xl/worksheets/sheet1.xml')!.async('string')
  const launched = await launchShell({
    openFile: path,
    onboardingSeen: true,
    recordVideo: false,
    lang: 'zh',
    videoDir: 'sheets-screenwriting',
  })
  try {
    const sheets = await waitForPageWithUrl(launched.app, 'sheets/out')
    await expect(sheets.locator('.name-box')).toBeVisible()
    await sheets.route(
      'https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/**',
      (route) => route.fulfill({ body: '---\nname: sw-premise-theme\n---\n主题方法测试' }),
    )
    await launched.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ai:chat')
      ipcMain.handle('ai:chat', (_event, request) => ({
        ok: true,
        content:
          request.system.includes('TSV') && request.system.includes('主题方法测试')
            ? '人物\t目标\n林夕\t=1+1'
            : '',
      }))
    })
    await sheets.getByRole('button', { name: 'AI 编剧', exact: true }).click()
    const studio = sheets.getByRole('dialog', { name: 'AI 编剧工作台' })
    await studio.getByLabel('创作要求', { exact: true }).fill('写人物目标表')
    await studio.getByRole('button', { name: 'AI 生成', exact: true }).click()
    await expect(studio.getByLabel('AI 建议稿（可编辑）')).toHaveValue(/林夕/)
    await studio.getByLabel('AI 建议稿（可编辑）').fill('不合格的普通正文')
    await studio.getByRole('button', { name: '写入新工作表' }).click()
    await expect(studio.getByRole('alert')).toContainText('表格')
    await studio.getByLabel('AI 建议稿（可编辑）').fill('人物\t目标\n林夕\t=1+1')
    await studio.getByRole('button', { name: '写入新工作表' }).click()
    await expect(studio).toHaveCount(0)
    await sheets.getByRole('button', { name: '保存（⌘S）', exact: true }).click()
    await expect(async () => {
      const zip = await JSZip.loadAsync(await readFile(path))
      expect(await zip.file('xl/workbook.xml')!.async('string')).toContain('AI编剧_')
      const entries = await Promise.all(
        Object.keys(zip.files)
          .filter((name) => /xl\/(worksheets\/sheet.*\.xml|sharedStrings.xml)$/.test(name))
          .map((name) => zip.file(name)!.async('string')),
      )
      expect(entries.join('\n')).toContain('林夕')
      expect(entries.join('\n')).toContain('=1+1')
      expect(entries.join('\n')).not.toContain('<f>1+1</f>')
      expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toBe(originalSheet)
    }).toPass({ timeout: 20000 })
  } finally {
    await closeAndSaveVideo(launched, 'sheets-screenwriting')
  }
})
