import { createCipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { selectWechatImageBatch } from '../src/main/wechat-diary/image-batch'
import { extractImages } from '../src/main/wechat-diary/ilink'
import { detectImageMime, parseWechatAesKey } from '../src/main/wechat-diary/media'
import type { PendingWechatImage } from '../src/main/wechat-diary/store'

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
