import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile as writeBinaryFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { dialog, safeStorage, shell } from 'electron'
import { restoreAiSettingsFromDisk, type SafeStorageLike } from '@genoffice/electron-utils'
import { chatZenMux, defaultAiSettings, resolveAiSettings } from '@genoffice/ai-provider'
import type { AiImageReference, AiSettings } from '@genoffice/ai-provider'
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
  type IlinkInbound,
  ILINK_DEFAULT_BASE,
  ensureTypingTicket,
  getUpdates,
  normalizeIlinkBaseUrl,
  pollQrStatus,
  sendText,
  sendTyping,
  startQrLogin,
} from './ilink'
import { downloadWechatImage } from './media'
import { qrDataUrlFromPayload } from './qr'
import { selectWechatImageBatch } from './image-batch'
import {
  loadWechatDiaryStore,
  maskUserId,
  saveWechatDiaryStore,
  type PendingWechatImage,
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
  if (prefs.diaryDir && prefs.diaryDir !== store.diaryDir) {
    store.diaryDir = prefs.diaryDir
    // Do not send images saved under a previous root after the user deliberately switches
    // diary folders. The files and Markdown entries themselves remain untouched there.
    store.pendingImages = []
  }
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
    store.pendingImages = []
    store.pendingReply = null
    store.processedMessageIds = []
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
      for (const msg of msgs) await handleInbound(sess, msg)
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

async function handleInbound(sess: IlinkSession, inbound: IlinkInbound): Promise<void> {
  if (!store || !deps) return
  const messageId = inbound.messageId || fallbackMessageId(inbound)
  if (store.processedMessageIds.includes(messageId)) return

  store.lastInboundAt = Date.now()
  persist()
  emit()

  // A failed send leaves an outbox record. On replay, deliver the exact same answer without
  // writing another Markdown block or invoking the model again.
  if (store.pendingReply) {
    if (store.pendingReply.messageId !== messageId) {
      throw new Error('上一条微信回复仍在等待发送')
    }
    await deliverPendingReply(sess, inbound, '')
    markProcessed(messageId)
    return
  }

  const diaryPath = await currentDiaryPath()
  let savedImages: PendingWechatImage[] = []
  try {
    savedImages = await saveInboundImages(inbound, messageId, diaryPath)
  } catch (err) {
    const reply = `图片处理失败：${err instanceof Error ? err.message : String(err)}`
    store.pendingReply = {
      messageId,
      userId: inbound.fromUserId,
      reply,
      clientId: stableClientId(messageId),
      diaryPath,
      appendToDiary: false,
      consumeImageIds: [],
    }
    persist()
    await deliverPendingReply(sess, inbound, '')
    markProcessed(messageId)
    return
  }
  const userImages = store.pendingImages
    .filter((image) => image.userId === inbound.fromUserId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const hasImageContext = userImages.length > 0
  const trimmedText = inbound.text.trim()
  const imageBatch = selectWechatImageBatch(
    store.pendingImages,
    inbound.fromUserId,
    Boolean(trimmedText),
  )

  // A bare image is durable immediately, but deliberately silent until a five-image batch is
  // complete. Any following text consumes the current (up to five) image batch right away.
  if (savedImages.length > 0 && !trimmedText && imageBatch.length === 0) {
    markProcessed(messageId)
    return
  }

  let ticket = typingTickets.get(inbound.fromUserId) ?? ''
  try {
    if (!ticket) {
      ticket = await ensureTypingTicket(sess, inbound.fromUserId, inbound.contextToken)
      if (ticket) typingTickets.set(inbound.fromUserId, ticket)
    }
    await sendTyping(sess, inbound.fromUserId, ticket, 1)
  } catch {
    ticket = ''
  }

  const cmd = classifyWechatText(trimmedText)
  let reply = ''
  let appendAi = false
  let consumeImageIds: string[] = []
  try {
    if (hasImageContext && (trimmedText || userImages.length >= 5)) {
      const batch = imageBatch
      consumeImageIds = batch.map((image) => image.id)
      if (trimmedText && savedImages.length === 0) {
        await appendRoleOnce(diaryPath, 'wechat', trimmedText, `wechat:${messageId}`)
      }
      if (store.aiEnabled) {
        const prompt = trimmedText || '请综合查看并分析这组图片，说明图片中的主要内容。'
        const ai = await askAi(prompt, await loadAiImages(batch))
        if (ai) {
          reply = ai
          appendAi = true
        } else {
          reply = '图片已保存到日记，但当前 AI 未配置或暂时不可用，请检查 ZenMux 设置与网络。'
        }
      } else {
        reply = `已将 ${batch.length} 张图片保存到日记；当前已关闭微信 AI 回复。`
      }
    } else if (cmd.kind === 'help') reply = HELP_TEXT
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
      await appendRoleOnce(diaryPath, 'wechat', cmd.text, `wechat:${messageId}`)
      reply = SAVED_TEXT
    } else if (cmd.kind === 'chat') {
      if (!cmd.text) {
        reply = '发文字即可记入当前三天窗口。'
      } else {
        await appendRoleOnce(diaryPath, 'wechat', cmd.text, `wechat:${messageId}`)
        if (store.aiEnabled) {
          const ai = await askAi(cmd.text)
          if (ai) {
            reply = ai
            appendAi = true
          } else {
            reply = '已记下。当前未配置可用的 AI（设置 → ZenMux），因此没有自动回复。'
          }
        } else {
          reply = SAVED_TEXT
        }
      }
    }
  } catch (err) {
    reply = `处理微信内容失败：${err instanceof Error ? err.message : String(err)}`
    lastError = reply
  }

  try {
    store.pendingReply = {
      messageId,
      userId: inbound.fromUserId,
      reply: reply.slice(0, 4000),
      clientId: stableClientId(messageId),
      diaryPath,
      appendToDiary: appendAi,
      consumeImageIds,
    }
    persist()
    await deliverPendingReply(sess, inbound, ticket)
    markProcessed(messageId)
  } finally {
    try {
      await sendTyping(sess, inbound.fromUserId, ticket, 2)
    } catch {
      /* A typing-indicator failure must never turn a delivered reply into a replay. */
    }
    emit()
  }
}

function fallbackMessageId(inbound: IlinkInbound): string {
  return createHash('sha256')
    .update(inbound.fromUserId)
    .update('\0')
    .update(inbound.contextToken)
    .update('\0')
    .update(inbound.text)
    .update('\0')
    .update(inbound.images.map((image) => image.encryptQueryParam).join('\0'))
    .digest('hex')
}

function stableClientId(messageId: string): string {
  const digest = createHash('sha256').update(messageId).digest('hex').slice(0, 24)
  return `genoffice-${digest}`
}

function marker(name: string): string {
  return `<!-- genoffice-${createHash('sha256').update(name).digest('hex').slice(0, 24)} -->`
}

function markProcessed(messageId: string): void {
  if (!store) return
  store.processedMessageIds = [
    ...store.processedMessageIds.filter((id) => id !== messageId),
    messageId,
  ].slice(-200)
  persist()
}

async function deliverPendingReply(
  sess: IlinkSession,
  inbound: IlinkInbound,
  ticket: string,
): Promise<void> {
  if (!store?.pendingReply) return
  const pending = store.pendingReply
  if (
    pending.userId !== inbound.fromUserId ||
    pending.messageId !== (inbound.messageId || fallbackMessageId(inbound))
  ) {
    throw new Error('微信待发送回复与当前消息不匹配')
  }
  if (pending.appendToDiary) {
    await appendRoleOnce(pending.diaryPath, 'ai', pending.reply, `ai:${pending.messageId}`)
  }
  await sendText(sess, inbound.fromUserId, inbound.contextToken, pending.reply, pending.clientId)
  const consumed = new Set(pending.consumeImageIds)
  store.pendingImages = store.pendingImages.filter((image) => !consumed.has(image.id))
  store.pendingReply = null
  persist()
  if (ticket) typingTickets.set(inbound.fromUserId, ticket)
}

function isWithinDiaryRoot(path: string): boolean {
  if (!store) return false
  const root = resolve(store.diaryDir || defaultDiaryDir())
  const candidate = resolve(path)
  const rel = relative(root, candidate)
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

async function saveInboundImages(
  inbound: IlinkInbound,
  messageId: string,
  diaryPath: string,
): Promise<PendingWechatImage[]> {
  if (!store || inbound.images.length === 0) return []
  const saved: PendingWechatImage[] = []
  const assetDir = join(
    dirname(diaryPath),
    `${diaryPath.slice(dirname(diaryPath).length + 1, -3)}.assets`,
  )
  await mkdir(assetDir, { recursive: true })
  for (const [index, image] of inbound.images.entries()) {
    const id = `${messageId}:${index}`
    const existing = store.pendingImages.find((item) => item.id === id)
    if (existing) {
      saved.push(existing)
      continue
    }
    const downloaded = await downloadWechatImage(image.encryptQueryParam, image.aesKey)
    const digest = createHash('sha256').update(id).digest('hex').slice(0, 20)
    const path = join(assetDir, `wechat-${digest}.${downloaded.extension}`)
    await writeBinaryFile(path, downloaded.data)
    saved.push({
      id,
      messageId,
      userId: inbound.fromUserId,
      path,
      mime: downloaded.mime,
      createdAt: Date.now() + index,
    })
  }
  const imageMarkdown = saved
    .map((image, index) => {
      const href = relative(dirname(diaryPath), image.path)
        .split(/[\\/]/u)
        .map((part) => encodeURIComponent(part))
        .join('/')
      return `![微信图片 ${index + 1}](./${href})`
    })
    .join('\n\n')
  const body = [inbound.text.trim(), imageMarkdown].filter(Boolean).join('\n\n')
  await appendRoleOnce(diaryPath, 'wechat', body, `wechat:${messageId}`)
  for (const image of saved) {
    if (!store.pendingImages.some((item) => item.id === image.id)) store.pendingImages.push(image)
  }
  store.pendingImages = store.pendingImages.slice(-20)
  persist()
  return saved
}

async function loadAiImages(images: PendingWechatImage[]): Promise<AiImageReference[]> {
  if (!store) return []
  const result: AiImageReference[] = []
  for (const image of images.slice(0, 5)) {
    const path = resolve(image.path)
    if (!isWithinDiaryRoot(path)) continue
    result.push({ mime: image.mime, base64: (await readFile(path)).toString('base64') })
  }
  return result
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

async function appendRoleOnce(
  file: string,
  role: 'wechat' | 'ai',
  body: string,
  uniqueName: string,
): Promise<void> {
  let current = await readUtf8(file)
  if (!current.trim()) current = newDoc()
  const uniqueMarker = marker(uniqueName)
  if (current.includes(uniqueMarker)) return
  await writeUtf8(
    file,
    appendDiaryEntry(current, formatHm(Date.now()), role, `${uniqueMarker}\n${body}`),
  )
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

async function askAi(userText: string, images: AiImageReference[] = []): Promise<string> {
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
  const result = await chatZenMux(zenmux, system, userText, images)
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
