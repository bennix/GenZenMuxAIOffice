import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile as writeBinaryFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { dialog, safeStorage, shell } from 'electron'
import { restoreAiSettingsFromDisk, type SafeStorageLike } from '@genoffice/electron-utils'
import {
  REVIEW_PROFILES,
  chatZenMux,
  defaultAiSettings,
  resolveAiSettings,
} from '@genoffice/ai-provider'
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
import { downloadWechatImage, downloadWechatPdf } from './media'
import { parsePdfReviewSelection, runPdfReviewTask } from './pdf-review'
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
    store.pendingPdfReview = null
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
      let reviewError = ''
      if (store.pendingPdfReview?.profileId) {
        try {
          await processPendingPdfReview(sess)
        } catch (err) {
          reviewError = err instanceof Error ? err.message : String(err)
          if (/尚未配置可用的 ZenMux|没有可供审稿的可提取正文/u.test(reviewError)) {
            await failPendingPdfReview(sess, reviewError)
            reviewError = ''
          }
        }
      }
      const { msgs, cursor } = await getUpdates(sess, store.getUpdatesBuf)
      for (const msg of msgs) await handleInbound(sess, msg)
      // Advance only after every message has been written/replied to. Persisting first can
      // silently lose the batch if the app exits while a message is still being handled.
      if (cursor !== store.getUpdatesBuf) {
        store.getUpdatesBuf = cursor
        persist()
      }
      lastError = reviewError || null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/aborted/i.test(message)) lastError = message
    }
    if (!stopping && running) {
      pollTimer = setTimeout(() => loopOnce(), store?.pendingPdfReview?.profileId ? 10_000 : 400)
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

  if (
    store.pendingPdfReview &&
    !store.pendingPdfReview.profileId &&
    store.pendingPdfReview.userId === inbound.fromUserId
  ) {
    await acceptPdfReviewSelection(sess, inbound, messageId)
    return
  }
  if (store.pendingPdfReview?.profileId && store.pendingPdfReview.userId === inbound.fromUserId) {
    await handleActivePdfReviewMessage(sess, inbound, messageId)
    return
  }
  if (store.pendingPdfReview) {
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      '当前已有一份 PDF 正在等待选择或执行多轮审稿，请稍后再发送附件。',
      `${stableClientId(messageId)}-pdf-busy`,
    )
    markProcessed(messageId)
    return
  }

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
  if (inbound.files.length > 0) {
    try {
      await acceptInboundPdf(sess, inbound, messageId, diaryPath)
    } catch (err) {
      const reply = `PDF 附件处理失败：${err instanceof Error ? err.message : String(err)}`
      store.pendingReply = {
        messageId,
        userId: inbound.fromUserId,
        reply,
        clientId: stableClientId(messageId),
        diaryPath,
        appendToDiary: false,
        consumeImageIds: [],
        sentToWechat: false,
      }
      persist()
      await deliverPendingReply(sess, inbound, '')
      markProcessed(messageId)
    }
    return
  }
  let savedImages: PendingWechatImage[]
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
      sentToWechat: false,
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
      sentToWechat: false,
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
    .update('\0')
    .update(inbound.files.map((file) => file.encryptQueryParam).join('\0'))
    .digest('hex')
}

