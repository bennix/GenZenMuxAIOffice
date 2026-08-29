import { randomBytes, randomInt } from 'node:crypto'

export const ILINK_DEFAULT_BASE = 'https://ilinkai.weixin.qq.com'
const CHANNEL_VERSION = '2.4.3'
const CLIENT_VERSION = '132099'
const BOT_AGENT = 'ZenOffice-wechat-diary/1.0'
const MAX_WECHAT_TEXT_LENGTH = 2_000

const OFFICIAL_WECHAT_HOSTS = new Set(['weixin.qq.com', 'wechat.com'])

/** Keep bot credentials on official WeChat HTTPS endpoints only. */
export function normalizeIlinkBaseUrl(raw: string): string {
  const url = new URL(raw)
  const host = url.hostname.toLowerCase().replace(/\.$/u, '')
  const official = [...OFFICIAL_WECHAT_HOSTS].some(
    (root) => host === root || host.endsWith(`.${root}`),
  )
  if (url.protocol !== 'https:' || !official || url.username || url.password) {
    throw new Error('微信服务返回了不受信任的绑定地址')
  }
  return `${url.protocol}//${url.host}`
}

export interface IlinkQrStart {
  qrcode: string
  imageOrUrl: string
  baseUrl: string
}

export interface IlinkBindResult {
  status: string
  botToken?: string
  baseUrl?: string
  botId?: string
  userId?: string
  redirectHost?: string
}

export interface IlinkInbound {
  messageId: string
  fromUserId: string
  contextToken: string
  groupId?: string
  text: string
  images: IlinkImageRef[]
  files: IlinkFileRef[]
  rawType: number
}

export interface IlinkImageRef {
  encryptQueryParam: string
  aesKey: string
}

export interface IlinkFileRef {
  fileName: string
  encryptQueryParam: string
  aesKey: string
  size?: number
}

export interface IlinkSession {
  botToken: string
  baseUrl: string
}

function wechatUin(): string {
  return Buffer.from(String(randomInt(0, 0xffff_ffff)), 'utf8').toString('base64')
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': wechatUin(),
    'iLink-App-Id': 'bot',
    'iLink-App-ClientVersion': CLIENT_VERSION,
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function baseInfo(): { channel_version: string; bot_agent: string } {
  return { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!res.ok) {
    // Do not surface a provider response body in the renderer: it may echo credentials or IDs.
    throw new Error(`微信服务 HTTP ${res.status}`)
  }
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return { errmsg: text.slice(0, 200) }
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function responseCode(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/u.test(value.trim())) return Number(value)
  return 0
}

/** iLink can report a business failure in an otherwise successful HTTP 200 response. */
export function assertIlinkSuccess(data: Record<string, unknown>, operation: string): void {
  const ret = responseCode(data.ret)
  const errcode = responseCode(data.errcode)
  if (ret === 0 && errcode === 0) return
  const code = errcode || ret
  if (code === -14) throw new Error('微信登录已过期，请在设置中重新绑定微信')
  throw new Error(`${operation}失败（微信错误码 ${code}）`)
}

export function chunkWechatText(text: string, maxLength = MAX_WECHAT_TEXT_LENGTH): string[] {
  if (maxLength < 1) throw new Error('微信消息分段长度必须大于 0')
  if (!text) return []
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = maxLength
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt)
    if (remaining.startsWith('\n')) remaining = remaining.slice(1)
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

export async function ilinkRequest(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
  token?: string,
  timeoutMs = 40_000,
): Promise<Record<string, unknown>> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      headers: headers(token),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    })
    return await readJson(res)
  } finally {
    clearTimeout(timer)
  }
}

export async function startQrLogin(existingTokens: string[] = []): Promise<IlinkQrStart> {
  const url = `${ILINK_DEFAULT_BASE}/ilink/bot/get_bot_qrcode?bot_type=3`
  let data = await ilinkRequest('POST', url, { local_token_list: existingTokens })
  if (!str(data.qrcode)) data = await ilinkRequest('GET', url)
  const qrcode = str(data.qrcode)
  if (!qrcode) throw new Error(str(data.errmsg) || '未能向微信申请绑定二维码')
  return {
    qrcode,
    imageOrUrl: str(data.qrcode_img_content) || str(data.qrcode_url),
    baseUrl: ILINK_DEFAULT_BASE,
  }
}

export async function pollQrStatus(
  qrcode: string,
  baseUrl = ILINK_DEFAULT_BASE,
  verifyCode?: string,
): Promise<IlinkBindResult> {
  const trustedBase = normalizeIlinkBaseUrl(baseUrl)
  const q = new URL(`${trustedBase}/ilink/bot/get_qrcode_status`)
  q.searchParams.set('qrcode', qrcode)
  if (verifyCode) q.searchParams.set('verify_code', verifyCode)
  const data = await ilinkRequest('GET', q.toString(), undefined, undefined, 45_000)
  return {
    status: str(data.status) || 'wait',
    botToken: str(data.bot_token) || undefined,
    baseUrl: str(data.baseurl) || undefined,
    botId: str(data.ilink_bot_id) || undefined,
    userId: str(data.ilink_user_id) || undefined,
    redirectHost: str(data.redirect_host) || undefined,
  }
}

