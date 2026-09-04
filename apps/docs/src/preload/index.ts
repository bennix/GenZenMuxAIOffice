import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  DOCUMENT_DROP_CHANNEL,
  installDocumentDropBridge,
} from '@genoffice/electron-utils/document-drop'
import type { IpcRendererEvent } from 'electron'
import type {
  AiChatRequest,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  DesktopApi,
  MenuCommand,
  UiTheme,
} from '../shared/ipc'
import type { ProjectApi } from '@genoffice/project-store'

const api: DesktopApi = {
  listConnectTargets: () => ipcRenderer.invoke('connect:list-targets'),
  sendConnect: (targetId, text) => ipcRenderer.invoke('connect:send', targetId, text),
  listOpenFiles: () => ipcRenderer.invoke('tabs:open-files'),
  onConnectReceive: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: Parameters<typeof handler>[0]) =>
      handler(payload)
    ipcRenderer.on('connect:receive', listener)
    return () => ipcRenderer.removeListener('connect:receive', listener)
  },
  getLanguage: () => ipcRenderer.invoke('app:get-language'),
  onLanguageChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, lang: Parameters<typeof handler>[0]) =>
      handler(lang)
    ipcRenderer.on('app:language-changed', listener)
    return () => ipcRenderer.removeListener('app:language-changed', listener)
  },
  getTheme: () => ipcRenderer.invoke('app:get-theme'),
  onThemeChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  openDocx: () => ipcRenderer.invoke('docs:open'),
  openDocxPath: (path: string) => ipcRenderer.invoke('docs:open-path', path),
  consumePendingOpenDocx: () => ipcRenderer.invoke('docs:consume-pending-open'),
  consumeNewBlankDoc: () => ipcRenderer.invoke('docs:consume-new-blank'),
  onOpenDocx: (handler) => {
    const listener = (_event: IpcRendererEvent, result: Parameters<typeof handler>[0]) =>
      handler(result)
    ipcRenderer.on('docs:opened', listener)
    return () => ipcRenderer.removeListener('docs:opened', listener)
  },
  onRenamedDocx: (handler) => {
    const listener = (_event: IpcRendererEvent, paths: Parameters<typeof handler>[0]) =>
      handler(paths)
    ipcRenderer.on('docs:renamed', listener)
    return () => ipcRenderer.removeListener('docs:renamed', listener)
  },
  saveDocx: (path: string, data: ArrayBuffer, auto?: boolean) =>
    ipcRenderer.invoke('docs:save', path, data, auto === true),
  writeRecoveryCopy: (path: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('docs:write-recovery', path, data),
  onTeardown: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('docs:teardown', listener)
    return () => ipcRenderer.removeListener('docs:teardown', listener)
  },
  saveDocxAs: (defaultName: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('docs:save-as', defaultName, data),
  saveDocxNew: (defaultName: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('docs:save-new', defaultName, data),
  saveBibliography: (path: string, bibText: string) =>
    ipcRenderer.invoke('docs:save-bibliography', path, bibText),
  getRecentFiles: () => ipcRenderer.invoke('docs:recent'),
  pickImage: () => ipcRenderer.invoke('docs:pick-image'),
  print: () => ipcRenderer.invoke('docs:print'),
  exportPdf: (
    defaultName: string,
    pageWidthTwips: number,
    pageHeightTwips: number,
    outPath?: string,
  ) => ipcRenderer.invoke('docs:export-pdf', defaultName, pageWidthTwips, pageHeightTwips, outPath),
  printPdfBuffer: (pageWidthTwips: number, pageHeightTwips: number) =>
    ipcRenderer.invoke('docs:print-pdf-buffer', pageWidthTwips, pageHeightTwips),
  saveMergedPdf: (defaultName: string, base64Parts: string[], outPath?: string) =>
    ipcRenderer.invoke('docs:save-merged-pdf', defaultName, base64Parts, outPath),
  exportMarkdown: (defaultName: string, text: string) =>
    ipcRenderer.invoke('docs:export-markdown', defaultName, text),
  getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
  setAiSettings: (settings: AiSettings) => ipcRenderer.invoke('ai:set-settings', settings),
  aiChat: (request: AiChatRequest) => ipcRenderer.invoke('ai:chat', request),
  aiStream: (request: AiStreamRequest) => ipcRenderer.invoke('ai:stream', request),
  aiStreamCancel: (requestId: string) => ipcRenderer.invoke('ai:stream-cancel', requestId),
  webSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:web-search', query, maxResults),
  imageSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:image-search', query, maxResults),
  generateImage: (op) => ipcRenderer.invoke('ai:generate-image', op),
  fetchImage: (url: string) => ipcRenderer.invoke('ai:fetch-image', url),
  pickAttachments: () => ipcRenderer.invoke('files:pick'),
  addAttachmentPaths: (paths: string[]) => ipcRenderer.invoke('files:add', paths),
  addPastedImage: (data: ArrayBuffer, ext: string) =>
    ipcRenderer.invoke('files:add-pasted-image', data, ext),
  readAttachment: (path: string, offset: number, maxChars: number) =>
    ipcRenderer.invoke('files:read', path, offset, maxChars),
  readAttachmentImage: (path: string) => ipcRenderer.invoke('files:read-image', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openNewTab: (openPath?: string | null) => ipcRenderer.invoke('win:new', openPath ?? null),
  listDocsTabs: () => ipcRenderer.invoke('win:list'),
  focusDocsTab: (id: string) => ipcRenderer.invoke('win:focus', id),
  onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
    const listener = (_event: IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },
  onMenuCommand: (handler: (command: MenuCommand, payload?: string) => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand, payload?: string) =>
      handler(command, payload)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  onCloseCheck: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('docs:close-check', listener)
    return () => ipcRenderer.removeListener('docs:close-check', listener)
  },
  reportViewMenuState: (state: { aiSidebar: boolean; darkCanvas: boolean }) =>
    ipcRenderer.send('docs:view-menu-state', {
      aiSidebar: state?.aiSidebar === true,
      darkCanvas: state?.darkCanvas === true,
    }),
  reportCloseCheck: (state: { dirty: boolean; autoSave: boolean; filePath?: string | null }) =>
    ipcRenderer.send('docs:close-check-result', {
      dirty: state?.dirty === true,
      autoSave: state?.autoSave === true,
      filePath: typeof state?.filePath === 'string' ? state.filePath : null,
    }),
  onCloseSaveRequest: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('docs:close-save-request', listener)
    return () => ipcRenderer.removeListener('docs:close-save-request', listener)
  },
  reportCloseSaveResult: (ok: boolean) => ipcRenderer.send('docs:close-save-result', ok === true),
}

const projectApi: ProjectApi = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
  // P1 extensions
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (args) => ipcRenderer.invoke('project:create', args),
  renameProject: (args) => ipcRenderer.invoke('project:rename', args),
  deleteProject: (args) => ipcRenderer.invoke('project:delete', args),
  moveFile: (args) => ipcRenderer.invoke('project:moveFile', args),
  getTimeline: (args) => ipcRenderer.invoke('project:timeline', args),
  searchKnowledge: (args) => ipcRenderer.invoke('knowledge:search', args),
  listKnowledge: (args) => ipcRenderer.invoke('knowledge:list', args),
  deleteKnowledge: (args) => ipcRenderer.invoke('knowledge:delete', args),
  clearKnowledge: () => ipcRenderer.invoke('knowledge:clear'),
  getKnowledgeSettings: () => ipcRenderer.invoke('knowledge:getSettings'),
  setKnowledgeSettings: (args) => ipcRenderer.invoke('knowledge:setSettings', args),
}

contextBridge.exposeInMainWorld('desktop', api)
contextBridge.exposeInMainWorld('projectApi', projectApi)

installDocumentDropBridge({
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openPaths: (paths) => ipcRenderer.send(DOCUMENT_DROP_CHANNEL, paths),
})
