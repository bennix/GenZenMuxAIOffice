import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

it('starts from the documented command and communicates over stdio', async () => {
  const client = new Client({ name: 'stdio-verification', version: '1' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve('src/cli.ts')],
    stderr: 'pipe',
  })
  try {
    await client.connect(transport)
    expect((await client.listTools()).tools).toHaveLength(6)
    const result = await client.callTool({
      name: 'visualization_profile',
      arguments: {
        table: {
          columns: ['category', 'value'],
          rows: [
            ['A', 2],
            ['B', 5],
          ],
        },
      },
    })
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result.content)).toContain('histogram')
  } finally {
    await client.close()
  }
}, 15000)
