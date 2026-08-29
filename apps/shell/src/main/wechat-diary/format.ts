export type DiaryRole = 'wechat' | 'ai'

const FRONT_RE = /^---\n[\s\S]*?\n---\n*/

export function createDiaryDocument(startIso: string, endIso: string): string {
  return `---
window: ${startIso}/${endIso}
source: wechat-diary
---

# ${startIso} ~ ${endIso}

`
}

export function appendDiaryEntry(
  existing: string,
  timeHm: string,
  role: DiaryRole,
  body: string,
): string {
  const label = role === 'ai' ? 'AI' : '微信'
  const text = body.replace(/\s+$/u, '')
  const block = `**${timeHm} · ${label}**\n\n${text}\n`
  const base = existing.endsWith('\n') ? existing : `${existing}\n`
  return `${base}\n${block}\n`
}

export function appendSeal(existing: string, timeHm: string): string {
  const base = existing.endsWith('\n') ? existing : `${existing}\n`
  return `${base}\n---\n_(本窗口封存于 ${timeHm})_\n`
}

/** Drop the last 微信 block and everything after it (the paired AI reply). */
export function withdrawLastTurn(existing: string): { next: string; removed: boolean } {
  const re = /\n\*\*\d{1,2}:\d{2} · 微信\*\*/g
  let last = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(existing))) last = m.index + 1
  if (last < 0 && /^\*\*\d{1,2}:\d{2} · 微信\*\*/.test(existing)) last = 0
  if (last < 0) return { next: existing, removed: false }
  return { next: existing.slice(0, last).replace(/\n+$/u, '\n'), removed: true }
}

export function recentDiaryContext(existing: string, maxChars = 4000): string {
  const body = existing.replace(FRONT_RE, '').trim()
  if (body.length <= maxChars) return body
  return body.slice(-maxChars)
}
