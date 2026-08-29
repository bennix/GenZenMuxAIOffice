import { createCipheriv, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { selectWechatImageBatch } from '../src/main/wechat-diary/image-batch'
import {
  chunkWechatText,
  extractFiles,
  extractImages,
  sendText,
} from '../src/main/wechat-diary/ilink'
import {
  detectImageMime,
  downloadWechatPdf,
  parseWechatAesKey,
} from '../src/main/wechat-diary/media'
import type { PendingWechatImage } from '../src/main/wechat-diary/store'

afterEach(() => vi.unstubAllGlobals())

function pending(count: number): PendingWechatImage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}:0`,
    messageId: `m${index}`,
    userId: 'reader@im.wechat',
    path: `/diary/image-${index}.png`,
    mime: 'image/png',
    createdAt: index,
  }))
}

describe('wechat diary image batching', () => {
  it('keeps one to four bare images silent, then returns an ordered five-image batch', () => {
    expect(selectWechatImageBatch(pending(4), 'reader@im.wechat', false)).toEqual([])
    expect(selectWechatImageBatch(pending(5), 'reader@im.wechat', false).map((i) => i.id)).toEqual([
      'm0:0',
      'm1:0',
      'm2:0',
      'm3:0',
      'm4:0',
    ])
  })

  it('flushes fewer than five images when the user follows with text', () => {
    expect(selectWechatImageBatch(pending(2), 'reader@im.wechat', true)).toHaveLength(2)
  })
})

describe('wechat inbound image protocol', () => {
  it('extracts both supported AES key locations', () => {
    expect(
      extractImages({
        item_list: [
          {
            type: 2,
            image_item: {
              aeskey: '00112233445566778899aabbccddeeff',
              media: { encrypt_query_param: 'one' },
            },
          },
          {
            type: 2,
            image_item: {
              media: { encrypt_query_param: 'two', aes_key: 'ABEiM0RVZneImaq7zN3u/w==' },
            },
          },
        ],
      }),
    ).toEqual([
      { encryptQueryParam: 'one', aesKey: '00112233445566778899aabbccddeeff' },
      { encryptQueryParam: 'two', aesKey: 'ABEiM0RVZneImaq7zN3u/w==' },
    ])
  })

  it('accepts raw-hex and base64 AES keys and recognizes common image signatures', () => {
    const key = randomBytes(16)
    const cipher = createCipheriv('aes-128-ecb', key, null)
    const encrypted = Buffer.concat([cipher.update(Buffer.from('round trip')), cipher.final()])
    expect(encrypted.length).toBeGreaterThan(0)
    expect(parseWechatAesKey(key.toString('hex'))).toEqual(key)
    expect(parseWechatAesKey(key.toString('base64'))).toEqual(key)
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toEqual({
      mime: 'image/jpeg',
      extension: 'jpg',
    })
  })
})

describe('wechat inbound PDF protocol', () => {
  it('extracts filename, size, media query and both supported AES key locations', () => {
    expect(
      extractFiles({
        item_list: [
          {
            type: 4,
            file_item: {
              file_name: 'paper.pdf',
              file_size: 12345,
              aeskey: '00112233445566778899aabbccddeeff',
              media: { encrypt_query_param: 'pdf-one' },
            },
          },
          {
            type: 4,
            file_item: {
              filename: 'appendix.pdf',
              media: { encrypt_query_param: 'pdf-two', aes_key: 'ABEiM0RVZneImaq7zN3u/w==' },
            },
          },
        ],
      }),
    ).toEqual([
      {
        fileName: 'paper.pdf',
        encryptQueryParam: 'pdf-one',
        aesKey: '00112233445566778899aabbccddeeff',
        size: 12345,
      },
      {
        fileName: 'appendix.pdf',
        encryptQueryParam: 'pdf-two',
        aesKey: 'ABEiM0RVZneImaq7zN3u/w==',
      },
    ])
  })

  it('decrypts a valid PDF and rejects decrypted non-PDF bytes', async () => {
    const key = randomBytes(16)
    const encrypt = (plain: Buffer): Buffer => {
      const cipher = createCipheriv('aes-128-ecb', key, null)
      return Buffer.concat([cipher.update(plain), cipher.final()])
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(encrypt(Buffer.from('%PDF-1.7\nbody'))))
        .mockResolvedValueOnce(new Response(encrypt(Buffer.from('not a pdf')))),
    )
    await expect(downloadWechatPdf('query', key.toString('base64'))).resolves.toEqual(
      Buffer.from('%PDF-1.7\nbody'),
    )
    await expect(downloadWechatPdf('query', key.toString('base64'))).rejects.toThrow('有效的 PDF')
  })
})

describe('wechat outbound reply delivery', () => {
  it('treats an iLink business error inside HTTP 200 as a failed send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ret: -14, errcode: -14, errmsg: 'expired' }), {
          status: 200,
        }),
      ),
    )

    await expect(
      sendText(
        { botToken: 'test-token', baseUrl: 'https://ilinkai.weixin.qq.com' },
        'reader@im.wechat',
        'context-token',
        'reply',
        'stable-id',
      ),
    ).rejects.toThrow('重新绑定微信')
  })

  it('splits long AI answers into accepted-size messages with stable chunk IDs', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const reply = `${'甲'.repeat(1_500)}\n${'乙'.repeat(1_500)}`

    expect(chunkWechatText(reply)).toHaveLength(2)
    await sendText(
      { botToken: 'test-token', baseUrl: 'https://ilinkai.weixin.qq.com' },
      'reader@im.wechat',
      'context-token',
      reply,
      'stable-id',
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(bodies.map((body) => body.msg.client_id)).toEqual(['stable-id-1', 'stable-id-2'])
    expect(bodies.every((body) => body.msg.item_list[0].text_item.text.length <= 2_000)).toBe(true)
  })
})
