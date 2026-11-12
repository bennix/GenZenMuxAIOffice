import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('PDF image pages render through packaged file resources', async () => {
  test.setTimeout(120000)
  test.skip(
    !process.env.GENOFFICE_PDF_FIXTURE,
    'Set a local PDF fixture; never commit user documents',
  )
  const launched = await launchShell({
    openFile: process.env.GENOFFICE_PDF_FIXTURE,
    onboardingSeen: true,
    recordVideo: false,
    lang: 'zh',
    videoDir: 'pdf-codecs',
  })
  try {
    const page = await waitForPageWithUrl(launched.app, 'pdf/out')
    launched.app
      .context()
      .on('requestfailed', (request) =>
        console.log('Resource failed:', request.url(), request.failure()?.errorText),
      )
    page.on('console', (message) => {
      if (/wasm|jpx|jpeg|fetch|error|warning/i.test(message.text())) console.log(message.text())
    })
    page.on('pageerror', (error) => console.log('Page error:', error.message))
    for (const index of [0, 1, 2, 10]) {
      await page.locator(`.pdf-page[data-page-index="${index}"]`).scrollIntoViewIfNeeded()
      await expect(async () => {
        const ink = await page
          .locator(`.pdf-page[data-page-index="${index}"] .pdf-page-content canvas`)
          .evaluate((canvas: HTMLCanvasElement) => {
            const pixels = canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height).data
            let count = 0
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i + 3]! > 0 && Math.min(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) < 220)
                count++
            return count
          })
        expect(ink).toBeGreaterThan(1000)
      }).toPass({ timeout: 15000 })
    }
    await page.screenshot({ path: '/tmp/genoffice-pdf-codecs.png' })
  } finally {
    await closeAndSaveVideo(launched, 'pdf-codecs')
  }
})
