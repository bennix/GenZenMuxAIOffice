import { useEffect, useRef, useState } from 'react'
import { formulaImageLocale, type UiFeatureLanguage } from './feature-i18n'

export interface FormulaImageData {
  base64: string
  mime: string
}

async function imageData(file: File, invalidImageMessage: string): Promise<FormulaImageData> {
  if (!file.type.startsWith('image/')) throw new Error(invalidImageMessage)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return { base64: btoa(binary), mime: file.type || 'image/png' }
}

function pastedImage(data: DataTransfer | null): File | null {
  return Array.from(data?.files ?? []).find((file) => file.type.startsWith('image/')) ?? null
}

/** Shared clipboard/file image input used by every editor's equation dialog. */
export function FormulaImageRecognition({
  language = 'en',
  onRecognize,
}: {
  language?: UiFeatureLanguage | undefined
  onRecognize: (image: FormulaImageData) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const text = formulaImageLocale(language)

  const recognize = async (file: File) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onRecognize(await imageData(file, text.invalidImage))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = pastedImage(event.clipboardData)
      if (!file) return
      event.preventDefault()
      void recognize(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const readClipboard = async () => {
    if (!navigator.clipboard?.read) throw new Error(text.noReadableClipboard)
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith('image/'))
      if (type) {
        await recognize(new File([await item.getType(type)], 'clipboard', { type }))
        return
      }
    }
    throw new Error(text.noClipboardImage)
  }

  return (
    <div className="formula-image-recognition">
      <div className="formula-image-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void readClipboard().catch((e) => setError(String(e)))}
        >
          {busy ? text.recognizing : text.recognizeClipboard}
        </button>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {text.chooseImage}
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void recognize(file)
          }}
        />
      </div>
      <small className="formula-image-hint">{text.hint}</small>
      {error && <div className="formula-image-error">{error}</div>}
    </div>
  )
}
