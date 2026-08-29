import { randomBytes, randomInt } from 'node:crypto'

export const ILINK_DEFAULT_BASE = 'https://ilinkai.weixin.qq.com'
const CHANNEL_VERSION = '2.4.3'
const CLIENT_VERSION = '132099'
const BOT_AGENT = 'GenOffice-wechat-diary/1.0'

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
  fromUserId: string
  contextToken: string
  groupId?: string
  text: string
  rawType: number
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
      fromUserId,
      contextToken,
      text: extractText(msg),
      rawType: Number(msg.message_type) || 1,
    })
  }
  return { msgs, cursor: str(data.get_updates_buf) || cursor }
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
): Promise<void> {
  const clientId = `genoffice-${randomBytes(4).toString('hex')}`
  await ilinkRequest(
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
        item_list: [{ type: 1, text_item: { text } }],
      },
      base_info: baseInfo(),
    },
    session.botToken,
    20_000,
  )
}
