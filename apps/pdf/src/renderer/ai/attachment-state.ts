import type { AttachmentAddResult, AttachmentMeta } from '../../shared/ipc'

export const MAX_CHAT_ATTACHMENTS = 5

export interface AttachmentMergeResult {
  items: AttachmentMeta[]
  notice: string
}

/** Deduplicate attachment paths and enforce the shared five-file chat limit. */
export function mergeAttachmentResult(
  previous: AttachmentMeta[],
  result: AttachmentAddResult | null,
): AttachmentMergeResult {
  if (!result) return { items: previous, notice: '' }
  const seen = new Set(previous.map((file) => file.path))
  const unique = result.accepted.filter((file) => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
  const combined = [...previous, ...unique]
  const notices = [...result.rejected]
  if (combined.length > MAX_CHAT_ATTACHMENTS) {
    notices.unshift('最多支持 5 个附件 / Up to 5 attachments')
  }
  return { items: combined.slice(0, MAX_CHAT_ATTACHMENTS), notice: notices.join('; ') }
}
