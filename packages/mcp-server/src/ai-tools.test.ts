import { expect, it, vi } from 'vitest'
import { ToolRegistry } from './registry'
import { registerAiTools } from './ai-tools'
import { applicationBridgeClient, startApplicationBridge } from './application-bridge'

it('recommends only selected columns and validates the result against all rows', async () => {
  const registry = new ToolRegistry()
  const chat = vi.fn(async () => ({
    content: JSON.stringify({
      chartId: 'column',
      x: '地区',
      y: ['收入'],
      title: '收入',
      reason: '比较地区收入',
    }),
  }))
  registerAiTools(registry, { status: () => ({}), chat })
  const context = { signal: new AbortController().signal }
  const table = { columns: ['地区', '收入', '保密备注'], rows: [['东区', 12, '不发送']] }
  const args = { table, selectedColumns: ['地区', '收入'] }
  const result = await registry.call('visualization_suggest', args, context)
  expect(result.isError).not.toBe(true)
  const output = JSON.parse(result.content[0]!.text)
  expect(output.svg).toContain('<svg')
  expect(output.request.table.columns).toEqual(['地区', '收入'])
  expect(JSON.stringify(chat.mock.calls)).not.toContain('不发送')
  expect(JSON.stringify(chat.mock.calls)).not.toContain('保密备注')
  expect(
    (
      await registry.call(
        'visualization_suggest',
        { ...args, selectedColumns: ['不存在'] },
        context,
      )
    ).isError,
  ).toBe(true)
  expect(chat).toHaveBeenCalledTimes(1)
  chat.mockResolvedValueOnce({
    content: JSON.stringify({
      chartId: 'column',
      x: '地区',
      y: ['保密备注'],
      title: '错误',
      reason: '错误',
    }),
  })
  expect((await registry.call('visualization_suggest', args, context)).isError).toBe(true)
})

it('validates AI input before invoking the service and preserves text', async () => {
  const registry = new ToolRegistry()
  const chat = vi.fn(async (_system, user) => ({ content: user }))
  registerAiTools(registry, { status: () => ({ configured: false }), chat })
  const context = { signal: new AbortController().signal }
  expect((await registry.call('ai_chat', { user: '', apiKey: 'injected' }, context)).isError).toBe(
    true,
  )
  expect(chat).not.toHaveBeenCalled()
  const result = await registry.call('ai_chat', { user: '生成公文提纲' }, context)
  expect(JSON.parse(result.content[0]!.text)).toEqual({ content: '生成公文提纲' })
  expect(chat).toHaveBeenCalledWith('', '生成公文提纲', context.signal)
})

it('propagates cancellation through the HTTP bridge to an in-flight AI service', async () => {
  const registry = new ToolRegistry()
  let started!: () => void
  let canceled!: () => void
  const start = new Promise<void>((resolve) => {
    started = resolve
  })
  const cancellation = new Promise<void>((resolve) => {
    canceled = resolve
  })
  registerAiTools(registry, {
    status: () => ({}),
    chat: async (_system, _user, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            canceled()
            reject(new Error('Canceled'))
          },
          { once: true },
        )
        started()
      }),
  })
  const token = 'c'.repeat(48)
  const bridge = await startApplicationBridge(registry, token)
  try {
    const controller = new AbortController()
    const pending = applicationBridgeClient(bridge.port, token)(
      'ai_chat',
      { user: 'test' },
      controller.signal,
    )
    const rejected = expect(pending).rejects.toThrow()
    await start
    controller.abort()
    await rejected
    await cancellation
  } finally {
    await bridge.close()
  }
})
