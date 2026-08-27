/** Copy source text, falling back when the async clipboard API is unavailable. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Electron/browser clipboard permission may fail while execCommand remains usable.
  }
  return copyWithExecCommand(text)
}

/** Copy rich HTML for hosts that strip CSS classes (WeChat MP editor). */
export async function copyHtmlToClipboard(html: string, plain: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return true
    }
  } catch {
    // Fall through to a contenteditable copy, which still places text/html on some platforms.
  }
  const holder = document.createElement('div')
  holder.contentEditable = 'true'
  holder.style.position = 'fixed'
  holder.style.left = '-9999px'
  holder.style.opacity = '0'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(holder)
  selection?.removeAllRanges()
  selection?.addRange(range)
  try {
    if (document.execCommand('copy')) return true
  } catch {
    // last resort: plain text
  } finally {
    selection?.removeAllRanges()
    holder.remove()
  }
  return copyWithExecCommand(plain)
}

function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
