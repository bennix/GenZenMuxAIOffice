import { useEffect, useRef, useState } from 'react'

export interface FormulaImageData {
  base64: string
  mime: string
}

async function imageData(file: File): Promise<FormulaImageData> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
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
  onRecognize,
}: {
  onRecognize: (image: FormulaImageData) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const zh = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')

  const recognize = async (file: File) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onRecognize(await imageData(file))
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
    if (!navigator.clipboard?.read)
      throw new Error(zh ? '剪贴板中没有可读取的图片' : 'No readable image in the clipboard.')
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith('image/'))
      if (type) {
        await recognize(new File([await item.getType(type)], 'clipboard', { type }))
        return
      }
    }
    throw new Error(zh ? '剪贴板中没有图片' : 'The clipboard contains no image.')
  }

  return (
    <div className="formula-image-recognition">
      <div className="formula-image-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void readClipboard().catch((e) => setError(String(e)))}
        >
          {busy ? (zh ? '正在识别…' : 'Recognizing…') : zh ? '从剪贴板识别' : 'Recognize clipboard'}
        </button>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {zh ? '选择公式图片' : 'Choose formula image'}
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
      <small className="formula-image-hint">
        {zh
          ? '也可直接粘贴公式截图。识别通过 ZenMux，可能受网络影响。'
          : 'You can also paste a formula screenshot. Recognition uses ZenMux and depends on the network.'}
      </small>
      {error && <div className="formula-image-error">{error}</div>}
    </div>
  )
}
