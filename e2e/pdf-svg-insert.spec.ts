import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('PDF local image picker accepts SVG and saves the placed image', async () => {
  test.setTimeout(90000)
  const dir = await mkdtemp(join(tmpdir(), 'pdf-svg-'))
  const path = join(dir, 'target.pdf')
  const doc = await PDFDocument.create()
  doc.addPage([600, 800])
  await writeFile(path, await doc.save())
  const launched = await launchShell({ openFile: path, onboardingSeen: true,
    recordVideo: false, lang: 'zh', videoDir: 'pdf-svg' })
  try {
    const page = await waitForPageWithUrl(launched.app, 'pdf/out')
    await expect(page.locator('.pdf-page')).toBeVisible()
    const input = page.getByLabel('插入图片文件', { exact: true })
    // setInputFiles bypasses native filtering, so assert both macOS filters explicitly.
    await expect(input).toHaveAttribute('accept', /image\/svg\+xml,\.svg/)
    await input.setInputFiles({ name: 'visualization.svg', mimeType: 'application/octet-stream',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#16806c"/><text x="40" y="150" fill="white" font-size="32">SVG 图表</text></svg>') })
    await expect(page.locator('.pdf-sign-drop')).toBeVisible()
    await page.locator('.pdf-sign-drop').click({ position: { x: 200, y: 200 } })
    await expect(page.locator('.pdf-imgedit-img')).toHaveCount(1)
    await page.screenshot({ path: '/tmp/zenoffice-pdf-local-svg.png' })
    await page.locator('.qa-btn').first().click()
    await expect(async () => {
      const saved = await PDFDocument.load(await readFile(path))
      const images = saved.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
      expect(images?.keys().length).toBeGreaterThan(0)
    }).toPass({ timeout: 15000 })
  } finally {
    await closeAndSaveVideo(launched, 'pdf-svg')
  }
})
