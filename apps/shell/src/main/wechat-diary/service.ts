import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, safeStorage, shell } from 'electron'
import { restoreAiSettingsFromDisk, type SafeStorageLike } from '@genoffice/electron-utils'
import { chatZenMux, defaultAiSettings, resolveAiSettings } from '@genoffice/ai-provider'
import type { AiSettings } from '@genoffice/ai-provider'
import { readFileSync } from 'node:fs'
import type { WechatDiaryPrefs, WechatDiaryStatus } from '../../shared/wechat-diary-api'
import {
  HELP_TEXT,
  NOTHING_TO_WITHDRAW,
  PING_TEXT,
  SAVED_TEXT,
  SEALED_TEXT,
  WITHDRAWN_TEXT,
  classifyWechatText,
} from './commands'
import {
  appendDiaryEntry,
  appendSeal,
  createDiaryDocument,
  recentDiaryContext,
  withdrawLastTurn,
} from './format'
import {
  type IlinkSession,
  ILINK_DEFAULT_BASE,
  ensureTypingTicket,
  getUpdates,
  normalizeIlinkBaseUrl,
  pollQrStatus,
  sendText,
  sendTyping,
  startQrLogin,
} from './ilink'
import { qrDataUrlFromPayload } from './qr'
import {
  loadWechatDiaryStore,
  maskUserId,
  saveWechatDiaryStore,
  type WechatDiaryStore,
} from './store'
import { formatHm, threeDayWindow } from './window'

export interface WechatDiaryDeps {
  userDataPath: () => string
  defaultSaveDir: () => string
  readAiSettings: () => AiSettings
  openMarkdown: (path: string) => void
  broadcast: (status: WechatDiaryStatus) => void
}

let deps: WechatDiaryDeps | null = null
let store: WechatDiaryStore | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let bindTimer: ReturnType<typeof setTimeout> | null = null
let running = false
let stopping = false
let bindQr = ''
let bindBase = ILINK_DEFAULT_BASE
let bindPhase: WechatDiaryStatus['bindPhase'] = 'idle'
let qrDataUrl: string | null = null
let qrOpenUrl: string | null = null
let pairHint: string | null = null
let lastError: string | null = null
const typingTickets = new Map<string, string>()

const safe: SafeStorageLike = safeStorage

function persist(): void {
  if (!deps || !store) return
  saveWechatDiaryStore(deps.userDataPath(), store, safe)
}

function defaultDiaryDir(): string {
  return join(deps?.defaultSaveDir() || '', '微信日记')
}

function publicStatus(): WechatDiaryStatus {
  const s = store
  return {
    enabled: s?.enabled !== false,
    aiEnabled: s?.aiEnabled !== false,
    bound: Boolean(s?.botToken),
    bindPhase,
    qrDataUrl,
    qrOpenUrl,
    pairHint,
    userLabel: maskUserId(s?.userId ?? ''),
    diaryDir: s?.diaryDir || defaultDiaryDir(),
    lastFile: s?.lastFile || null,
    lastError,
    lastInboundAt: s?.lastInboundAt ?? null,
    listening: running,
  }
}

function emit(): void {
  deps?.broadcast(publicStatus())
}

function session(): IlinkSession | null {
  if (!store?.botToken) return null
  return { botToken: store.botToken, baseUrl: store.baseUrl || ILINK_DEFAULT_BASE }
}

export function wechatDiaryStatus(): WechatDiaryStatus {
  return publicStatus()
}

export function initWechatDiary(next: WechatDiaryDeps): void {
  deps = next
  store = loadWechatDiaryStore(next.userDataPath(), safe)
  if (!store.diaryDir) store.diaryDir = defaultDiaryDir()
  bindPhase = store.botToken ? 'confirmed' : 'idle'
  if (store.enabled && store.botToken) startListening()
  emit()
}

export function stopWechatDiary(): void {
  stopping = true
  running = false
  if (pollTimer) clearTimeout(pollTimer)
  if (bindTimer) clearTimeout(bindTimer)
  pollTimer = null
  bindTimer = null
}

export function setWechatDiaryPrefs(prefs: WechatDiaryPrefs): WechatDiaryStatus {
  if (!store) return publicStatus()
  if (prefs.enabled !== undefined) store.enabled = prefs.enabled
  if (prefs.aiEnabled !== undefined) store.aiEnabled = prefs.aiEnabled
  if (prefs.diaryDir) store.diaryDir = prefs.diaryDir
  persist()
  if (store.enabled && store.botToken) startListening()
  else stopListening()
  emit()
  return publicStatus()
}

