import { describe, expect, it } from 'vitest'
import { ILINK_PROTOCOL_AGENT, normalizeIlinkBaseUrl } from '../src/main/wechat-diary/ilink'

describe('WeChat iLink endpoint validation', () => {
  it('keeps the protocol agent stable across product renames', () => {
    expect(ILINK_PROTOCOL_AGENT).toBe('GenOffice-wechat-diary/1.0')
  })

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