export async function getUpdates(
  session: IlinkSession,
  cursor: string,
): Promise<{ msgs: IlinkInbound[]; cursor: string }> {
  const data = await ilinkRequest(
    'POST',
    `${normalizeIlinkBaseUrl(session.baseUrl)}/ilink/bot/getupdates`,
    { get_updates_buf: cursor, base_info: baseInfo() },
    session.botToken,
    40_000,
  )
  const msgs: IlinkInbound[] = []
  const raw = Array.isArray(data.msgs) ? data.msgs : []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const msg = item as Record<string, unknown>
    if (Number(msg.message_type) !== 1) continue
    const fromUserId = str(msg.from_user_id)
    const contextToken = str(msg.context_token)
    if (!fromUserId || !contextToken) continue
    if (str(msg.group_id)) continue
    msgs.push({
      messageId: scalarString(msg.message_id) || str(msg.client_id),
      fromUserId,
      contextToken,
      text: extractText(msg),
      images: extractImages(msg),
      files: extractFiles(msg),
      rawType: Number(msg.message_type) || 1,
    })
  }
  return { msgs, cursor: str(data.get_updates_buf) || cursor }
}

/** Extract encrypted iLink file attachments. The bytes are validated after download. */
export function extractFiles(msg: Record<string, unknown>): IlinkFileRef[] {
  const items = Array.isArray(msg.item_list) ? msg.item_list : []
  const files: IlinkFileRef[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const file = (item as Record<string, unknown>).file_item
    if (!file || typeof file !== 'object') continue
    const fileRec = file as Record<string, unknown>
    const media = fileRec.media
    if (!media || typeof media !== 'object') continue
    const mediaRec = media as Record<string, unknown>
    const fileName =
      str(fileRec.file_name) || str(fileRec.filename) || str(fileRec.name) || '微信附件.pdf'
    const encryptQueryParam = str(mediaRec.encrypt_query_param) || str(fileRec.encrypt_query_param)
    const aesKey =
      str(fileRec.aeskey) || str(fileRec.aes_key) || str(mediaRec.aes_key) || str(mediaRec.aeskey)
    const rawSize = Number(fileRec.file_size ?? fileRec.size ?? mediaRec.size ?? mediaRec.file_size)
    if (encryptQueryParam && aesKey) {
      files.push({
        fileName,
        encryptQueryParam,
        aesKey,
        ...(Number.isFinite(rawSize) && rawSize >= 0 ? { size: rawSize } : {}),
      })
    }
  }
  return files
}

function scalarString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** Extract every image in an inbound item list; callers download them only from WeChat's CDN. */
export function extractImages(msg: Record<string, unknown>): IlinkImageRef[] {
  const items = Array.isArray(msg.item_list) ? msg.item_list : []
  const images: IlinkImageRef[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const image = (item as Record<string, unknown>).image_item
    if (!image || typeof image !== 'object') continue
    const imageRec = image as Record<string, unknown>
    const media = imageRec.media
    if (!media || typeof media !== 'object') continue
    const mediaRec = media as Record<string, unknown>
    const encryptQueryParam = str(mediaRec.encrypt_query_param)
    // Newer clients put a raw hex key on image_item; older ones use base64 in media.aes_key.
    const aesKey = str(imageRec.aeskey) || str(mediaRec.aes_key)
    if (encryptQueryParam && aesKey) images.push({ encryptQueryParam, aesKey })
  }
  return images
}

function extractText(msg: Record<string, unknown>): string {
  const items = Array.isArray(msg.item_list) ? msg.item_list : []
  const parts: string[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const textItem = rec.text_item
    if (textItem && typeof textItem === 'object') {
      const t = str((textItem as Record<string, unknown>).text)
      if (t) parts.push(t)
    }
    const voice = rec.voice_item
    if (voice && typeof voice === 'object') {
      const v = voice as Record<string, unknown>
      const t = str(v.text) || str(v.translation) || str(v.asr_text)
      if (t) parts.push(`🎤 ${t}`)
    }
  }
  return parts.join('\n').trim()
}

export async function ensureTypingTicket(
  session: IlinkSession,
  userId: string,
  contextToken: string,
): Promise<string> {
  const data = await ilinkRequest(
    'POST',
    `${normalizeIlinkBaseUrl(session.baseUrl)}/ilink/bot/getconfig`,
    { ilink_user_id: userId, context_token: contextToken, base_info: baseInfo() },
    session.botToken,
    15_000,
  )
  return str(data.typing_ticket)
}

export async function sendTyping(
  session: IlinkSession,
  userId: string,
  ticket: string,
  status: 1 | 2,
): Promise<void> {
  if (!ticket) return
  await ilinkRequest(
    'POST',
    `${normalizeIlinkBaseUrl(session.baseUrl)}/ilink/bot/sendtyping`,
    { ilink_user_id: userId, typing_ticket: ticket, status, base_info: baseInfo() },
    session.botToken,
    10_000,
  )
}

export async function sendText(
  session: IlinkSession,
  toUserId: string,
  contextToken: string,
  text: string,
  stableClientId?: string,
): Promise<void> {
  const chunks = chunkWechatText(text)
  const baseClientId = stableClientId || `genoffice-${randomBytes(4).toString('hex')}`
  for (const [index, chunk] of chunks.entries()) {
    const clientId = chunks.length === 1 ? baseClientId : `${baseClientId}-${index + 1}`
    const data = await ilinkRequest(
      'POST',
      `${normalizeIlinkBaseUrl(session.baseUrl)}/ilink/bot/sendmessage`,
      {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: [{ type: 1, text_item: { text: chunk } }],
        },
        base_info: baseInfo(),
      },
      session.botToken,
      20_000,
    )
    assertIlinkSuccess(data, '微信回复发送')
  }
}