export async function startWechatBind(): Promise<WechatDiaryStatus> {
  lastError = null
  pairHint = null
  try {
    const tokens = store?.botToken ? [store.botToken] : []
    const started = await startQrLogin(tokens)
    bindQr = started.qrcode
    bindBase = started.baseUrl
    bindPhase = 'wait'
    const qr = await qrDataUrlFromPayload(started.imageOrUrl || started.qrcode)
    qrDataUrl = qr.dataUrl
    qrOpenUrl = qr.openUrl
    emit()
    scheduleBindPoll()
  } catch (err) {
    bindPhase = 'error'
    lastError = err instanceof Error ? err.message : String(err)
    emit()
  }
  return publicStatus()
}

export async function submitWechatPair(code: string): Promise<WechatDiaryStatus> {
  const trimmed = code.trim()
  if (!bindQr || !trimmed) return publicStatus()
  try {
    const st = await pollQrStatus(bindQr, bindBase, trimmed)
    await applyBindStatus(st)
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    bindPhase = 'error'
    emit()
  }
  return publicStatus()
}

export function unbindWechat(): WechatDiaryStatus {
  stopListening()
  if (store) {
    store.botToken = ''
    store.baseUrl = ''
    store.botId = ''
    store.userId = ''
    store.getUpdatesBuf = ''
    persist()
  }
  bindQr = ''
  bindPhase = 'idle'
  qrDataUrl = null
  qrOpenUrl = null
  pairHint = null
  typingTickets.clear()
  emit()
  return publicStatus()
}

export async function pickWechatDiaryDir(): Promise<WechatDiaryStatus> {
  const picked = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  if (!picked.canceled && picked.filePaths[0] && store) {
    store.diaryDir = picked.filePaths[0]
    persist()
    emit()
  }
  return publicStatus()
}

export function openLatestDiary(): string | null {
  const path = store?.lastFile
  if (!path || !deps) return null
  deps.openMarkdown(path)
  return path
}

export function openWechatQrUrl(): void {
  if (!qrOpenUrl) return
  try {
    const url = new URL(qrOpenUrl)
    normalizeIlinkBaseUrl(`${url.protocol}//${url.host}`)
    void shell.openExternal(url.toString())
  } catch {
    lastError = '微信绑定链接不是受信任的官方 HTTPS 地址'
    emit()
  }
}

function scheduleBindPoll(): void {
  if (bindTimer) clearTimeout(bindTimer)
  bindTimer = setTimeout(() => {
    void tickBind()
  }, 1200)
}

