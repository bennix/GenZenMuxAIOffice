import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import JSZip from 'jszip'
import { createBlankPptx } from '../packages/pptx-engine/src/blank'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('shared images are inserted and saved in Word, PPT, MD and PDF', async () => {
  test.setTimeout(180000)
  const dir = await mkdtemp(join(tmpdir(), 'image-share-'))
  const files = {
    docs: join(dir, 'target.docx'),
    slides: join(dir, 'target.pptx'),
    markdown: join(dir, 'target.md'),
    pdf: join(dir, 'target.pdf'),
  }
  await copyFile(resolve('fixtures/generated/simple.docx'), files.docs)
  await writeFile(files.slides, await createBlankPptx())
  await writeFile(files.markdown, '# 原有正文\n')
  const pdf = await PDFDocument.create()
  pdf.addPage([600, 800])
  await writeFile(files.pdf, await pdf.save())
  const launched = await launchShell({
    onboardingSeen: true,
    recordVideo: false,
    lang: 'zh',
    videoDir: 'image-share',
  })
  try {
    await launched.page.locator('.quick-card').first().click()
    const source = await waitForPageWithUrl(launched.app, 'docs/out')
    await expect(source.locator('.ProseMirror').first()).toBeVisible()
    const dataUrl = await source.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 100
      canvas.height = 60
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#16806c'
      ctx.fillRect(0, 0, 100, 60)
      return canvas.toDataURL('image/png')
    })
    for (const [kind, path] of Object.entries(files)) {
      await launched.page.evaluate(async (path) => {
        await (window as any).aiOffice.openPath(path)
      }, path)
      await expect
        .poll(
          () =>
            launched.app
              .windows()
              .filter((page) => page !== source && page.url().includes(`${kind}/out`)).length,
        )
        .toBe(1)
      const target = launched.app
        .windows()
        .find((page) => page !== source && page.url().includes(`${kind}/out`))!
      await expect(
        target
          .locator(
            kind === 'docs' || kind === 'markdown'
              ? '.ProseMirror'
              : kind === 'pdf'
                ? '.pdf-page'
                : '.konvajs-content',
          )
          .first(),
      ).toBeVisible()
      const result = await source.evaluate(
        async ({ kind, dataUrl }) => {
          const api = (window as any).desktop
          const targets = await api.listImageShareTargets()
          const target = targets.find((entry: any) => entry.kind === kind)
          if (!target) throw new Error('Target not listed')
          return api.shareImage(target.id, dataUrl)
        },
        { kind, dataUrl },
      )
      expect(result).toEqual({ ok: true })
      await target.locator('.qa-btn').first().click()
      await expect(async () => {
        if (kind === 'markdown') {
          expect(await readFile(path, 'utf8')).toContain('原有正文')
          expect(await readFile(path, 'utf8')).toMatch(/!\[.*\]\(/)
        } else if (kind === 'pdf') {
          const saved = await PDFDocument.load(await readFile(path))
          const images = saved.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
          expect(images?.keys().length).toBeGreaterThan(0)
        } else {
          const zip = await JSZip.loadAsync(await readFile(path))
          expect(
            Object.keys(zip.files).filter((key) => /^(word|ppt)\/media\/.*\.png$/.test(key)).length,
            `${kind}: shared image must be saved`,
          ).toBeGreaterThan(0)
        }
      }).toPass({ timeout: 20000 })
    }
    const invalid = await source.evaluate(async () =>
      (window as any).desktop.shareImage('closed-file', 'data:image/png;base64,YWJj'),
    )
    expect(invalid.ok).toBe(false)
  } finally {
    await closeAndSaveVideo(launched, 'image-share')
  }
})
