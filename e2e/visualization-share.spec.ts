import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import { createBlankPptx } from '../packages/pptx-engine/src/blank'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

for (const mode of ['chart', 'dashboard'] as const) {
  test(`Excel ${mode} images save in Markdown, Word, PPT and PDF`, async () => {
    test.setTimeout(180000)
    const dir = await mkdtemp(join(tmpdir(), 'visualization-share-'))
    const workbook = join(dir, 'chart.xlsx'),
      markdown = join(dir, 'chart.md')
    const zip = await JSZip.loadAsync(
      await readFile(resolve('apps/sheets/fixtures/generated/compatibility-basic.xlsx')),
    )
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B3"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>地区</t></is></c><c r="B1" t="inlineStr"><is><t>收入</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>东区</t></is></c><c r="B2"><v>12</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>西区</t></is></c><c r="B3"><v>8</v></c></row></sheetData></worksheet>',
    )
    await writeFile(workbook, await zip.generateAsync({ type: 'nodebuffer' }))
    await writeFile(markdown, '# 图表报告\n')
    const targets = {
      docs: join(dir, 'chart.docx'),
      slides: join(dir, 'chart.pptx'),
      pdf: join(dir, 'chart.pdf'),
    }
    await copyFile(resolve('fixtures/generated/simple.docx'), targets.docs)
    await writeFile(targets.slides, await createBlankPptx())
    const blankPdf = await PDFDocument.create()
    blankPdf.addPage([600, 800])
    await writeFile(targets.pdf, await blankPdf.save())
    const launched = await launchShell({
      openFile: workbook,
      onboardingSeen: true,
      recordVideo: false,
      lang: 'zh',
      videoDir: 'visualization-share',
    })
    try {
      const sheets = await waitForPageWithUrl(launched.app, 'sheets/out')
      const shell = await waitForPageWithUrl(launched.app, 'shell/out')
      await expect(sheets.locator('.name-box')).toBeVisible()
      await expect(sheets.getByRole('button', { name: 'AI 编剧', exact: true })).toHaveCount(0)
      await expect(sheets.locator('.workbook-status')).toHaveText(
        '工作簿已完整加载——公式实时重算，行列可编辑。',
      )
      await shell.evaluate(async (path) => {
        await (window as any).aiOffice.openPath(path)
      }, markdown)
      const md = await waitForPageWithUrl(launched.app, 'markdown/out')
      await expect(md.locator('.ProseMirror')).toBeVisible()
      await shell.evaluate(async () => {
        const api = (window as any).aiOfficeTabs
        const tabs = await api.list()
        await api.activate(tabs.find((tab: any) => tab.kind === 'sheets').id)
      })
      await sheets.locator('.name-box').fill('A1:B3')
      await sheets.locator('.name-box').press('Enter')
      await sheets.getByRole('button', { name: '数据可视化', exact: true }).click()
      const studio = sheets.getByRole('dialog', { name: '数据可视化工作台' })
      await expect(studio).toBeVisible()
      await studio.getByRole('button', { name: '自己选择图表', exact: true }).click()
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await studio.getByLabel('图形', { exact: true }).selectOption('word-cloud')
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await expect(studio.locator('svg').first()).toContainText('东区')
      await expect(studio.locator('svg').first()).toContainText('西区')
      await studio.getByLabel('图形', { exact: true }).selectOption('dendrogram')
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await expect(studio.locator('svg').first()).toContainText('合并距离')
      await studio.getByLabel('图形', { exact: true }).selectOption('hexbin')
      await expect(studio.getByRole('alert')).toContainText('完整')
      await studio.getByLabel('类别 / X / 节点列', { exact: true }).selectOption('收入')
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await expect(studio.locator('svg').first()).toContainText('条观测')
      await studio.getByLabel('图形', { exact: true }).selectOption('horizon')
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await expect(studio.locator('svg').first()).toContainText('负值向上折叠')
      await studio.getByLabel('类别 / X / 节点列', { exact: true }).selectOption('地区')
      for (const kind of ['table', 'crosstab', 'pivot']) {
        await studio.getByLabel('图形', { exact: true }).selectOption(kind)
        if (kind === 'pivot')
          await studio.getByLabel('列分类字段', { exact: true }).selectOption('收入')
        await expect(studio.getByRole('alert')).toHaveCount(0)
        await expect(studio.getByRole('link', { name: '下载 SVG' })).toHaveAttribute(
          'href',
          /data:image\/svg\+xml/,
        )
        if (kind !== 'table') await expect(studio.locator('svg').first()).toContainText('合计')
      }
      if (mode === 'dashboard') {
        await studio.getByRole('button', { name: /加入仪表盘/ }).click()
        await studio.getByLabel('图形', { exact: true }).selectOption('kpi')
        await studio.getByRole('button', { name: /加入仪表盘/ }).click()
        await studio.getByLabel('呈现方式', { exact: true }).selectOption('dashboard')
        await expect(studio.getByRole('alert')).toHaveCount(0)
        await expect(studio.getByRole('list', { name: '仪表盘图表' }).locator('li')).toHaveCount(2)
        await studio.getByRole('button', { name: '上移图表 2', exact: true }).click()
        await expect(studio.getByRole('img', { name: '数据仪表盘', exact: true })).toBeVisible()
        const fileLink = studio.getByRole('link', { name: '保存可编辑仪表盘' })
        const exportedPath = join(dir, 'exported.zenoffice.json')
        await launched.app.evaluate(({ session }, path) => {
          session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path))
        }, exportedPath)
        await fileLink.click()
        await expect(async () => {
          expect(JSON.parse(await readFile(exportedPath, 'utf8')).format).toBe(
            'zenoffice-dashboard',
          )
        }).toPass({ timeout: 10000 })
        const saved = JSON.parse(await readFile(exportedPath, 'utf8'))
        expect(saved.format).toBe('zenoffice-dashboard')
        expect(saved.dashboard.cards).toHaveLength(2)
        // Simulate reopening a dashboard from another workbook, with different field names.
        for (const card of saved.dashboard.cards) {
          card.table.columns = ['区域', '产值']
          card.x = '区域'
          card.y = ['产值']
          card.target = '产值'
        }
        const dashboardPath = join(dir, 'roundtrip.zenoffice.json')
        await writeFile(dashboardPath, JSON.stringify(saved))
        await studio.getByRole('button', { name: '移除图表 2', exact: true }).click()
        await expect(studio.getByRole('list', { name: '仪表盘图表' }).locator('li')).toHaveCount(1)
        await studio.getByLabel('导入仪表盘', { exact: true }).setInputFiles(dashboardPath)
        await expect(studio.getByRole('list', { name: '仪表盘图表' }).locator('li')).toHaveCount(2)
        await studio.getByLabel('导入仪表盘', { exact: true }).setInputFiles({
          name: 'invalid.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{}'),
        })
        await expect(studio.getByRole('status')).toContainText('不支持')
        await expect(studio.getByRole('list', { name: '仪表盘图表' }).locator('li')).toHaveCount(2)
        await studio.getByRole('button', { name: '编辑图表 1', exact: true }).click()
        await studio.getByLabel('图表标题', { exact: true }).fill('恢复后的 KPI')
        await studio.getByRole('button', { name: '更新仪表盘图表', exact: true }).click()
        const updatedHref = await fileLink.getAttribute('href')
        const updated = JSON.parse(
          decodeURIComponent(updatedHref!.slice(updatedHref!.indexOf(',') + 1)),
        )
        expect(updated.dashboard.cards[0].title).toBe('恢复后的 KPI')
        expect(updated.dashboard.cards[0].table.columns).toEqual(['区域', '产值'])
        expect(updated.dashboard.cards[0].table.rows).toEqual(saved.dashboard.cards[0].table.rows)
        await studio.getByLabel('仪表盘筛选字段', { exact: true }).selectOption('区域')
        await studio
          .getByLabel('仪表盘筛选值', { exact: true })
          .selectOption(JSON.stringify('东区'))
        await expect(studio.getByRole('alert')).toHaveCount(0)
        const filteredSvgLink = await studio
          .getByRole('link', { name: '下载 SVG' })
          .getAttribute('href')
        const filteredSvg = decodeURIComponent(
          filteredSvgLink!.slice(filteredSvgLink!.indexOf(',') + 1),
        )
        expect(filteredSvg).toContain('东区')
        expect(filteredSvg).not.toContain('西区')
        expect(filteredSvg).toContain('显示筛选后的数据')
        const filteredFileHref = await fileLink.getAttribute('href')
        const filteredFile = JSON.parse(
          decodeURIComponent(filteredFileHref!.slice(filteredFileHref!.indexOf(',') + 1)),
        )
        expect(filteredFile.dashboard.filter).toEqual({ column: '区域', values: ['东区'] })
        expect(filteredFile.dashboard.cards[0].table.rows).toHaveLength(2)
      }
      await expect(studio.getByRole('link', { name: '下载 SVG' })).toHaveAttribute(
        'href',
        /data:image\/svg\+xml/,
      )
      await studio.getByRole('button', { name: '分享至文件' }).click()
      const option = studio.getByLabel('目标文件').locator('option').filter({ hasText: 'chart.md' })
      const id = await option.getAttribute('value')
      expect(id).toBeTruthy()
      await studio.getByLabel('目标文件').selectOption(id!)
      await expect(studio.getByRole('status')).toContainText('已插入')
      await md.locator('.qa-btn').first().click()
      await expect(async () => {
        const text = await readFile(markdown, 'utf8')
        expect(text).toContain('图表报告')
        expect(text).toMatch(/!\[.*\]\(/)
        const asset = text.match(/!\[.*?\]\((assets\/[^)]+)\)/)?.[1]
        expect(asset).toBeTruthy()
        const png = await readFile(join(dir, asset!))
        expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        expect(png.readUInt32BE(16)).toBe(mode === 'dashboard' ? 3840 : 1920)
        expect(png.readUInt32BE(20)).toBe(mode === 'dashboard' ? 1460 : 1200)
      }).toPass()
      if (mode === 'chart') {
        // New unsaved documents must appear without reopening the sharing panel.
        const before = new Set(launched.app.windows())
        await shell.evaluate(async () => {
          await (window as any).aiOffice.newMarkdown()
        })
        await expect
          .poll(() => launched.app.windows().filter((page) => !before.has(page)).length)
          .toBe(1)
        const fresh = launched.app.windows().find((page) => !before.has(page))!
        await expect(fresh.locator('.ProseMirror')).toBeVisible()
        const freshId = await shell.evaluate(async () => {
          const api = (window as any).aiOfficeTabs
          const tabs = await api.list()
          await api.activate(tabs.find((tab: any) => tab.kind === 'sheets').id)
          return tabs.filter((tab: any) => tab.kind === 'markdown').at(-1).id
        })
        await expect(
          studio.getByLabel('目标文件').locator(`option[value="${freshId}"]`),
        ).toHaveCount(1)
        await studio.getByLabel('目标文件').selectOption(freshId)
        await expect(studio.getByRole('status')).toContainText('已插入')
        await expect(fresh.locator('.ProseMirror img')).toHaveAttribute(
          'src',
          /^data:image\/png;base64,/,
        )
        const unsavedPath = join(dir, 'new-document.md')
        await launched.app.evaluate(({ dialog }, path) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
        }, unsavedPath)
        await fresh.locator('.qa-btn').first().click()
        await expect(async () => {
          expect(await readFile(unsavedPath, 'utf8')).toContain('data:image/png;base64,')
        }).toPass()
      }
      for (const [kind, path] of Object.entries(targets)) {
        await shell.evaluate(async (path) => {
          await (window as any).aiOffice.openPath(path)
        }, path)
        const target = await waitForPageWithUrl(launched.app, `${kind}/out`)
        await expect(
          target
            .locator(
              kind === 'docs'
                ? '.ProseMirror'
                : kind === 'slides'
                  ? '.konvajs-content'
                  : '.pdf-page',
            )
            .first(),
        ).toBeVisible()
        await shell.evaluate(async () => {
          const api = (window as any).aiOfficeTabs
          const tabs = await api.list()
          await api.activate(tabs.find((tab: any) => tab.kind === 'sheets').id)
        })
        const option = studio
          .getByLabel('目标文件')
          .locator('option')
          .filter({ hasText: path.split('/').pop()! })
        await expect(option).toHaveCount(1)
        const targetId = await option.getAttribute('value')
        expect(targetId).toBeTruthy()
        await studio.getByLabel('目标文件').selectOption(targetId!)
        await expect(studio.getByRole('status')).toContainText('已插入')
        if (kind === 'pdf') {
          await expect(target.locator('.pdf-imgedit-img')).toHaveCount(1)
          await expect(target.locator('.pdf-imgedit-passive')).toHaveCount(0)
        }
        await target.locator('.qa-btn').first().click()
        await expect(async () => {
          if (kind === 'pdf') {
            const saved = await PDFDocument.load(await readFile(path))
            const images = saved.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
            expect(images?.keys().length).toBeGreaterThan(0)
          } else {
            const saved = await JSZip.loadAsync(await readFile(path))
            const images = Object.keys(saved.files).filter((name) =>
              /^(word|ppt)\/media\/.*\.png$/.test(name),
            )
            expect(images.length).toBeGreaterThan(0)
            const png = await saved.file(images[images.length - 1]!)!.async('nodebuffer')
            expect(png.readUInt32BE(16)).toBe(mode === 'dashboard' ? 3840 : 1920)
            expect(png.readUInt32BE(20)).toBe(mode === 'dashboard' ? 1460 : 1200)
          }
        }).toPass({ timeout: 20000 })
      }
    } finally {
      await closeAndSaveVideo(launched, 'visualization-share')
    }
  })
}
