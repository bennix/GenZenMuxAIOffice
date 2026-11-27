import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocx } from '../packages/docx-engine/tests/helpers/build-docx'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('mixed-column Word documents keep the preface full width and print each section at its own width', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zenoffice-mixed-columns-'))
  const file = join(directory, 'mixed.docx')
  const body =
    '<w:p><w:r><w:t>Full width preface</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:sectPr><w:cols w:num="1"/></w:sectPr></w:pPr></w:p>' +
    Array.from(
      { length: 30 },
      (_, i) =>
        `<w:p><w:r><w:t>Body paragraph ${i}. This belongs to the two-column body.</w:t></w:r></w:p>`,
    ).join('')
  const bytes = await buildDocx({ bodyXml: body, sectPrExtra: '<w:cols w:num="2" w:space="400"/>' })
  await writeFile(file, bytes)
  const launched = await launchShell({
    onboardingSeen: true,
    recordVideo: false,
    videoDir: 'word-mixed-columns',
    openFile: file,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, 'docs/out')
    const editor = page.locator('.editor-scroll .ProseMirror')
    await expect(page.locator('.section-flow-notice')).toBeVisible()
    await expect(editor).toContainText('Body paragraph 29')
    const geometry = () =>
      editor.evaluate((el) => ({
        columns: getComputedStyle(el).columnCount,
        titleWidth: el.firstElementChild!.getBoundingClientRect().width,
      }))
    const before = await geometry()
    expect(before.columns).toBe('auto')
    await editor.locator('[data-idx="10"]').click()
    await expect.poll(geometry).toEqual(before)
    await expect(editor.locator('.page-gap')).toHaveCount(0)
    await launched.app.evaluate(({ webContents }) => {
      webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes('docs/out'))!
        .send('menu:command', 'print-preview')
    })
    await expect(page.locator('.pv-page').first()).toBeVisible()
    const introWidth = await page
      .locator('.pv-content > [data-idx="0"]')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
    const bodyWidth = await page
      .locator('.pv-content > [data-idx="2"]')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(introWidth).toBeGreaterThan(bodyWidth * 1.8)
    expect(await readFile(file)).toEqual(Buffer.from(bytes))
  } finally {
    await closeAndSaveVideo(launched, 'word-mixed-columns')
    await rm(directory, { recursive: true, force: true })
  }
})
