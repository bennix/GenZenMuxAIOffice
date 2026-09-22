import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './server'
import { ToolRegistry } from './registry'
import { registerVisualizationTools } from './visualization-tools'
import { registerApplicationTools } from './application-tools'
import { applicationBridgeClient } from './application-bridge'
import { registerProjectTools } from './project-tools'
import { registerKnowledgeTools } from './knowledge-tools'
import { registerImageTools } from './image-tools'
import { registerAiTools } from './ai-tools'
import { registerWritingTools } from './writing-tools'
import { registerMarkdownTools } from './markdown-tools'
import { registerWordTools } from './word-tools'

const registry = new ToolRegistry()
registerVisualizationTools(registry)
if (process.env.ZENOFFICE_MCP_PORT || process.env.ZENOFFICE_MCP_TOKEN) {
  const call = applicationBridgeClient(
    Number(process.env.ZENOFFICE_MCP_PORT),
    process.env.ZENOFFICE_MCP_TOKEN ?? '',
  )
  registerApplicationTools(registry, {
    status: () => call('application_status', {}),
    listTabs: () => call('application_list_tabs', {}),
    activateTab: (id) => call('application_activate_tab', { id }),
    openFile: (path) => call('application_open_file', { path }),
    createDocument: (kind) => call('application_create_document', { kind }),
  })
  registerMarkdownTools(registry, (id, request) => {
    const { action, ...args } = request
    return call(`markdown_${action}`, { id, ...args })
  })
  registerWordTools(registry, (id, request) => {
    const { action, ...args } = request
    return call(
      action === 'read' ? 'word_read_text' : action === 'insert' ? 'word_insert_text' : 'word_save',
      { id, ...args },
    )
  })
  registerProjectTools(registry, {
    list: () => call('projects_list', {}),
    create: (name) => call('projects_create', { name }),
    rename: (id, name) => call('projects_rename', { id, name }),
    files: (id) => call('projects_files', { id }),
    moveFile: (path, id) => call('projects_move_file', { path, id }),
    timeline: (id, limit) => call('projects_timeline', { id, limit }),
    chats: (id) => call('projects_chats', { id }),
    chat: (id, chatId, limit) => call('projects_chat_history', { id, chatId, limit }),
  })
  registerKnowledgeTools(registry, {
    list: (query, limit) => call('knowledge_list', { query, limit }),
    search: (args) => call('knowledge_search', args),
    delete: (id) => call('knowledge_delete', { id }),
    clear: () => call('knowledge_clear', {}),
    getSettings: () => call('knowledge_get_settings', {}),
    setSettings: (args) => call('knowledge_set_settings', args),
  })
  registerImageTools(registry, {
    targets: () => call('images_targets', {}),
    insert: (targetId, path) => call('images_insert', { targetId, path }),
  })
  registerAiTools(registry, {
    status: () => call('ai_status', {}),
    chat: (system, user, signal) => call('ai_chat', { system, user }, signal, 1_200_000),
  })
  registerWritingTools(registry, {
    screenwriting: (args, signal) => call('ai_screenwriting', args, signal, 1_200_000),
    review: (args, signal) => call('ai_review', args, signal, 1_200_000),
  })
}
const server = createMcpServer(registry)
await server.connect(new StdioServerTransport())
