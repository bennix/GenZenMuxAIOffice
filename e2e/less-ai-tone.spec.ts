import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl, screenshotPath } from './helpers'

for (const kind of ['word', 'markdown'] as const) {
  test(`${kind}: detects before/after percentages, applies reviewed text and undoes`, async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      lang: 'zh',
      videoDir: `less-ai-tone-${kind}`,
    })
    const { app, page } = launched
    try {
      if (kind === 'word') await page.locator('.quick-card').first().click()
      else await page.locator('.quick-card', { hasText: 'AI Markdown' }).click()
      const doc = await waitForPageWithUrl(app, kind === 'word' ? 'docs/out' : 'markdown/out')
      const editor = doc.locator('.ProseMirror').first()
      await editor.click()
      await doc.keyboard.type('说白了，预算不足。')
      const entry = doc.getByRole('button', { name: 'AI 检测 / 去 AI 味', exact: true })
      await expect(entry).toBeVisible()
      await expect(entry).toBeInViewport()
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('ai:chat')
        ipcMain.handle('ai:chat', (_event, request) => {
          const { segments } = JSON.parse(request.user)
          const source = segments.find((s: { text: string }) => s.text.includes('说白了，'))
          return {
            ok: true,
            content: JSON.stringify(
              source
                ? request.system.includes('只检测，不改写')
                  ? [{ id: source.id, quote: '说白了，', rule: 9 }]
                  : [{ id: source.id, before: '说白了，', after: '', rule: 9 }]
                : [],
            ),
          }
        })
      })
      await entry.click()
      const studio = doc.getByRole('dialog', { name: '去 AI 味工作台' })
      await studio.getByRole('button', { name: '仅检测原文', exact: true }).click()
      await expect(studio.getByRole('region', { name: '处理前检测', exact: true })).toContainText('44.4%')
      if (kind === 'markdown') await studio.getByLabel('检测方式', { exact: true }).selectOption('ai')
      await studio.getByRole('button', { name: '检测并去 AI 味', exact: true }).click()
      await expect(studio.getByRole('region', { name: '处理前检测', exact: true })).toContainText(
        '44.4%',
      )
      await expect(
        studio.getByRole('region', { name: '处理后检测（选中建议稿）', exact: true }),
      ).toContainText('0.0%')
      await expect(editor).toContainText('说白了，预算不足。')
      await studio.getByRole('checkbox').uncheck()
      await expect(studio.getByRole('button', { name: '应用选中修改' })).toBeDisabled()
      await studio.getByRole('checkbox').check()
      await expect(studio.getByRole('button', { name: '应用选中修改' })).toBeDisabled()
      await studio.getByRole('button', { name: '重新检测选中修改' }).click()
      await expect(studio.getByRole('button', { name: '应用选中修改' })).toBeEnabled()
      await doc.screenshot({ path: screenshotPath(`less-ai-tone-${kind}`) })
      await studio.getByRole('button', { name: '应用选中修改' }).click()
      await expect(studio).toHaveCount(0)
      await expect(editor).toContainText('预算不足。')
      await expect(editor).not.toContainText('说白了')
      await editor.click()
      await doc.keyboard.press('ControlOrMeta+z')
      await expect(editor).toContainText('说白了，预算不足。')
    } finally {
      await closeAndSaveVideo(launched, `less-ai-tone-${kind}`)
    }
  })
}
