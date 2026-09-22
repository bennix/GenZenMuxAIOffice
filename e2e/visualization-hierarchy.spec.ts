import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

for (const kind of ['circle-packing', 'contour'] as const) {
  test(`Excel ${kind} binds fields and exports the selected chart`, async () => {
    test.setTimeout(90000)
    const dir = await mkdtemp(join(tmpdir(), 'packing-ui-'))
    const workbook = join(dir, 'hierarchy.xlsx')
    const zip = await JSZip.loadAsync(
      await readFile(resolve('apps/sheets/fixtures/generated/compatibility-basic.xlsx')),
    )
    const rows =
      kind === 'circle-packing'
        ? [
            ['节点', '父节点', '权重'],
            ['总计', null, null],
            ['甲', '总计', 20],
            ['乙', '总计', 5],
          ]
        : [
            ['X', 'Y', 'Z'],
            [0, 0, 0],
            [1, 0, 2],
            [0, 1, 2],
            [1, 1, 4],
          ]
    const xml = rows
      .map(
        (row, i) =>
          `<row r="${i + 1}">${row
            .map((value, j) => {
              const ref = `${String.fromCharCode(65 + j)}${i + 1}`
              if (value === null) return ''
              return typeof value === 'number'
                ? `<c r="${ref}"><v>${value}</v></c>`
                : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`
            })
            .join('')}</row>`,
      )
      .join('')
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C${rows.length}"/><sheetData>${xml}</sheetData></worksheet>`,
    )
    await writeFile(workbook, await zip.generateAsync({ type: 'nodebuffer' }))
    const launched = await launchShell({
      openFile: workbook,
      onboardingSeen: true,
      recordVideo: false,
      lang: 'zh',
      videoDir: 'packing-ui',
    })
    try {
      const sheets = await waitForPageWithUrl(launched.app, 'sheets/out')
      await expect(sheets.locator('.workbook-status')).toContainText('完整加载')
      await sheets.locator('.name-box').fill(`A1:C${rows.length}`)
      await sheets.locator('.name-box').press('Enter')
      await sheets.getByRole('button', { name: '数据可视化', exact: true }).click()
      const studio = sheets.getByRole('dialog', { name: '数据可视化工作台' })
      await studio.getByRole('button', { name: '自己选择图表', exact: true }).click()
      await studio.getByLabel('图形', { exact: true }).selectOption(kind)
      if (kind === 'circle-packing') {
        await studio.getByLabel('父节点列', { exact: true }).selectOption('父节点')
      } else {
        await studio.getByLabel('Y 坐标列', { exact: true }).selectOption('Y')
        await studio.getByLabel('高度 Z列', { exact: true }).selectOption('Z')
      }
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await expect(studio.locator('svg').first()).toContainText(
        kind === 'circle-packing' ? '甲' : 'Z等值线',
      )
      await expect(studio.getByRole('link', { name: '下载 SVG' })).toHaveAttribute(
        'href',
        /data:image\/svg\+xml/,
      )
      await expect(studio).toContainText(
        kind === 'circle-packing' ? '父圆面积包含布局空隙' : '不自动插补散点',
      )
    } finally {
      await closeAndSaveVideo(launched, 'packing-ui')
    }
  })
}
