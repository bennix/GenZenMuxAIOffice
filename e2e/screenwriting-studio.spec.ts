import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl, screenshotPath } from './helpers'

for (const kind of ['word', 'markdown'] as const) {
  test(`${kind} screenwriting loads a skill, previews AI, and appends editable text`, async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      lang: 'zh',
      videoDir: `screenwriting-${kind}`,
    })
    const { app, page } = launched
    try {
      if (kind === 'word') await page.locator('.quick-card').first().click()
      else await page.locator('.quick-card', { hasText: 'AI Markdown' }).click()
      const doc = await waitForPageWithUrl(app, kind === 'word' ? 'docs/out' : 'markdown/out')
      await doc.route(
        'https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/**',
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: '---\nname: sw-premise-theme\n---\n# 技能验证：主题与因果',
          }),
      )
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('ai:chat')
        ipcMain.handle('ai:chat', (_event, request) => {
          if (
            !request.system.includes('技能验证：主题与因果') ||
            !request.user.includes('夜班司机')
          )
            return { ok: false, error: '缺少编剧技能或创作要求' }
          return {
            ok: true,
            content: '内景 · 车站 · 夜\n司机：你终于来了。\n<img src=x onerror=alert(1)>',
          }
        })
      })
      const editor = doc.locator('.ProseMirror').first()
      await editor.fill('保留原有文稿')
      if (kind === 'word') await doc.getByRole('button', { name: '设计', exact: true }).click()
      await doc.screenshot({ path: screenshotPath(`screenwriting-${kind}-entry`) })
      await doc.getByRole('button', { name: 'AI 编剧', exact: true }).click()
      const studio = doc.getByRole('dialog', { name: 'AI 编剧工作台' })
      await expect(studio.getByLabel('剧本素材（从当前文档提取，可编辑）')).toHaveValue(
        /保留原有文稿/,
      )
      await studio.getByLabel('创作要求', { exact: true }).fill('夜班司机重逢旧友，写一个短片构思')
      await studio.getByRole('button', { name: 'AI 生成', exact: true }).click()
      await expect(studio.getByLabel('AI 建议稿（可编辑）')).toHaveValue(/你终于来了/)
      await expect(editor).not.toContainText('你终于来了')
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('ai:chat')
        ipcMain.handle('ai:chat', () => ({ ok: false, error: '测试网络错误' }))
      })
      await studio.getByRole('button', { name: 'AI 生成', exact: true }).click()
      await expect(studio.getByRole('alert')).toContainText('测试网络错误')
      await expect(studio.getByLabel('AI 建议稿（可编辑）')).toHaveValue(/你终于来了/)
      await doc.screenshot({ path: screenshotPath(`screenwriting-${kind}`) })
      await studio.getByRole('button', { name: '插入到文档末尾' }).click()
      await expect(studio).toHaveCount(0)
      await expect(editor).toContainText('保留原有文稿')
      await expect(editor).toContainText('你终于来了')
      await expect(editor.locator('img')).toHaveCount(0)
      await doc.getByRole('button', { name: 'AI 编剧', exact: true }).click()
      await studio.getByLabel('AI 建议稿（可编辑）').fill('旧版本建议不应写回')
      await app.evaluate(async ({ webContents, ipcMain }, kind) => {
        const module = kind === 'word' ? 'docs' : 'markdown'
        const target = webContents
          .getAllWebContents()
          .find((wc) => wc.getURL().includes(`${module}/out`))!
        const request = (args: object) =>
          new Promise<any>((resolve, reject) => {
            const requestId = `fixture-${Math.random()}`
            const timer = setTimeout(() => {
              ipcMain.removeListener(`${module}:mcp-result`, listener)
              reject(new Error('MCP timeout'))
            }, 5000)
            const listener = (_event: unknown, result: any) => {
              if (result.requestId !== requestId) return
              clearTimeout(timer)
              ipcMain.removeListener(`${module}:mcp-result`, listener)
              if (result.error) reject(new Error(result.error))
              else resolve(result.data)
            }
            ipcMain.on(`${module}:mcp-result`, listener)
            target.send(`${module}:mcp-request`, { requestId, ...args })
          })
        const before = await request({ action: 'read' })
        await request(
          kind === 'word'
            ? { action: 'insert', text: '生成期间的新修改', expectedRevision: before.revision }
            : {
                action: 'replace',
                text: before.text + '\n\n生成期间的新修改',
                expectedText: before.text,
              },
        )
      }, kind)
      await studio.getByRole('button', { name: '插入到文档末尾' }).click()
      await expect(studio.getByRole('alert')).toContainText('原文已变化')
      await expect(editor).toContainText('生成期间的新修改')
      await expect(editor).not.toContainText('旧版本建议不应写回')
    } finally {
      await closeAndSaveVideo(launched, `screenwriting-${kind}`)
    }
  })
}
