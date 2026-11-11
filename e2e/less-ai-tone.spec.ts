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
      await studio.getByRole('button', { name: '下一步', exact: true }).click()
      await studio.locator('summary').filter({ hasText: '只检查，不润色 / 局部修改' }).click()
      await studio.getByRole('button', { name: '仅检测原文', exact: true }).click()
      await expect(studio.getByRole('region', { name: '处理前检测', exact: true })).toContainText(
        '44.4%',
      )
      await studio.getByRole('button', { name: '上一步', exact: true }).click()
      if (kind === 'markdown') {
        await studio.locator('summary').filter({ hasText: '高级选项：检测方式与改写规则' }).click()
        await studio.getByLabel('检测方式', { exact: true }).selectOption('ai')
      }
      await studio.locator('summary').filter({ hasText: '只检查，不润色 / 局部修改' }).click()
      await studio.getByRole('button', { name: '检测并局部修改', exact: true }).click()
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

for (const kind of ['word', 'markdown'] as const) {
  test(`${kind}: structured polish preserves comparison symbols and supports undo`, async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      lang: 'zh',
      videoDir: `tone-writeback-${kind}`,
    })
    const { app, page } = launched
    try {
      if (kind === 'word') await page.locator('.quick-card').first().click()
      else await page.locator('.quick-card', { hasText: 'AI Markdown' }).click()
      const doc = await waitForPageWithUrl(app, kind === 'word' ? 'docs/out' : 'markdown/out')
      const editor = doc.locator('.ProseMirror').first()
      await editor.click()
      await doc.keyboard.type('说白了，a < b 且 c > d。')
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('ai:get-settings')
        ipcMain.handle('ai:get-settings', () => ({
          providers: { zenmux: { apiKey: 'test-only', model: 'test' } },
        }))
        ipcMain.removeHandler('ai:stream')
        ipcMain.handle('ai:stream', (event, request) => {
          const input = JSON.parse(request.messages[0].text)
          const text = JSON.stringify({
            segments: input.segments
              .map((segment: { id: number; text: string }) => ({
                id: segment.id,
                text: segment.text.replace('说白了，', ''),
              }))
              .reverse(),
          })
          event.sender.send('ai:stream-chunk', {
            requestId: request.requestId,
            type: 'delta',
            text,
          })
          event.sender.send('ai:stream-chunk', { requestId: request.requestId, type: 'done' })
        })
      })
      await doc.getByRole('button', { name: 'AI 检测 / 去 AI 味', exact: true }).click()
      const studio = doc.getByRole('dialog', { name: '去 AI 味工作台' })
      await studio.getByRole('button', { name: '下一步', exact: true }).click()
      await studio.getByRole('button', { name: '开始润色', exact: true }).click()
      await expect(studio.getByRole('button', { name: '应用选中修改' })).toBeEnabled()
      await expect(studio.getByRole('alert')).toHaveCount(0)
      await expect(editor).toContainText('说白了，')
      await studio.getByRole('button', { name: '应用选中修改' }).click()
      await expect(editor).toContainText('a < b 且 c > d。')
      await expect(editor).not.toContainText('说白了')
      await editor.click()
      await doc.keyboard.press('ControlOrMeta+z')
      await expect(editor).toContainText('说白了，')
    } finally {
      await closeAndSaveVideo(launched, `tone-writeback-${kind}`)
    }
  })
}