function safeAttachmentName(name: string): string {
  const cleaned = basename(name)
    .replace(/[\u0000-\u001f<>:"/\\|?*]/gu, '_')
    .trim()
  return cleaned || '微信附件.pdf'
}

async function acceptInboundPdf(
  sess: IlinkSession,
  inbound: IlinkInbound,
  messageId: string,
  diaryPath: string,
): Promise<void> {
  if (!store) return
  if (inbound.files.length !== 1) {
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      '请每次只发送 1 个 PDF 附件，以便审稿委员会建立独立任务。',
      `${stableClientId(messageId)}-pdf-reject`,
    )
    markProcessed(messageId)
    return
  }
  const file = inbound.files[0]!
  if (extname(file.fileName).toLowerCase() !== '.pdf') {
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      '当前微信附件自动审稿仅接受 PDF 文件。',
      `${stableClientId(messageId)}-pdf-reject`,
    )
    markProcessed(messageId)
    return
  }
  const assetDir = join(
    dirname(diaryPath),
    `${diaryPath.slice(dirname(diaryPath).length + 1, -3)}.assets`,
  )
  await mkdir(assetDir, { recursive: true })
  const data = await downloadWechatPdf(file.encryptQueryParam, file.aesKey, file.size)
  const digest = createHash('sha256').update(messageId).digest('hex').slice(0, 20)
  const originalName = safeAttachmentName(file.fileName)
  const pdfPath = join(assetDir, `wechat-${digest}-${originalName}`)
  await writeBinaryFile(pdfPath, data)
  const href = relative(dirname(diaryPath), pdfPath)
    .split(/[\\/]/u)
    .map((part) => encodeURIComponent(part))
    .join('/')
  const body = [
    inbound.text.trim(),
    `[PDF 附件：${originalName}](./${href})`,
    '> PDF 已保存，正在等待用户选择稿件类型、审稿级别和报告语言。',
  ]
    .filter(Boolean)
    .join('\n\n')
  await appendRoleOnce(diaryPath, 'wechat', body, `wechat:${messageId}`)
  store.pendingPdfReview = {
    messageId,
    userId: inbound.fromUserId,
    contextToken: inbound.contextToken,
    diaryPath,
    pdfPath,
    fileName: originalName,
    request: inbound.text.trim(),
    profileId: '',
    language: 'zh',
    models: [],
    evidence: [],
    reviewerReports: [],
    chairReport: '',
    ackSent: false,
    finalSent: false,
  }
  persist()
  await sendText(
    sess,
    inbound.fromUserId,
    inbound.contextToken,
    pdfReviewSelectionPrompt(originalName),
    `${stableClientId(messageId)}-pdf-ack`,
  )
  store.pendingPdfReview.ackSent = true
  persist()
  markProcessed(messageId)
}

function pdfReviewSelectionPrompt(fileName: string): string {
  const choices = REVIEW_PROFILES.map(
    (profile, index) => `${index + 1}. ${profile.labelZh} / ${profile.labelEn}`,
  ).join('\n')
  return `已收到并在本地保存 PDF《${fileName}》。请选择稿件类型/审稿级别：\n${choices}\n\n请回复“序号 + 中文或英文”，例如：4 中文、6 英文。只回复序号时默认生成中文审稿意见。选择后才会启动多次 ZenMux 询问；回复“取消审稿”可退出。`
}

async function acceptPdfReviewSelection(
  sess: IlinkSession,
  inbound: IlinkInbound,
  messageId: string,
): Promise<void> {
  if (!store?.pendingPdfReview) return
  if (/^(?:取消|取消审稿|停止审稿|cancel)$/iu.test(inbound.text.trim())) {
    const fileName = store.pendingPdfReview.fileName
    store.pendingPdfReview = null
    persist()
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      `已取消《${fileName}》的 AI 审稿；本地 PDF 和日记记录仍然保留。`,
      `${stableClientId(messageId)}-pdf-cancel`,
    )
    markProcessed(messageId)
    return
  }
  if (inbound.files.length || inbound.images.length || !inbound.text.trim()) {
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      pdfReviewSelectionPrompt(store.pendingPdfReview.fileName),
      `${stableClientId(messageId)}-pdf-choice-reminder`,
    )
    markProcessed(messageId)
    return
  }
  const selection = parsePdfReviewSelection(inbound.text)
  if (!selection) {
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      `没有识别到审稿类型。\n\n${pdfReviewSelectionPrompt(store.pendingPdfReview.fileName)}`,
      `${stableClientId(messageId)}-pdf-choice-invalid`,
    )
    markProcessed(messageId)
    return
  }
  const profile = REVIEW_PROFILES.find((item) => item.id === selection.profileId)!
  store.pendingPdfReview.profileId = selection.profileId
  store.pendingPdfReview.language = selection.language
  store.pendingPdfReview.contextToken = inbound.contextToken
  persist()
  await appendRoleOnce(
    store.pendingPdfReview.diaryPath,
    'wechat',
    `PDF 审稿选择：${profile.labelZh}；报告语言：${selection.language === 'en' ? '英文' : '中文'}`,
    `wechat-pdf-choice:${messageId}`,
  )
  await sendText(
    sess,
    inbound.fromUserId,
    inbound.contextToken,
    `已选择“${profile.labelZh}”，审稿意见使用${selection.language === 'en' ? '英文' : '中文'}。现在开始分段证据提取、3 位委员独立评审和主席综合；完成后会分段发送完整报告。`,
    `${stableClientId(messageId)}-pdf-choice-ok`,
  )
  markProcessed(messageId)
}

