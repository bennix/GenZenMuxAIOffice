import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

test('document AI services and native review UI share current document context without writing', async () => {
  test.setTimeout(120000)
  const requests: any[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body)
    const system = body.messages[0].content
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: system.includes('编剧助手')
                ? '内景 · 车站 · 夜\n可审阅的剧本建议'
                : system.includes('chair')
                  ? '委员会主席总结：需要补充证据。'
                  : '独立委员意见：建议补充证据。',
            },
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const modelPort = (server.address() as { port: number }).port
  // Obtain a free bridge port separately from the mock model server.
  const portProbe = createServer()
  await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve))
  const bridgePort = (portProbe.address() as { port: number }).port
  await new Promise<void>((resolve) => portProbe.close(() => resolve()))
  const env = {
    ZENOFFICE_MCP_PORT: String(bridgePort),
    ZENOFFICE_MCP_TOKEN: randomBytes(32).toString('hex'),
  }
  const launched = await launchShell({
    env,
    lang: 'zh',
    onboardingSeen: true,
    recordVideo: false,
    videoDir: 'mcp-writing',
  })
  const client = new Client({ name: 'writing-test', version: '1' })
  try {
    await writeFile(
      join(launched.userDataDir, 'ai-settings.json'),
      JSON.stringify({
        provider: 'zenmux',
        providers: {
          zenmux: {
            apiKey: 'fixture',
            model: 'fixture-model',
            baseUrl: `http://127.0.0.1:${modelPort}/v1`,
          },
        },
      }),
    )
    await launched.app.evaluate(() => {
      const original = globalThis.fetch
      globalThis.fetch = ((url: any, init: any) =>
        String(url).startsWith('https://raw.githubusercontent.com/jtydhr88/screenwriting-skills/')
          ? Promise.resolve(
              new Response('---\nname: fixture\n---\n# 共享编剧技能', { status: 200 }),
            )
          : original(url, init)) as typeof fetch
    })
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          '--import',
          resolve('node_modules/tsx/dist/loader.mjs'),
          resolve('packages/mcp-server/src/cli.ts'),
        ],
        env,
        stderr: 'pipe',
      }),
    )
    const call = async (name: string, args: any = {}) => {
      const result = await client.callTool({ name, arguments: args })
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
      return JSON.parse((result.content as any)[0].text)
    }
    for (const kind of ['docs', 'markdown']) {
      const path = join(launched.userDataDir, kind === 'docs' ? 'source.docx' : 'source.md')
      if (kind === 'docs') await copyFile(resolve('fixtures/generated/simple.docx'), path)
      else await writeFile(path, '# 审稿与编剧原稿\n')
      const before = await readFile(path)
      await call('application_open_file', { path })
      const page = await waitForPageWithUrl(launched.app, `${kind}/out`)
      const editor = page.locator('.ProseMirror').first()
      await expect(editor).toBeVisible()
      await editor.fill('当前未保存原稿：夜班司机重逢旧友。')
      const target = (await call('application_list_tabs')).find((tab: any) => tab.kind === kind)
      const screenplay = await call('ai_screenwriting', {
        targetId: target.id,
        task: 'sw-premise-theme',
        instruction: '发展主题',
      })
      expect(screenplay.content).toContain('剧本建议')
      expect(screenplay.inserted).toBe(false)
      expect(screenplay.source[kind === 'docs' ? 'revision' : 'expectedText']).toBeTruthy()
      expect(requests.at(-1).messages[1].content).toContain('当前未保存原稿')
      expect(requests.at(-1).messages[0].content).toContain('共享编剧技能')
      const review = await call('ai_review', {
        targetId: target.id,
        profileId: 'science',
        literature: false,
      })
      expect(review.members).toHaveLength(3)
      expect(review.chair.content).toContain('主席总结')
      expect(review.partial).toBe(false)
      await expect(editor).not.toContainText('剧本建议')
      await expect(editor).not.toContainText('主席总结')
      expect(await readFile(path)).toEqual(before)
      if (kind === 'docs') await page.getByRole('button', { name: '审阅', exact: true }).click()
      if (kind === 'docs')
        await page.getByTitle('AI Review Committee — ZenMux', { exact: true }).click()
      else await page.getByRole('button', { name: /AI.*审/ }).click()
      const modal = page.getByRole('dialog', { name: 'AI 审稿工作台' })
      await modal.locator('input[type="checkbox"]').uncheck()
      await modal.getByRole('button', { name: '开始严格审稿', exact: true }).click()
      await expect(modal).toContainText('委员会主席总结：需要补充证据。')
      await modal.getByRole('button', { name: /关闭|Close/ }).click()
    }
    const excel = await call('application_create_document', { kind: 'excel' })
    for (const name of ['ai_screenwriting', 'ai_review']) {
      const args =
        name === 'ai_screenwriting'
          ? { targetId: excel.tab.id, task: 'sw-premise-theme' }
          : { targetId: excel.tab.id }
      expect((await client.callTool({ name, arguments: args })).isError).toBe(true)
    }
  } finally {
    await client.close()
    await closeAndSaveVideo(launched, 'mcp-writing')
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
