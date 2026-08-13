import type { AiSettings, LegacyAiSettings } from '@genoffice/ai-provider'

const ENCRYPTED_KEY_FIELD = 'apiKeyEncrypted'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Uint8Array
  decryptString(value: Uint8Array): string
}

type StoredZenMuxConfig = Partial<AiSettings['providers']['zenmux']> & {
  apiKeyEncrypted?: unknown
}

type StoredSettings = Partial<AiSettings> &
  LegacyAiSettings & {
    providers?: Partial<AiSettings['providers']> & { zenmux?: StoredZenMuxConfig }
  }

/**
 * Remove the ZenMux key from JSON and encrypt it with Electron safeStorage
 * (Keychain on macOS, DPAPI on Windows, OS keyring on supported Linux hosts).
 */
export function protectAiSettingsForDisk(
  settings: AiSettings,
  safeStorage: SafeStorageLike,
): AiSettings {
  const copy = structuredClone(settings) as AiSettings & {
    providers: AiSettings['providers'] & {
      zenmux: AiSettings['providers']['zenmux'] & { apiKeyEncrypted?: string }
    }
  }
  const key = copy.providers.zenmux.apiKey.trim()
  delete (copy.providers.zenmux as Partial<AiSettings['providers']['zenmux']>).apiKey
  delete copy.providers.zenmux.apiKeyEncrypted
  if (key) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable on this system.')
    }
    copy.providers.zenmux.apiKeyEncrypted = Buffer.from(safeStorage.encryptString(key)).toString(
      'base64',
    )
  }
  return copy
}

/** Decrypt settings loaded from disk, while accepting legacy plaintext once for migration. */
export function restoreAiSettingsFromDisk(
  stored: StoredSettings,
  safeStorage: SafeStorageLike,
): { settings: StoredSettings; needsMigration: boolean } {
  const copy = structuredClone(stored) as StoredSettings
  const zenmux = copy.providers?.zenmux as StoredZenMuxConfig | undefined
  if (!zenmux) return { settings: copy, needsMigration: false }

  const encrypted = zenmux[ENCRYPTED_KEY_FIELD]
  let restored = ''
  if (typeof encrypted === 'string' && encrypted.length > 0) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        restored = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      }
    } catch {
      restored = ''
    }
  }
  const plaintext = typeof zenmux.apiKey === 'string' ? zenmux.apiKey : ''
  zenmux.apiKey = restored || plaintext
  delete zenmux[ENCRYPTED_KEY_FIELD]
  return { settings: copy, needsMigration: plaintext.length > 0 }
}
