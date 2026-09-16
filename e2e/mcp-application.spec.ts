import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { resolve, join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'
import { ProjectStore } from '../packages/project-store/src/index'
import JSZip from 'jszip'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'

test('MCP stdio operates the real desktop application', async () => {
  const listener = createServer()
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const address = listener.address() as { port: number }
  await new Promise<void>((resolve) => listener.close(() => resolve()))
  const env = {
    ZENOFFICE_MCP_PORT: String(address.port),
    ZENOFFICE_MCP_TOKEN: randomBytes(32).toString('hex'),
  }
  const launched = await launchShell({
    env,
    onboardingSeen: true,
    recordVideo: false,
    videoDir: 'mcp',
  })
  const client = new Client({ name: 'desktop-mcp-test', version: '1' })
  try {
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
    expect((await client.listTools()).tools).toHaveLength(38)
    const call = async (name: string, args = {}) => {
      const result = await client.callTool({ name, arguments: args })
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
      return JSON.parse((result.content as { text: string }[])[0]!.text)
    }
    expect((await call('application_status')).version).toBeTruthy()
    const aiStatus = await call('ai_status')
    expect(aiStatus).toEqual({ provider: 'zenmux', model: expect.any(String), configured: false })
    expect((await client.callTool({ name: 'ai_chat', arguments: { user: 'Hello' } })).isError).toBe(
      true,
    )
    const aiRequests: unknown[] = []
    const modelServer = createHttpServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      aiRequests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body,
      })
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ message: { content: body.messages[0].content.includes('数据可视化助手')
            ? JSON.stringify({ chartId: 'column', x: '地区', y: ['收入'], title: '收入比较', reason: '按地区比较收入' })
            : '公文提纲：一、背景；二、安排。' } }],
        }),
      )
    })
    await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', resolve))
    try {
      const modelPort = (modelServer.address() as { port: number }).port
      await writeFile(
        join(launched.userDataDir, 'ai-settings.json'),
        JSON.stringify({
          provider: 'zenmux',
          providers: {
            zenmux: {
              apiKey: 'fixture-key',
              model: 'fixture-model',
              baseUrl: `http://127.0.0.1:${modelPort}/v1`,
            },
          },
        }),
      )
      expect(await call('ai_status')).toEqual({
        provider: 'zenmux',
        model: 'fixture-model',
        configured: true,
      })
      expect(await call('ai_chat', { system: '中文回答', user: '生成公文提纲' })).toEqual({
        content: '公文提纲：一、背景；二、安排。',
      })
      expect(aiRequests).toEqual([
        {
          url: '/v1/chat/completions',
          authorization: 'Bearer fixture-key',
          body: expect.objectContaining({
            model: 'fixture-model',
            messages: [
              { role: 'system', content: '中文回答' },
              { role: 'user', content: '生成公文提纲' },
            ],
          }),
        },
      ])
      const recommended = await call('visualization_suggest', {
        table: { columns: ['地区', '收入', '备注'], rows: [['东区', 12, '禁止发送']] },
        selectedColumns: ['地区', '收入'], instruction: '比较收入',
      })
      expect(recommended.suggestion.y).toEqual(['收入'])
      expect(recommended.svg).toContain('<svg')
      expect(JSON.stringify(aiRequests.at(-1))).not.toContain('禁止发送')
      expect((await call('visualization_render_svg', recommended.request)).svg).toContain('<svg')
    } finally {
      await new Promise<void>((resolve) => {
        modelServer.close(() => resolve())
        modelServer.closeAllConnections()
      })
    }
    const store = new ProjectStore(launched.userDataDir)
    store.ensureDefaultProject()
    store.setKnowledgeSettings({ autoCapture: true, useForReplies: true })
    store.appendChatMessage('default', 'mcp-knowledge-test', {
      role: 'user',
      text: 'How to visualize revenue?',
    })
    store.appendChatMessage('default', 'mcp-knowledge-test', {
      role: 'assistant',
      text: 'Use a column chart to compare revenue across regions.',
    })
    const memories = await call('knowledge_list', { query: 'revenue' })
    expect(
      (await call('projects_chats', { id: 'default' })).some(
        (chat: { chatId: string }) => chat.chatId === 'mcp-knowledge-test',
      ),
    ).toBe(true)
    const history = await call('projects_chat_history', {
      id: 'default',
      chatId: 'mcp-knowledge-test',
      limit: 1,
    })
    expect(history).toHaveLength(1)
    expect(history[0].role).toBe('assistant')
    expect(
      (
        await client.callTool({
          name: 'projects_chat_history',
          arguments: { id: 'default', chatId: '../outside' },
        })
      ).isError,
    ).toBe(true)
    expect(memories).toHaveLength(1)
    expect(await call('knowledge_search', { query: 'revenue', projectId: 'default' })).toHaveLength(
      1,
    )
    const settings = await call('knowledge_get_settings')
    expect(await call('knowledge_set_settings', { maxResults: 3 })).toEqual({
      ...settings,
      maxResults: 3,
    })
    expect(store.getKnowledgeSettings().maxResults).toBe(3)
    expect(
      (await client.callTool({ name: 'knowledge_set_settings', arguments: { maxResults: 0 } }))
        .isError,
    ).toBe(true)
    expect(store.getKnowledgeSettings().maxResults).toBe(3)
    await call('knowledge_delete', { id: memories[0].id })
    expect(await call('knowledge_list')).toEqual([])
    expect(store.loadChat('default', 'mcp-knowledge-test')).toHaveLength(2)
    store.appendChatMessage('default', 'mcp-second-memory', {
      role: 'user',
      text: 'What is a histogram?',
    })
    store.appendChatMessage('default', 'mcp-second-memory', {
      role: 'assistant',
      text: 'A histogram displays the distribution of numeric observations.',
    })
    expect(await call('knowledge_list')).toHaveLength(1)
    await call('knowledge_clear')
    expect(await call('knowledge_list')).toEqual([])
    const created = await call('application_create_document', { kind: 'markdown' })
    expect(created.tab.kind).toBe('markdown')
    expect(created.saved).toBe(false)
    const markdownPage = await waitForPageWithUrl(launched.app, 'markdown/out')
    await expect(markdownPage.locator('.ProseMirror')).toBeVisible()
    expect((await client.callTool({ name: 'markdown_save', arguments: { id: created.tab.id } })).isError).toBe(true)
    expect((await client.callTool({ name: 'markdown_read', arguments: { id: 'missing' } })).isError).toBe(true)
    const imagePath = join(launched.userDataDir, 'mcp-image.png')
    await writeFile(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    expect(
      (await call('images_targets')).some((target: { id: string }) => target.id === created.tab.id),
    ).toBe(true)
    expect(await call('images_insert', { targetId: created.tab.id, path: imagePath })).toEqual({
      inserted: true, targetId: created.tab.id, saved: false,
    })
    await expect(markdownPage.locator('.ProseMirror img')).toHaveAttribute('src', /^data:image\/png;base64,/)
    expect(
      (
        await client.callTool({
          name: 'images_insert',
          arguments: { targetId: 'missing', path: imagePath },
        })
      ).isError,
    ).toBe(true)
    const file = join(launched.userDataDir, 'mcp-example.md')
    await writeFile(file, '---\ntitle: 保留元数据\n---\n\n# MCP 实际文件\n')
    const project = await call('projects_create', { name: 'MCP 测试项目' })
    expect((await call('projects_rename', { id: project.id, name: 'MCP 重命名项目' })).name).toBe(
      'MCP 重命名项目',
    )
    await call('projects_move_file', { path: file, id: project.id })
    expect(await call('projects_files', { id: project.id })).toEqual([file])
    expect(await call('projects_timeline', { id: project.id })).toEqual([])
    expect(
      (await call('projects_list')).some((item: { id: string }) => item.id === project.id),
    ).toBe(true)
    await call('application_open_file', { path: file })
    const tabs = await call('application_list_tabs')
    expect(tabs.some((tab: { filePath?: string }) => tab.filePath === file)).toBe(true)
    await expect
      .poll(
        () => launched.app.windows().filter((page) => page.url().includes('markdown/out')).length,
      )
      .toBe(2)
    const savedPage = launched.app
      .windows()
      .find((page) => page !== markdownPage && page.url().includes('markdown/out'))!
    await expect(savedPage.locator('.ProseMirror')).toContainText('MCP 实际文件')
    const targetId = tabs.find((tab: { filePath?: string }) => tab.filePath === file).id
    const before = await call('markdown_read', { id: targetId })
    expect(before.text).toContain('# MCP 实际文件')
    expect(before.text).not.toContain('保留元数据')
    const changed = await call('markdown_replace', {
      id: targetId, expectedText: before.text, text: '# MCP 已修改\n\n尚未保存的正文',
    })
    expect(changed.dirty).toBe(true)
    await expect(savedPage.locator('.ProseMirror')).toContainText('尚未保存的正文')
    expect((await call('markdown_read', { id: targetId })).text).toBe(changed.text)
    expect((await readFile(file, 'utf8'))).toContain('MCP 实际文件')
    expect((await client.callTool({ name: 'markdown_replace', arguments: {
      id: targetId, expectedText: before.text, text: '过期覆盖',
    } })).isError).toBe(true)
    await savedPage.locator('.ProseMirror').click()
    await savedPage.keyboard.press('Meta+z')
    await expect(savedPage.locator('.ProseMirror')).toContainText('MCP 实际文件')
    await call('markdown_replace', {
      id: targetId, expectedText: (await call('markdown_read', { id: targetId })).text,
      text: '# MCP 已修改\n\n尚未保存的正文',
    })
    expect((await call('markdown_save', { id: targetId })).dirty).toBe(false)
    const persisted = await readFile(file, 'utf8')
    expect(persisted).toContain('title: 保留元数据')
    expect(persisted).toContain('尚未保存的正文')
    expect(await call('images_insert', { targetId, path: imagePath })).toEqual({
      inserted: true,
      targetId,
      saved: false,
    })
    await expect(savedPage.locator('.ProseMirror img')).toHaveCount(1)
    await savedPage.locator('.qa-btn').first().click()
    await expect(async () => {
      const content = await readFile(file, 'utf8')
      const asset = content.match(/!\[.*?\]\((assets\/[^)]+)\)/)?.[1]
      expect(asset).toBeTruthy()
      expect(await readFile(join(launched.userDataDir, asset!))).toEqual(await readFile(imagePath))
    }).toPass()
    await call('application_activate_tab', { id: created.tab.id })
    expect(
      (await call('application_list_tabs')).find((tab: { id: string }) => tab.id === created.tab.id)
        .active,
    ).toBe(true)
    const invalid = await client.callTool({
      name: 'application_activate_tab',
      arguments: { id: 'missing' },
    })
    expect(invalid.isError).toBe(true)
    const wordPath = join(launched.userDataDir, 'mcp-word.docx')
    const originalWord = await readFile(resolve('fixtures/generated/simple.docx'))
    await writeFile(wordPath, originalWord)
    await call('application_open_file', { path: wordPath })
    const wordPage = await waitForPageWithUrl(launched.app, 'docs/out')
    await expect(wordPage.locator('.ProseMirror').first()).toBeVisible()
    const wordId = (await call('application_list_tabs')).find((tab: {filePath?:string}) => tab.filePath === wordPath).id
    let wordBefore: any
    await expect(async () => { wordBefore = await call('word_read_text', {id:wordId}); expect(wordBefore.totalChars).toBeGreaterThan(0) }).toPass()
    const pageText = await call('word_read_text', {id:wordId,offset:2,maxChars:5})
    expect(pageText.text).toBe(wordBefore.text.slice(2,7))
    expect(pageText.revision).toBe(wordBefore.revision)
    expect((await client.callTool({name:'word_read_text',arguments:{id:targetId}})).isError).toBe(true)
    const insertedText = '<b>MCP 字面文本</b>\n第二段由 MCP 插入'
    const inserted = await call('word_insert_text',{id:wordId,text:insertedText,expectedRevision:wordBefore.revision})
    expect(inserted.insertedParagraphs).toBe(2)
    expect(inserted.dirty).toBe(true)
    await expect(wordPage.locator('.ProseMirror').first()).toContainText('<b>MCP 字面文本</b>')
    expect((await readFile(wordPath))).toEqual(originalWord)
    expect((await client.callTool({name:'word_insert_text',arguments:{id:wordId,text:'过期插入',expectedRevision:wordBefore.revision}})).isError).toBe(true)
    await wordPage.locator('.ProseMirror').first().click()
    await wordPage.keyboard.press('Meta+z')
    await expect(wordPage.locator('.ProseMirror').first()).not.toContainText('MCP 字面文本')
    const afterUndo = await call('word_read_text',{id:wordId})
    expect(afterUndo.text).toBe(wordBefore.text)
    await call('word_insert_text',{id:wordId,text:insertedText,expectedRevision:afterUndo.revision})
    const savedWord = await call('word_save',{id:wordId})
    expect(savedWord.dirty).toBe(false)
    const wordZip = await JSZip.loadAsync(await readFile(wordPath))
    const wordXml = await wordZip.file('word/document.xml')!.async('string')
    expect(wordXml).toContain('&lt;b&gt;MCP 字面文本&lt;/b&gt;')
    expect(wordXml).toContain('第二段由 MCP 插入')
    expect((await call('word_read_text',{id:wordId})).text).toContain(wordBefore.text)
    const latestWord = await call('word_read_text',{id:wordId})
    await call('word_insert_text',{id:wordId,text:'外部修改后不得覆盖',position:'start',expectedRevision:latestWord.revision})
    await writeFile(wordPath,originalWord)
    expect((await client.callTool({name:'word_save',arguments:{id:wordId}})).isError).toBe(true)
    expect(await readFile(wordPath)).toEqual(originalWord)
    const svgPath = join(launched.userDataDir, 'chart.svg')
    const pdfPath = join(launched.userDataDir, 'chart.pdf')
    const chart = await call('visualization_render_svg', {
      chartId: 'column', table: { columns: ['地区', '收入'], rows: [['东区', 12], ['西区', 8]] },
      x: '地区', y: ['收入'], title: 'MCP 图表',
    })
    await writeFile(svgPath, chart.svg)
    expect((await client.callTool({ name: 'images_insert', arguments: { targetId: wordId, path: svgPath } })).isError).toBe(true)
    const blankPdf = await PDFDocument.create()
    blankPdf.addPage([600, 800])
    await writeFile(pdfPath, await blankPdf.save())
    await call('application_open_file', { path: pdfPath })
    const pdfPage = await waitForPageWithUrl(launched.app, 'pdf/out')
    await expect(pdfPage.locator('.pdf-page')).toBeVisible()
    const pdfTarget = (await call('images_targets')).find((target: any) => target.kind === 'pdf')
    expect(await call('images_insert', { targetId: pdfTarget.id, path: svgPath })).toEqual({ inserted: true, targetId: pdfTarget.id, saved: false })
    await expect(pdfPage.locator('.pdf-imgedit-img')).toHaveCount(1)
    await pdfPage.locator('.qa-btn').first().click()
    await expect(async () => {
      const saved = await PDFDocument.load(await readFile(pdfPath))
      expect(saved.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict).keys().length).toBeGreaterThan(0)
    }).toPass()
  } finally {
    await client.close()
    await closeAndSaveVideo(launched, 'mcp-application')
  }
})
