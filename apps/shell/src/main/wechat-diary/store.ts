import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SafeStorageLike } from '@genoffice/electron-utils'

export interface WechatDiaryStore {
  enabled: boolean
  aiEnabled: boolean
  diaryDir: string
  botToken: string
  baseUrl: string
  botId: string
  userId: string
  getUpdatesBuf: string
  lastFile: string
  lastInboundAt: number | null
  pendingImages: PendingWechatImage[]
  pendingReply: PendingWechatReply | null
  processedMessageIds: string[]
}

export interface PendingWechatImage {
  id: string
  messageId: string
  userId: string
  path: string
  mime: string
  createdAt: number
}

export interface PendingWechatReply {
  messageId: string
  userId: string
  reply: string
  clientId: string
  diaryPath: string
  appendToDiary: boolean
  consumeImageIds: string[]
}

interface StoredFile {
  enabled?: boolean
  aiEnabled?: boolean
  diaryDir?: string
  botTokenEncrypted?: string
  botToken?: string
  baseUrl?: string
  botId?: string
  userId?: string
  getUpdatesBuf?: string
  lastFile?: string
  lastInboundAt?: number | null
  pendingImages?: PendingWechatImage[]
  pendingReply?: PendingWechatReply | null
  processedMessageIds?: string[]
}

const EMPTY: WechatDiaryStore = {
  enabled: true,
  aiEnabled: true,
  diaryDir: '',
  botToken: '',
  baseUrl: '',
  botId: '',
  userId: '',
  getUpdatesBuf: '',
  lastFile: '',
  lastInboundAt: null,
  pendingImages: [],
  pendingReply: null,
  processedMessageIds: [],
}

function emptyStore(): WechatDiaryStore {
  return { ...EMPTY, pendingImages: [], pendingReply: null, processedMessageIds: [] }
}

function validPendingImage(value: unknown): value is PendingWechatImage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.messageId === 'string' &&
    typeof item.userId === 'string' &&
    typeof item.path === 'string' &&
    typeof item.mime === 'string' &&
    typeof item.createdAt === 'number'
  )
}

function validPendingReply(value: unknown): value is PendingWechatReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.messageId === 'string' &&
    typeof item.userId === 'string' &&
    typeof item.reply === 'string' &&
    typeof item.clientId === 'string' &&
    typeof item.diaryPath === 'string' &&
    typeof item.appendToDiary === 'boolean' &&
    Array.isArray(item.consumeImageIds) &&
    item.consumeImageIds.every((id) => typeof id === 'string')
  )
}

export function wechatDiaryStorePath(userData: string): string {
  return join(userData, 'wechat-diary.json')
}

function encrypt(value: string, safe: SafeStorageLike): string {
  if (!value) return ''
  if (!safe.isEncryptionAvailable()) {
    throw new Error('本机无法安全保存微信绑定凭据')
  }
  return Buffer.from(safe.encryptString(value)).toString('base64')
}

function decrypt(value: string, safe: SafeStorageLike): string {
  if (!value) return ''
  try {
    if (!safe.isEncryptionAvailable()) return ''
    return safe.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

export function loadWechatDiaryStore(userData: string, safe: SafeStorageLike): WechatDiaryStore {
  const path = wechatDiaryStorePath(userData)
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyStore()
    const rec = raw as StoredFile
    const token = rec.botTokenEncrypted
      ? decrypt(rec.botTokenEncrypted, safe)
      : typeof rec.botToken === 'string'
        ? rec.botToken
        : ''
    return {
      enabled: rec.enabled !== false,
      aiEnabled: rec.aiEnabled !== false,
      diaryDir: typeof rec.diaryDir === 'string' ? rec.diaryDir : '',
      botToken: token,
      baseUrl: typeof rec.baseUrl === 'string' ? rec.baseUrl : '',
      botId: typeof rec.botId === 'string' ? rec.botId : '',
      userId: typeof rec.userId === 'string' ? rec.userId : '',
      getUpdatesBuf: typeof rec.getUpdatesBuf === 'string' ? rec.getUpdatesBuf : '',
      lastFile: typeof rec.lastFile === 'string' ? rec.lastFile : '',
      lastInboundAt: typeof rec.lastInboundAt === 'number' ? rec.lastInboundAt : null,
      pendingImages: Array.isArray(rec.pendingImages)
        ? rec.pendingImages.filter(validPendingImage).slice(-20)
        : [],
      pendingReply: validPendingReply(rec.pendingReply) ? rec.pendingReply : null,
      processedMessageIds: Array.isArray(rec.processedMessageIds)
        ? rec.processedMessageIds.filter((id): id is string => typeof id === 'string').slice(-200)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

export function saveWechatDiaryStore(
  userData: string,
  store: WechatDiaryStore,
  safe: SafeStorageLike,
): void {
  const path = wechatDiaryStorePath(userData)
  mkdirSync(dirname(path), { recursive: true })
  const out: StoredFile = {
    enabled: store.enabled,
    aiEnabled: store.aiEnabled,
    diaryDir: store.diaryDir,
    botTokenEncrypted: store.botToken ? encrypt(store.botToken, safe) : '',
    baseUrl: store.baseUrl,
    botId: store.botId,
    userId: store.userId,
    getUpdatesBuf: store.getUpdatesBuf,
    lastFile: store.lastFile,
    lastInboundAt: store.lastInboundAt,
    pendingImages: store.pendingImages.slice(-20),
    pendingReply: store.pendingReply,
    processedMessageIds: store.processedMessageIds.slice(-200),
  }
  writeFileSync(path, JSON.stringify(out, null, 2), { mode: 0o600 })
  chmodSync(path, 0o600)
}

export function maskUserId(id: string): string | null {
  if (!id) return null
  const core = id.replace(/@im\.wechat$/u, '')
  if (core.length <= 8) return core
  return `${core.slice(0, 4)}…${core.slice(-4)}`
}