async function tickBind(): Promise<void> {
  if (!bindQr) return
  try {
    const st = await pollQrStatus(bindQr, bindBase)
    await applyBindStatus(st)
    if (bindPhase === 'wait' || bindPhase === 'scaned' || bindPhase === 'need_pair') {
      scheduleBindPoll()
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    bindPhase = 'error'
    emit()
  }
}

async function applyBindStatus(st: Awaited<ReturnType<typeof pollQrStatus>>): Promise<void> {
  if (st.redirectHost) {
    bindBase = normalizeIlinkBaseUrl(
      st.redirectHost.startsWith('http') ? st.redirectHost : `https://${st.redirectHost}`,
    )
  }
  if (st.status === 'scaned' || st.status === 'scaned_but_redirect') {
    bindPhase = 'scaned'
    emit()
    return
  }
  if (st.status === 'need_verifycode') {
    bindPhase = 'need_pair'
    pairHint = '请输入手机微信显示的配对数字'
    emit()
    return
  }
  if (st.status === 'expired' || st.status === 'verify_code_blocked') {
    bindPhase = 'expired'
    emit()
    return
  }
  if (st.status === 'confirmed' && st.botToken && store) {
    store.botToken = st.botToken
    store.baseUrl = st.baseUrl || bindBase || ILINK_DEFAULT_BASE
    store.botId = st.botId ?? store.botId
    store.userId = st.userId ?? store.userId
    persist()
    bindPhase = 'confirmed'
    qrDataUrl = null
    qrOpenUrl = null
    pairHint = null
    emit()
    if (store.enabled) startListening()
  }
}

function startListening(): void {
  if (running || !store?.botToken) return
  stopping = false
  running = true
  emit()
  void loopOnce()
}

function stopListening(): void {
  stopping = true
  running = false
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

function loopOnce(): void {
  if (stopping || !running) return
  void (async () => {
    const sess = session()
    if (!sess || !store) {
      running = false
      emit()
      return
    }
    try {
      const { msgs, cursor } = await getUpdates(sess, store.getUpdatesBuf)
      for (const msg of msgs) {
        await handleInbound(sess, msg.fromUserId, msg.contextToken, msg.text)
      }
      // Advance only after every message has been written/replied to. Persisting first can
      // silently lose the batch if the app exits while a message is still being handled.
      if (cursor !== store.getUpdatesBuf) {
        store.getUpdatesBuf = cursor
        persist()
      }
      lastError = null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/aborted/i.test(message)) lastError = message
    }
    if (!stopping && running) {
      pollTimer = setTimeout(() => loopOnce(), 400)
    } else {
      running = false
      emit()
    }
  })()
}

async function handleInbound(
  sess: IlinkSession,
  userId: string,
  contextToken: string,
  text: string,
): Promise<void> {
  if (!store || !deps) return
  store.lastInboundAt = Date.now()
  persist()
  emit()

  let ticket = typingTickets.get(userId) ?? ''
  if (!ticket) {
    ticket = await ensureTypingTicket(sess, userId, contextToken)
    if (ticket) typingTickets.set(userId, ticket)
  }
  await sendTyping(sess, userId, ticket, 1)

  const cmd = classifyWechatText(text)
  let reply = ''
  try {
    if (cmd.kind === 'help') reply = HELP_TEXT
    else if (cmd.kind === 'ping') reply = PING_TEXT
    else if (cmd.kind === 'withdraw') {
      const file = await currentDiaryPath()
      const current = await readUtf8(file)
      const next = withdrawLastTurn(current)
      if (next.removed) {
        await writeUtf8(file, next.next)
        reply = WITHDRAWN_TEXT
      } else reply = NOTHING_TO_WITHDRAW
    } else if (cmd.kind === 'seal') {
      const file = await currentDiaryPath()
      const current = await readUtf8(file)
      await writeUtf8(file, appendSeal(current || newDoc(), formatHm(Date.now())))
      reply = SEALED_TEXT
    } else if (cmd.kind === 'note') {
      await appendRole('wechat', cmd.text)
      reply = SAVED_TEXT
    } else if (cmd.kind === 'chat') {
      if (!cmd.text) {
        reply = '发文字即可记入当前三天窗口。'
      } else {
        await appendRole('wechat', cmd.text)
        if (store.aiEnabled) {
          const ai = await askAi(cmd.text)
          if (ai) {
            await appendRole('ai', ai)
            reply = ai
          } else {
            reply = '已记下。当前未配置可用的 AI（设置 → ZenMux），因此没有自动回复。'
          }
        } else {
          reply = SAVED_TEXT
        }
      }
    }
  } catch (err) {
    reply = `写入日记失败：${err instanceof Error ? err.message : String(err)}`
    lastError = reply
  }

  try {
    await sendText(sess, userId, contextToken, reply.slice(0, 4000))
  } finally {
    await sendTyping(sess, userId, ticket, 2)
    emit()
  }
}

function newDoc(): string {
  const win = threeDayWindow(Date.now())
  return createDiaryDocument(win.startIso, win.endIso)
}

async function currentDiaryPath(): Promise<string> {
  if (!store) throw new Error('微信日记未初始化')
  const win = threeDayWindow(Date.now())
  const dir = store.diaryDir || defaultDiaryDir()
  const folder = join(dir, win.year)
  await mkdir(folder, { recursive: true })
  const file = join(folder, win.fileName)
  store.lastFile = file
  persist()
  return file
}

async function appendRole(role: 'wechat' | 'ai', body: string): Promise<void> {
  const file = await currentDiaryPath()
  let current = await readUtf8(file)
  if (!current.trim()) current = newDoc()
  await writeUtf8(file, appendDiaryEntry(current, formatHm(Date.now()), role, body))
}

async function readUtf8(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

async function writeUtf8(path: string, text: string): Promise<void> {
  const { writeFile, rename, unlink } = await import('node:fs/promises')
  const { randomBytes } = await import('node:crypto')
  const { dirname, basename, join } = await import('node:path')
  const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
  await writeFile(tmp, text, 'utf8')
  try {
    await rename(tmp, path)
  } catch {
    await writeFile(path, text, 'utf8')
    try {
      await unlink(tmp)
    } catch {
      /* ignore */
    }
  }
}

async function askAi(userText: string): Promise<string> {
  if (!deps || !store) return ''
  const settings = deps.readAiSettings()
  const zenmux = settings.providers.zenmux
  if (!zenmux.apiKey.trim()) return ''
  const context = await (async () => {
    try {
      return recentDiaryContext(await readUtf8(await currentDiaryPath()))
    } catch {
      return ''
    }
  })()
  const system = [
    '你是用户通过微信接入的办公助手。用简洁中文回复，不要用 Markdown 标题。',
    '你的回复会写入用户本机的三天窗口日记。不要编造未提供的事实。',
    context ? `当前日记摘录：\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const result = await chatZenMux(zenmux, system, userText)
  return result.ok ? (result.content ?? '').trim() : ''
}

export function readLocalAiSettings(userData: string): AiSettings {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(userData, 'ai-settings.json'), 'utf8'))
    const stored =
      raw && typeof raw === 'object' ? (raw as Parameters<typeof restoreAiSettingsFromDisk>[0]) : {}
    const restored = restoreAiSettingsFromDisk(stored, safe)
    const settings = resolveAiSettings(restored.settings, defaultAiSettings())
    settings.provider = 'zenmux'
    return settings
  } catch {
    return defaultAiSettings()
  }
}
