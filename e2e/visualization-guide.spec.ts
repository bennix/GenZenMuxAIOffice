import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('Excel guides data selection, AI chart choice and review of displayed columns', async () => {
  test.setTimeout(120000)
  const dir = await mkdtemp(join(tmpdir(), 'visualization-guide-'))
  const workbook = join(dir, 'guide.xlsx')
  const zip = await JSZip.loadAsync(
    await readFile(resolve('apps/sheets/fixtures/generated/compatibility-basic.xlsx')),
  )
  const rows = [
    ['地区', '收入', '利润', '备注'],
    ['东区', 120, 30, '不发送此列'],
    ['西区', 80, 10, '内部备注'],
    ['南区', 100, 20, '仅保留在表格'],
  ]
  const xml = rows
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map((value, j) => {
            const ref = `${String.fromCharCode(65 + j)}${i + 1}`
            return typeof value === 'number'
              ? `<c r="${ref}"><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`
          })
          .join('')}</row>`,
    )
    .join('')
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D4"/><sheetData>${xml}</sheetData></worksheet>`,
  )
  await writeFile(workbook, await zip.generateAsync({ type: 'nodebuffer' }))
  const original = await readFile(workbook)
  const launched = await launchShell({
    openFile: workbook,
    onboardingSeen: true,
    recordVideo: false,
    lang: 'zh',
    videoDir: 'visualization-guide',
  })
  try {
    const sheets = await waitForPageWithUrl(launched.app, 'sheets/out')
    await expect(sheets.locator('.workbook-status')).toContainText('完整加载')
    await sheets.locator('.name-box').fill('A1')
    await sheets.locator('.name-box').press('Enter')
    await sheets.getByRole('button', { name: '数据可视化', exact: true }).click()
    const range = sheets.getByRole('dialog', { name: '选择可视化数据' })
    await expect(range).toBeVisible()
    await range.getByLabel('可视化数据范围').fill('A1:D4')
    await range.getByRole('button', { name: '读取数据并开始引导' }).click()
    const studio = sheets.getByRole('dialog', { name: '数据可视化工作台' })
    const guide = studio.getByRole('region', { name: '可视化引导' })
    await expect(guide).toBeVisible()
    await expect(guide.getByRole('table')).toContainText('东区')
    await guide.getByRole('checkbox', { name: '使用列 备注', exact: true }).uncheck()
    await expect(guide.getByRole('table')).not.toContainText('不发送此列')
    await sheets.screenshot({ path: '/tmp/zenoffice-guide-data.png' })
    await guide.getByRole('button', { name: '下一步：选择图表' }).click()
    await guide.getByRole('button', { name: '比较', exact: true }).click()
    await guide.getByLabel('引导分析目的').fill('比较各地区收入和利润')
    await launched.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ai:chat')
      ipcMain.handle('ai:chat', (_event, request) => {
        const data = JSON.parse(request.user)
        if (
          data.columns.some((column: any) => column.name === '备注') ||
          data.sample.some((row: any[]) => row.length !== 3) ||
          !data.instruction.includes('比较各地区')
        )
          return { ok: false, error: '字段或目的传递错误' }
        return {
          ok: true,
          content: JSON.stringify({
            chartId: 'grouped-column',
            x: '地区',
            y: ['收入', '利润'],
            title: '地区经营比较',
            reason: '将收入和利润并列显示，比较不同地区。',
          }),
        }
      })
    })
    await guide.getByRole('button', { name: 'AI 推荐图表与列', exact: true }).click()
    await expect(guide.getByAltText('AI 推荐图表预览')).toBeVisible()
    await expect(guide).toContainText('显示列：收入、利润')
    await sheets.screenshot({ path: '/tmp/zenoffice-guide-recommend.png' })
    await guide.getByRole('button', { name: '采用建议，确认显示列' }).click()
    await expect(guide.getByRole('checkbox', { name: '显示列 收入', exact: true })).toBeChecked()
    await expect(guide.getByRole('checkbox', { name: '显示列 利润', exact: true })).toBeChecked()
    await expect(guide.getByRole('checkbox', { name: '显示列 备注', exact: true })).toHaveCount(0)
    await guide.getByRole('checkbox', { name: '显示列 利润', exact: true }).uncheck()
    await guide.getByRole('checkbox', { name: '显示列 收入', exact: true }).uncheck()
    await expect(guide.getByRole('button', { name: '生成图表，进入工作台' })).toBeDisabled()
    await expect(guide.getByRole('alert')).toBeVisible()
    await guide.getByRole('checkbox', { name: '显示列 收入', exact: true }).check()
    await sheets.screenshot({ path: '/tmp/zenoffice-guide-fields.png' })
    await guide.getByRole('button', { name: '生成图表，进入工作台' }).click()
    await expect(studio.getByLabel('图形', { exact: true })).toHaveValue('grouped-column')
    await expect(studio.getByLabel('数值列（可多选）', { exact: true })).toHaveValues(['收入'])
    await expect(studio.getByRole('link', { name: '下载 SVG' })).toBeVisible()
    await expect(studio.locator('svg').first()).toContainText('地区经营比较')
    await studio.getByRole('button', { name: '重新引导选图' }).click()
    await expect(
      guide.getByRole('checkbox', { name: '使用列 备注', exact: true }),
    ).not.toBeChecked()
    await guide.getByRole('button', { name: '自己选择图表' }).click()
    await expect(
      studio
        .getByLabel('类别 / X / 节点列', { exact: true })
        .locator('option', { hasText: '备注' }),
    ).toHaveCount(0)
    expect(await readFile(workbook)).toEqual(original)
  } finally {
    await closeAndSaveVideo(launched, 'visualization-guide')
  }
})
