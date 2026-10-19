import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('Markdown preview and PDF render equations without TeX source or code pagination loss', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'markdown-math-print-'))
  const source = join(dir, 'math.md')
  const target = join(dir, 'math.pdf')
  const code = Array.from({ length: 80 }, (_, index) => `print("line_${index}")`).join('\n')
  const markdown = [
    '# Formula print regression',
    String.raw`- \[ \] 输入处理 $\\to$ 核心变换 $\\to$ 输出返回。`,
    String.raw`> \*\*函数：` + '`update_dict(d)**`',
    String.raw`$$
\frac{a_1}{b^2} + \sqrt{x}
$$`,
    '```python\n' + code + '\n```',
    'End of document',
  ].join('\n\n')
  await writeFile(source, markdown)
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'markdown-pdf-math',
    recordVideo: false,
    openFile: source,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, 'markdown/out')
    await expect(page.locator('.doc-editor .katex')).toHaveCount(3)
    await expect(page.locator('.doc-editor')).not.toContainText('$')
    await expect(page.locator('.doc-editor strong')).toContainText('update_dict(d)')
    await launched.app.evaluate(({ dialog, webContents }, targetPath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: targetPath,
      })) as typeof dialog.showSaveDialog
      webContents
        .getAllWebContents()
        .find((item) => item.getURL().includes('markdown/out'))!
        .send('markdown:export-request', 'pdf')
    }, target)
    await expect
      .poll(async () =>
        (await readFile(target).catch(() => Buffer.alloc(0))).subarray(0, 4).toString(),
      )
      .toBe('%PDF')
    const text = execFileSync('pdftotext', [target, '-'], { encoding: 'utf8' })
    expect(text).toContain('→')
    expect(text).not.toContain('\\to')
    expect(text).not.toContain('$')
    expect(text).toContain('line_0')
    expect(text).toContain('line_79')
    expect(text).toContain('End of document')
    expect(await readFile(source, 'utf8')).toBe(markdown)
  } finally {
    await closeAndSaveVideo(launched)
    await rm(dir, { recursive: true, force: true })
  }
})
