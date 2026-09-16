import { test, expect } from '@playwright/test'
import { writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { PNG } from 'pngjs'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('Word prints the same physical image size and position at 100% and 70% view zoom', async ({}, testInfo) => {
  const launched = await launchShell({
    onboardingSeen: true,
    recordVideo: false,
    lang: 'zh',
    videoDir: 'word-print-size',
  })
  const { app, page } = launched
  try {
    await page.locator('.quick-card').first().click()
    const doc = await waitForPageWithUrl(app, 'docs/out')
    await doc.locator('.ProseMirror').first().click()
    await doc.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 500
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 400, 500)
      const editor = (window as any).__aidocs.editor
      editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'docProtected',
            attrs: {
              blockType: 'image',
              imageDataUrl: canvas.toDataURL(),
              imageWidthPx: 400,
              imageHeightPx: 500,
              imageAlign: 'center',
            },
          },
        ],
      })
    })
    await app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('docs/out'))!
      // Exercise the real docs:print handler; replace only the native printer UI with PDF capture.
      wc.print = ((options: any, callback: any) => {
        ;(globalThis as any).__printOptions = options
        wc.printToPDF({
          printBackground: true,
          scale: options.scaleFactor / 100,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          pageSize: {
            width: options.pageSize.width / 25400,
            height: options.pageSize.height / 25400,
          },
        })
          .then((buffer) => {
            ;(globalThis as any).__printedPdf = buffer.toString('base64')
            callback(true)
          })
          .catch((error) => callback(false, String(error)))
      }) as typeof wc.print
      wc.send('menu:command', 'zoom-100')
      wc.send('menu:command', 'page-setup')
    })
    await doc.getByRole('button', { name: '纸张大小', exact: true }).click()
    await doc.locator('.layout-menu button').filter({ hasText: /^A421/ }).click()
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const zoom of [100, 70]) {
      if (zoom === 70) {
        await doc.locator('.pv-toolbar').getByRole('button', { name: '关闭', exact: true }).click()
        for (let i = 0; i < 3; i++) {
          await app.evaluate(({ webContents }) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL().includes('docs/out'))!
              .send('menu:command', 'zoom-out'),
          )
        }
      }
      await expect(doc.locator('.doc-zoom')).toHaveCSS('zoom', String(zoom / 100))
      await app.evaluate(({ Menu }) => {
        const file = Menu.getApplicationMenu()!.items.find((i) =>
          i.submenu?.items.some((s) => s.accelerator === 'CmdOrCtrl+P'),
        )!
        const print = file.submenu!.items.find((i) => i.accelerator === 'CmdOrCtrl+P')!
        print.click(undefined as any, undefined as any, undefined as any)
      })
      await expect(doc.locator('.pv-page img').first()).toBeVisible()
      await doc.locator('.pv-toolbar').getByRole('button', { name: '打印…', exact: true }).click()
      await expect(
        doc.locator('.pv-toolbar').getByRole('button', { name: '打印…', exact: true }),
      ).toBeEnabled()
      const captured = await app.evaluate(() => ({
        options: (globalThis as any).__printOptions,
        pdf: (globalThis as any).__printedPdf,
      }))
      expect(captured.options.scaleFactor).toBe(100)
      expect(captured.options.margins.marginType).toBe('none')
      expect(Math.abs(captured.options.pageSize.width - 210000)).toBeLessThan(20)
      expect(Math.abs(captured.options.pageSize.height - 297000)).toBeLessThan(20)
      const pdfPath = testInfo.outputPath(`print-${zoom}.pdf`)
      writeFileSync(pdfPath, Buffer.from(captured.pdf, 'base64'))
      const prefix = testInfo.outputPath(`print-${zoom}`)
      execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-r', '96', '-png', pdfPath, prefix])
      const png = PNG.sync.read(readFileSync(prefix + '.png'))
      let left = png.width,
        top = png.height,
        right = -1,
        bottom = -1
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++) {
          const i = (y * png.width + x) * 4
          if (png.data[i] > 220 && png.data[i + 1] < 40 && png.data[i + 2] < 40) {
            left = Math.min(left, x)
            right = Math.max(right, x)
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
      const box = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
      expect(Math.abs(box.w - 400)).toBeLessThanOrEqual(2)
      expect(Math.abs(box.h - 500)).toBeLessThanOrEqual(2)
      expect(Math.abs((left + right + 1) / 2 - png.width / 2)).toBeLessThanOrEqual(3)
      boxes.push(box)
    }
    expect(boxes[1]).toEqual(boxes[0])
  } finally {
    await closeAndSaveVideo(launched, 'word-print-size')
  }
})
