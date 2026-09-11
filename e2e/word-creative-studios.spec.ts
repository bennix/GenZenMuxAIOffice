import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl, screenshotPath } from './helpers'

test('Word embeds LoveArt, inserts an image, and generates a readable gongwen DOCX', async () => {
  const launched = await launchShell({
    onboardingSeen: true,
    recordVideo: false,
    lang: 'zh',
    videoDir: 'word-creative-studios',
  })
  const { app, page } = launched
  try {
    await page.locator('.quick-card').first().click()
    const doc = await waitForPageWithUrl(app, 'docs/out')
    const errors: string[] = []
    doc.on('pageerror', (error) => errors.push(error.message))
    await doc.getByRole('button', { name: '插入', exact: true }).click()
    await doc.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#2680c2'
      ctx.fillRect(0, 0, 120, 80)
      localStorage.setItem(
        'zenoffice_loveart_projects',
        JSON.stringify({
          state: {
            projects: [{ id: 'office-test', name: 'Office 集成测试', createdAt: Date.now() }],
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        'zenoffice_loveart_canvas',
        JSON.stringify({
          state: {
            cards: [
              {
                id: 'test-image',
                projectId: 'office-test',
                type: 'image',
                status: 'ready',
                url: canvas.toDataURL(),
                prompt: '测试图片',
                x: 450,
                y: 180,
                w: 300,
                h: 240,
                createdAt: Date.now(),
              },
            ],
            humanScenes: [],
          },
          version: 0,
        }),
      )
    })
    await doc.getByRole('button', { name: 'AI 生图', exact: true }).click()
    const art = doc.frameLocator('iframe[title="LoveArt 创作工作台"]')
    await art.getByRole('button', { name: 'Office 集成测试', exact: true }).click()
    await expect(art.getByRole('button', { name: '插入文档', exact: true })).toBeVisible()
    await art.getByRole('button', { name: '插入文档', exact: true }).click()
    await expect(art.getByRole('status')).toContainText('已插入文档')
    await doc.screenshot({ path: screenshotPath('word-loveart-studio') })
    await doc.getByRole('button', { name: '返回文档', exact: true }).click()
    await expect(doc.locator('.ProseMirror img[src^="data:image/png"]')).toHaveCount(1)
    await doc.getByRole('button', { name: '设计', exact: true }).click()
    await doc.getByRole('button', { name: '公文排版', exact: true }).click()
    const studio = doc.getByRole('dialog', { name: '公文排版 GB/T 9704' })
    await studio.getByLabel('公文标题', { exact: true }).fill('工作报告')
    await studio
      .getByLabel('正文（可编辑 Markdown；图片不会转换为正文）')
      .fill('一、工作进展\n\n本阶段已完成系统测试。\n\n（一）后续安排\n\n继续开展验证。')
    // Exercise the real renderer -> preload -> main IPC without spending API credits.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ai:chat')
      ipcMain.handle('ai:chat', (_event, request) => {
        if (!request.user.includes('工作报告')) return { ok: false, error: '缺少标题上下文' }
        return {
          ok: true,
          content: request.system.includes('只输出检查建议')
            ? '建议补充下一步工作的责任主体。'
            : '一、工作进展\n\n本阶段已完成系统测试。\n\n二、后续安排\n\n继续开展验证并落实责任。',
        }
      })
    })
    const body = studio.getByLabel('正文（可编辑 Markdown；图片不会转换为正文）')
    const original = await body.inputValue()
    await studio.getByLabel('写作要求', { exact: true }).fill('起草工作报告，保留所有事实。')
    await studio.getByRole('button', { name: 'AI 起草', exact: true }).click()
    await expect(studio.getByLabel('AI 建议稿', { exact: true })).toHaveValue(/落实责任/)
    await expect(body).toHaveValue(original)
    await studio.getByRole('button', { name: '关闭建议', exact: true }).click()
    await studio.getByRole('button', { name: 'AI 润色', exact: true }).click()
    await expect(studio.getByLabel('AI 建议稿', { exact: true })).toHaveValue(/落实责任/)
    await studio.getByRole('button', { name: '采用到正文', exact: true }).click()
    await expect(body).toHaveValue(/落实责任/)
    const adopted = await body.inputValue()
    await studio.getByRole('button', { name: 'AI 检查', exact: true }).click()
    await expect(studio.getByLabel('AI 检查建议', { exact: true })).toHaveValue(/责任主体/)
    await expect(studio.getByRole('button', { name: '采用到正文', exact: true })).toHaveCount(0)
    await expect(body).toHaveValue(adopted)
    await doc.screenshot({ path: screenshotPath('word-gongwen-ai') })
    await studio.getByRole('button', { name: '关闭建议', exact: true }).click()
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ai:chat')
      ipcMain.handle('ai:chat', () => ({ ok: false, error: '测试网络错误' }))
    })
    await studio.getByRole('button', { name: 'AI 润色', exact: true }).click()
    await expect(studio.getByRole('alert')).toContainText('测试网络错误')
    await expect(body).toHaveValue(adopted)
    await doc.screenshot({ path: screenshotPath('word-gongwen-studio') })
    const output = join(launched.userDataDir, 'gongwen-test.docx')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog
    }, output)
    await studio.getByRole('button', { name: '生成并另存 DOCX' }).click()
    await expect(studio.getByRole('status')).toContainText('已保存：')
    const zip = await JSZip.loadAsync(await readFile(output))
    expect(await zip.file('word/document.xml')!.async('string')).toContain('本阶段已完成系统测试。')
    await studio.getByRole('button', { name: '在 Word 中打开' }).click()
    await expect(page.locator('.tab-bar .tab-item:not(.tab-home)')).toHaveCount(2)
    await expect
      .poll(
        () =>
          app
            .windows()
            .filter((candidate) => candidate !== doc && candidate.url().includes('docs/out'))
            .length,
      )
      .toBe(1)
    const opened = app
      .windows()
      .find((candidate) => candidate !== doc && candidate.url().includes('docs/out'))
    expect(opened).toBeDefined()
    await expect(opened!.locator('.ProseMirror')).toContainText('本阶段已完成系统测试。')
    expect(errors).toEqual([])
  } finally {
    await closeAndSaveVideo(launched, 'word-creative-studios')
  }
})
