import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('compatible PPT export preserves the editing session and publishes a visual audit report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'compatible-e2e-'))
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'compatible-pptx',
    lang: 'en',
    recordVideo: false,
  })
  try {
    await launched.page.locator('.quick-card', { hasText: 'AI Slides' }).click()
    const page = await waitForPageWithUrl(launched.app, 'slides/out')
    await page.waitForFunction(() => Boolean(window.slidesApi?.htmlToPptx))
    const labels = await launched.app.evaluate(({ Menu }) => {
      const out: string[] = []
      const visit = (items: Electron.MenuItem[]) => {
        for (const item of items) {
          out.push(item.label)
          if (item.submenu) visit(item.submenu.items)
        }
      }
      visit(Menu.getApplicationMenu()?.items ?? [])
      return out
    })
    expect(labels).toContain('High-fidelity PPTX (editable)…')
    expect(labels).toContain('High-fidelity PPTX (full-page images)…')
    const html =
      '<html><body style="margin:0;width:1280px;height:720px;background:white"><h1 data-pptx-kind="text" style="position:absolute;left:80px;top:100px;font:40px Arial">Editable export</h1></body></html>'
    await page.evaluate((value) => window.slidesApi.htmlToPptx([value], 960, 'replace'), html)
    const before = await page.evaluate(() => window.slidesApi.isDirty())
    const target = join(directory, 'compatible.pptx')
    await launched.app.evaluate(({ dialog, webContents }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog
      const editor = webContents
        .getAllWebContents()
        .find((item) => item.getURL().includes('slides/out'))!
      editor.send('slides:menu', 'export-compatible-pptx')
    }, target)
    await expect(page.locator('body')).toContainText(
      /Capturing native|Rendering source|Auditing layout|Layout check|Layout needs|Editable export failed/,
      { timeout: 10_000 },
    )
    await expect
      .poll(
        async () => {
          const report = await readFile(`${target}.compatibility.json`, 'utf8').catch(() => '')
          if (!report) {
            const body = await page.locator('body').innerText()
            if (body.includes('Editable export failed')) throw new Error(body.slice(-1500))
          }
          return report
        },
        {
          timeout: 120_000,
        },
      )
      .not.toBe('')
    const report = JSON.parse(await readFile(`${target}.compatibility.json`, 'utf8'))
    expect(['passed', 'review-required', 'unavailable']).toContain(report.layoutVerification.status)
    expect(report.validation.success).toBe(true)
    await expect
      .poll(async () =>
        (await readFile(target).catch(() => Buffer.alloc(0))).subarray(0, 2).toString(),
      )
      .toBe('PK')
    expect(await page.evaluate(() => window.slidesApi.isDirty())).toBe(before)
    const snapshot = await page.evaluate(() => window.slidesApi.prepareCompatiblePptx())
    expect(snapshot.slides).toHaveLength(1)
    expect(
      snapshot.slides[0].nodes.some((node) => node.type === 'text' || node.type === 'shape'),
    ).toBe(true)
  } finally {
    await closeAndSaveVideo(launched)
    await rm(directory, { recursive: true, force: true })
  }
})
