import { describe, expect, it } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import {
  protectAiSettingsForDisk,
  restoreAiSettingsFromDisk,
  type SafeStorageLike,
} from '../src/index'

const storage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`secure:${value}`),
  decryptString: (value) =>
    Buffer.from(value)
      .toString()
      .replace(/^secure:/, ''),
}

describe('secure AI settings persistence', () => {
  it('never writes the plaintext ZenMux API key', () => {
    const settings = defaultAiSettings()
    settings.providers.zenmux.apiKey = 'secret-value'
    const disk = protectAiSettingsForDisk(settings, storage)
    const json = JSON.stringify(disk)
    expect(json).not.toContain('secret-value')
    expect(json).toContain('apiKeyEncrypted')
  })

  it('restores an encrypted key for runtime use', () => {
    const settings = defaultAiSettings()
    settings.providers.zenmux.apiKey = 'secret-value'
    const disk = protectAiSettingsForDisk(settings, storage)
    const restored = restoreAiSettingsFromDisk(disk, storage)
    expect(restored.settings.providers?.zenmux?.apiKey).toBe('secret-value')
    expect(restored.needsMigration).toBe(false)
  })

  it('accepts a legacy plaintext key and requests migration', () => {
    const settings = defaultAiSettings()
    settings.providers.zenmux.apiKey = 'legacy-secret'
    const restored = restoreAiSettingsFromDisk(settings, storage)
    expect(restored.settings.providers?.zenmux?.apiKey).toBe('legacy-secret')
    expect(restored.needsMigration).toBe(true)
  })

  it('refuses to persist a non-empty key when OS encryption is unavailable', () => {
    const settings = defaultAiSettings()
    settings.providers.zenmux.apiKey = 'secret-value'
    expect(() =>
      protectAiSettingsForDisk(settings, { ...storage, isEncryptionAvailable: () => false }),
    ).toThrow(/unavailable/)
  })
})
