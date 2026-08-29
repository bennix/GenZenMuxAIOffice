import { describe, expect, it } from 'vitest'
import { normalizeIlinkBaseUrl } from '../src/main/wechat-diary/ilink'

describe('WeChat iLink endpoint validation', () => {
  it('accepts official HTTPS hosts and strips paths', () => {
    expect(normalizeIlinkBaseUrl('https://ilinkai.weixin.qq.com/path?q=1')).toBe(
      'https://ilinkai.weixin.qq.com',
    )
  })

  it('rejects insecure, credentialed, and lookalike endpoints', () => {
    expect(() => normalizeIlinkBaseUrl('http://ilinkai.weixin.qq.com')).toThrow()
    expect(() => normalizeIlinkBaseUrl('https://weixin.qq.com@evil.example')).toThrow()
    expect(() => normalizeIlinkBaseUrl('https://weixin.qq.com.evil.example')).toThrow()
  })
})
