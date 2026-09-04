import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import {
  applyFileMention,
  atMentionQuery,
  filterOpenFiles,
  type OpenFileRef,
} from '@genoffice/electron-utils/open-files'
import { fileMentionLocale, type UiFeatureLanguage } from './feature-i18n'

export function useFileMention({
  value,
  onChange,
  textareaRef,
  listOpenFiles,
  onMentionFile,
  language,
}: {
  value: string
  onChange: (next: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  listOpenFiles?: (() => Promise<OpenFileRef[]>) | undefined
  onMentionFile?: ((file: OpenFileRef) => void) | undefined
  language?: UiFeatureLanguage | string | undefined
}): {
  open: boolean
  files: OpenFileRef[]
  highlighted: number
  notice: string
  label: string
  handleChange: (next: string) => void
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean
  handleSelect: (file: OpenFileRef) => void
  setHighlighted: (index: number) => void
  syncCursor: () => void
} {
  const locale = fileMentionLocale(language)
  const [cursor, setCursor] = useState(value.length)
  const [loaded, setLoaded] = useState<OpenFileRef[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const pendingCursor = useRef<number | null>(null)
  const listRef = useRef(listOpenFiles)
  listRef.current = listOpenFiles

  const mention = listOpenFiles ? atMentionQuery(value, cursor) : null
  const mentionActive = mention !== null
  const picking = mentionActive && !dismissed
  const files = mention ? filterOpenFiles(loaded ?? [], mention.query) : []
  const open = picking && loaded !== null
  const notice = failed ? locale.listFailed : loaded && files.length === 0 ? locale.empty : ''

  const syncCursor = () => {
    const ta = textareaRef.current
    if (ta) setCursor(ta.selectionStart)
  }

  useEffect(() => {
    if (pendingCursor.current == null) return
    const ta = textareaRef.current
    if (!ta) return
    ta.setSelectionRange(pendingCursor.current, pendingCursor.current)
    pendingCursor.current = null
  }, [value, textareaRef])

  useEffect(() => {
    if (mentionActive) return
    setDismissed(false)
    setLoaded(null)
    setFailed(false)
  }, [mentionActive])

  useEffect(() => {
    if (!picking) return
    let cancelled = false
    void listRef
      .current?.()
      .then((next) => {
        if (cancelled) return
        setLoaded(next)
        setFailed(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoaded([])
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [picking])

  useEffect(() => {
    setHighlighted(0)
  }, [mention?.query, loaded])

  const handleChange = (next: string) => {
    const ta = textareaRef.current
    setCursor(ta?.selectionStart ?? next.length)
    onChange(next)
  }

  const handleSelect = (file: OpenFileRef) => {
    const active = atMentionQuery(value, cursor)
    if (!active) return
    const next = applyFileMention(value, cursor, active.start, file.title)
    pendingCursor.current = next.cursor
    onChange(next.text)
    onMentionFile?.(file)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!picking || event.nativeEvent.isComposing) return false
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (files.length > 0) setHighlighted((index) => Math.min(files.length - 1, index + 1))
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (files.length > 0) setHighlighted((index) => Math.max(0, index - 1))
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setDismissed(true)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const file = files[highlighted]
      if (file) {
        event.preventDefault()
        handleSelect(file)
        return true
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        return true
      }
    }
    return false
  }

  return {
    open,
    files,
    highlighted,
    notice,
    label: locale.label,
    handleChange,
    handleKeyDown,
    handleSelect,
    setHighlighted,
    syncCursor,
  }
}
