import { describe, expect, it } from 'vitest'
import { validateAiNetworkPreferences } from '../src/adaptive-ai-network'

describe('AI network preferences', () => {
  it('drops obsolete proxy values outside manual mode', () => {
    expect(validateAiNetworkPreferences({ mode: 'auto', proxyUrl: 'http://old:7890' })).toEqual({
      mode: 'auto',
    })
  })
  it('supports custom ports and normalizes SOCKS DNS mode', () => {
    expect(
      validateAiNetworkPreferences({ mode: 'manual', proxyUrl: 'socks5h://127.0.0.1:23456' }),
    ).toEqual({ mode: 'manual', proxyUrl: 'socks5://127.0.0.1:23456' })
  })
  it.each([
    'http://user:password@proxy:7890',
    'file:///tmp/proxy',
    'https://proxy/path',
    'http://proxy?token=private',
  ])('rejects credentials, unsafe schemes and request data', (proxyUrl) => {
    expect(() => validateAiNetworkPreferences({ mode: 'manual', proxyUrl })).toThrow()
  })
})
