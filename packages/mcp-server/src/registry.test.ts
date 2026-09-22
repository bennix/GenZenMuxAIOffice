import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from './registry'

it('advertises only registered operations with machine-readable input schemas', () => {
  const registry = new ToolRegistry()
  registry.register({
    name: 'word_read',
    module: 'word',
    description: 'Read document',
    readOnly: true,
    input: z.object({ fileId: z.string().min(1) }).strict(),
    execute: async ({ fileId }) => ({ fileId }),
  })
  expect(registry.list('excel')).toEqual([])
  expect(registry.list()[0]).toMatchObject({
    name: 'word_read',
    inputSchema: { type: 'object', required: ['fileId'] },
  })
})

it('validates before execution and returns handler results', async () => {
  const registry = new ToolRegistry()
  const execute = vi.fn(async ({ value }: { value: number }) => ({ doubled: value * 2 }))
  registry.register({
    name: 'test_double',
    module: 'test',
    description: 'Double',
    readOnly: true,
    input: z.object({ value: z.number().finite() }).strict(),
    execute,
  })
  const context = { signal: new AbortController().signal }
  expect((await registry.call('test_double', { value: '3' }, context)).isError).toBe(true)
  expect(execute).not.toHaveBeenCalled()
  expect(
    JSON.parse((await registry.call('test_double', { value: 3 }, context)).content[0]!.text),
  ).toEqual({ doubled: 6 })
  expect((await registry.call('missing', {}, context)).isError).toBe(true)
})

it('prevents canceled calls from executing and reports failures', async () => {
  const registry = new ToolRegistry()
  const execute = vi.fn(async () => {
    throw new Error('File closed')
  })
  registry.register({
    name: 'test_error',
    module: 'test',
    description: 'Error',
    readOnly: true,
    input: z.object({}),
    execute,
  })
  expect((await registry.call('test_error', {}, { signal: AbortSignal.abort() })).isError).toBe(
    true,
  )
  expect(execute).not.toHaveBeenCalled()
  expect(
    (await registry.call('test_error', {}, { signal: new AbortController().signal })).content[0]!
      .text,
  ).toContain('File closed')
})
