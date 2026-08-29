import { createDecipheriv } from 'node:crypto'

const WECHAT_CDN_DOWNLOAD = 'https://novac2c.cdn.weixin.qq.com/c2c/download'
const MAX_ENCRYPTED_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_ENCRYPTED_PDF_BYTES = 50 * 1024 * 1024

/** iLink uses either raw hex or base64(raw bytes / a hex string) for the AES-128 key. */
export function parseWechatAesKey(value: string): Buffer {
  const trimmed = value.trim()
  if (/^[0-9a-f]{32}$/iu.test(trimmed)) return Buffer.from(trimmed, 'hex')
  const decoded = Buffer.from(trimmed, 'base64')
  if (decoded.length === 16) return decoded
  if (decoded.length === 32 && /^[0-9a-f]{32}$/iu.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex')
  }
  throw new Error('微信图片使用了无法识别的加密密钥')
}

export function detectImageMime(data: Buffer): { mime: string; extension: string } {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { mime: 'image/jpeg', extension: 'jpg' }
  }
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: 'png' }
  }
  if (
    data.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    data.subarray(0, 6).toString('ascii') === 'GIF89a'
  ) {
    return { mime: 'image/gif', extension: 'gif' }
  }
  if (
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: 'webp' }
  }
  throw new Error('微信图片格式不受支持')
}

export async function downloadWechatImage(
  encryptQueryParam: string,
  aesKey: string,
): Promise<{ data: Buffer; mime: string; extension: string }> {
  const url = new URL(WECHAT_CDN_DOWNLOAD)
  url.searchParams.set('encrypted_query_param', encryptQueryParam)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40_000)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error(`微信图片下载失败（HTTP ${response.status}）`)
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > MAX_ENCRYPTED_IMAGE_BYTES) throw new Error('微信图片超过 25 MB 限制')
    const encrypted = Buffer.from(await response.arrayBuffer())
    if (encrypted.length > MAX_ENCRYPTED_IMAGE_BYTES) throw new Error('微信图片超过 25 MB 限制')
    const decipher = createDecipheriv('aes-128-ecb', parseWechatAesKey(aesKey), null)
    const data = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return { data, ...detectImageMime(data) }
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadWechatPdf(
  encryptQueryParam: string,
  aesKey: string,
  declaredSize?: number,
): Promise<Buffer> {
  if (declaredSize !== undefined && declaredSize > MAX_ENCRYPTED_PDF_BYTES) {
    throw new Error('微信 PDF 超过 50 MB 限制')
  }
  const url = new URL(WECHAT_CDN_DOWNLOAD)
  url.searchParams.set('encrypted_query_param', encryptQueryParam)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error(`微信 PDF 下载失败（HTTP ${response.status}）`)
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_ENCRYPTED_PDF_BYTES) throw new Error('微信 PDF 超过 50 MB 限制')
    const encrypted = Buffer.from(await response.arrayBuffer())
    if (encrypted.length > MAX_ENCRYPTED_PDF_BYTES) throw new Error('微信 PDF 超过 50 MB 限制')
    const decipher = createDecipheriv('aes-128-ecb', parseWechatAesKey(aesKey), null)
    const data = Buffer.concat([decipher.update(encrypted), decipher.final()])
    if (data.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('微信附件不是有效的 PDF 文件')
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}
