import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

const sourcePath = process.env.GENOFFICE_TEST_SOURCE_PPTX
const outputPath = process.env.GENOFFICE_TEST_EXPORT_PPTX

test('exports the actual source deck with matching slide text and native objects', async () => {
  test.skip(!sourcePath || !outputPath, 'Explicit source and output paths required')
  const directory = await mkdtemp(join(tmpdir(), 'original-export-'))
  const source = join(directory, 'original.pptx')
  const target = join(directory, 'editable.pptx')
  await copyFile(sourcePath!, source)
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'original-export',
    lang: 'en',
    recordVideo: false,
    openFile: source,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, 'slides/out')
    await expect
      .poll(() =>
        page.evaluate(async () => (await window.slidesApi.getRenderSlides())?.length ?? 0),
      )
      .toBeGreaterThan(0)
    const slideCount = await page.evaluate(
      async () => (await window.slidesApi.getRenderSlides())!.length,
    )
    await expect(page.locator('body')).toContainText(`Slide 1 of ${slideCount}`)
    await launched.app.evaluate(({ dialog, webContents }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog
      webContents
        .getAllWebContents()
        .find((item) => item.getURL().includes('slides/out'))!
        .send('slides:menu', 'export-compatible-pptx')
    }, target)
    await expect(page.locator('body')).toContainText(
      /Capturing native|Rendering source|Auditing layout|Layout check|Layout needs|Editable export failed/,
      { timeout: 10_000 },
    )
    await expect
      .poll(
        async () => {
          const saved = await readFile(target).catch(() => null)
          if (!saved) {
            const body = await page.locator('body').innerText()
            if (body.includes('Editable export failed')) throw new Error(body.slice(-1200))
          }
          return saved?.subarray(0, 2).toString()
        },
        { timeout: 80_000 },
      )
      .toBe('PK')
    const require = createRequire(join(process.cwd(), 'apps/slides/package.json'))
    const Zip = require('jszip')
    const contents = async (path: string) => {
      const zip = await Zip.loadAsync(await readFile(path))
      const slides = Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name),
      )
      const texts: string[] = []
      for (const name of slides) {
        const xml: string = await zip.file(name).async('string')
        texts.push(
          ...[...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]),
        )
      }
      return { pages: slides.length, texts: texts.sort() }
    }
    const before = await contents(source)
    const after = await contents(target)
    expect(after.pages).toBe(before.pages)
    expect(before.texts.length).toBeGreaterThan(0)
    expect(after.texts).toEqual(before.texts)
    expect(after.texts).not.toContain('Editable export')
    const report = JSON.parse(await readFile(`${target}.compatibility.json`, 'utf8'))
    expect(report.validation.success).toBe(true)
    await copyFile(target, outputPath!)
    await copyFile(`${target}.compatibility.json`, `${outputPath}.compatibility.json`)
  } finally {
    await closeAndSaveVideo(launched)
    await rm(directory, { recursive: true, force: true })
  }
})
