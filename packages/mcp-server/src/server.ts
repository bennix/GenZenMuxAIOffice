import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ToolRegistry } from './registry'

export function createMcpServer(registry: ToolRegistry): Server {
  const server = new Server(
    { name: 'zenoffice', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.list() }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const result = await registry.call(request.params.name, request.params.arguments ?? {}, {
      signal: extra.signal,
    })
    return { ...result }
  })
  return server
}