async function handleActivePdfReviewMessage(
  sess: IlinkSession,
  inbound: IlinkInbound,
  messageId: string,
): Promise<void> {
  if (!store?.pendingPdfReview) return
  const cancel = /^(?:取消|取消审稿|停止审稿|cancel)$/iu.test(inbound.text.trim())
  const fileName = store.pendingPdfReview.fileName
  if (cancel) {
    store.pendingPdfReview = null
    persist()
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      `已停止《${fileName}》的后续 AI 审稿询问；已完成的阶段和本地 PDF 不会删除。`,
      `${stableClientId(messageId)}-pdf-cancel`,
    )
  } else {
    await sendText(
      sess,
      inbound.fromUserId,
      inbound.contextToken,
      `《${fileName}》仍在进行多轮 AI 审稿。已完成的阶段会保存，网络恢复后自动续跑。回复“取消审稿”可停止。`,
      `${stableClientId(messageId)}-pdf-running`,
    )
  }
  markProcessed(messageId)
}

async function processPendingPdfReview(sess: IlinkSession): Promise<void> {
  if (!store?.pendingPdfReview || !deps) return
  const task = store.pendingPdfReview
  if (!task.ackSent) {
    await sendText(
      sess,
      task.userId,
      task.contextToken,
      `已收到 PDF《${task.fileName}》，正在继续多轮严格审稿。`,
      `${stableClientId(task.messageId)}-pdf-ack`,
    )
    task.ackSent = true
    persist()
  }
  const report = await runPdfReviewTask(task, {
    readAiSettings: deps.readAiSettings,
    persist,
  })
  if (!task.finalSent) {
    await sendText(
      sess,
      task.userId,
      task.contextToken,
      report,
      `${stableClientId(task.messageId)}-pdf-report`,
    )
    task.finalSent = true
    persist()
  }
  await appendRoleOnce(task.diaryPath, 'ai', report, `ai-pdf-review:${task.messageId}`)
  store.pendingPdfReview = null
  persist()
}

async function failPendingPdfReview(sess: IlinkSession, reason: string): Promise<void> {
  if (!store?.pendingPdfReview) return
  const task = store.pendingPdfReview
  const reply = `《${task.fileName}》未能启动 PDF AI 审稿：${reason}。PDF 已保存在本地；请处理上述问题后重新发送附件。`
  await sendText(
    sess,
    task.userId,
    task.contextToken,
    reply,
    `${stableClientId(task.messageId)}-pdf-failed`,
  )
  await appendRoleOnce(task.diaryPath, 'ai', reply, `ai-pdf-review-failed:${task.messageId}`)
  store.pendingPdfReview = null
  persist()
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
  // Confirm delivery before updating the Markdown. This prevents a HTTP-200/business-error
  // response from producing an AI diary block that the user never received in WeChat.
  if (!pending.sentToWechat) {
    await sendText(sess, inbound.fromUserId, inbound.contextToken, pending.reply, pending.clientId)
    pending.sentToWechat = true
    persist()
  }
  if (pending.appendToDiary) {
    await appendRoleOnce(pending.diaryPath, 'ai', pending.reply, `ai:${pending.messageId}`)
  }
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
