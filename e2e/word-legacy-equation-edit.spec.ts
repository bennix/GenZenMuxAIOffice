import { test, expect } from '@playwright/test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildDocx } from '../packages/docx-engine/tests/helpers/build-docx'
import { launchShell, waitForPageWithUrl, closeAndSaveVideo } from './helpers'

test('legacy equation shares the native editor and AI image draft includes surrounding context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zenoffice-equation-context-'))
  const file = join(directory, 'equation-context.docx')
  await writeFile(
    file,
    await buildDocx({
      withImage: true,
      bodyXml:
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Consistency loss</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Compare teacher and student predictions.</w:t></w:r></w:p>' +
        '<w:p><w:r><w:object xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><v:shape style="width:100pt;height:30pt"><v:imagedata r:id="rId10"/></v:shape><o:OLEObject ProgID="Equation.3"/></w:object></w:r><w:r><w:t>(10)</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>K is the number of classes.</w:t></w:r></w:p>',
    }),
  )
  const launched = await launchShell({
    onboardingSeen: true,
    recordVideo: false,
    videoDir: 'equation-context',
    openFile: file,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, 'docs/out')
    const equation = page.locator('.editor-scroll .doc-protected-ole').first()
    await expect(equation).toBeVisible()
    await equation.hover()
    await equation.getByRole('button', { name: 'Ask AI with equation image and context' }).click()
    const composer = page.locator('.ai-composer textarea')
    for (const text of [
      'equation-context.docx',
      'Consistency loss',
      '(10)',
      'teacher and student',
      'number of classes',
    ])
      await expect(composer).toHaveValue(new RegExp(text.replace(/[()]/g, '\\$&')))
    await expect(page.locator('.ai-composer .ai-attachment-thumb img')).toHaveCount(1)
    await equation.locator('.doc-ole-img').dblclick()
    const modal = page.locator('.equation-modal')
    await expect(modal).toBeVisible()
    await modal.getByRole('textbox', { name: 'LaTeX' }).fill('x^2 + y^2')
    const apply = modal.locator('.modal-actions .btn-primary')
    await expect(apply).toBeDisabled()
    await modal.locator('.equation-conversion-warning input').check()
    await apply.click()
    await expect(page.locator('.editor-scroll .doc-formula-math math')).toBeVisible()
    await expect(page.locator('.editor-scroll')).toContainText('(10)')
    await page.evaluate(async () => {
      await (window as unknown as { __aidocs: { save(): Promise<void> } }).__aidocs.save()
    })
    await expect
      .poll(async () => {
        const zip = await JSZip.loadAsync(await readFile(file))
        return zip.file('word/document.xml')!.async('string')
      })
      .toContain('<m:oMath')
    const zip = await JSZip.loadAsync(await readFile(file))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).not.toContain('<w:object')
    expect(xml).toContain('(10)')
    expect(xml).toContain('number of classes')
    await page.evaluate(async (path) => {
      await (
        window as unknown as { __aidocs: { openPath(path: string): Promise<void> } }
      ).__aidocs.openPath(path)
    }, file)
    await expect(page.locator('.editor-scroll')).toContainText('(10)')
    await page.locator('.editor-scroll .doc-inline-math').first().dblclick()
    await page.getByRole('button', { name: 'Add equation image and context to AI chat' }).click()
    await expect(page.locator('.ai-composer .ai-attachment-thumb img')).toHaveCount(2)
  } finally {
    await closeAndSaveVideo(launched, 'equation-context')
    await rm(directory, { recursive: true, force: true })
  }
})
