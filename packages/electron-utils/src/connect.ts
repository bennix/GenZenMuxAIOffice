export type ConnectEditorKind = 'docs' | 'sheets' | 'slides' | 'markdown'

export interface ConnectTarget {
  id: string
  kind: ConnectEditorKind
  title: string
}

export interface ConnectPayload {
  text: string
  format: 'markdown'
  sentAt: string
}

export interface ConnectResult {
  ok: boolean
  error?: 'invalid-target' | 'invalid-payload' | 'too-large' | 'unavailable'
}

export interface ConnectApi {
  listConnectTargets(): Promise<ConnectTarget[]>
  sendConnect(targetId: string, text: string): Promise<ConnectResult>
  onConnectReceive(handler: (payload: ConnectPayload) => void): () => void
}

export const CONNECT_CHANNELS = {
  listTargets: 'connect:list-targets',
  send: 'connect:send',
  receive: 'connect:receive',
} as const

export const CONNECT_MAX_TEXT_BYTES = 2 * 1024 * 1024

export function removeConnectCommand(value: string): { text: string; matched: boolean } {
  const pattern = /(^|\s)@connect\b/iu
  if (!pattern.test(value)) return { text: value, matched: false }
  return { text: value.replace(pattern, '$1').replace(/ {2,}/g, ' '), matched: true }
}

export function markdownTableOrLines(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const tableStart = lines.findIndex((line, index) => {
    if (!line.includes('|') || index + 1 >= lines.length) return false
    return /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? '')
  })
  if (tableStart >= 0) {
    const rows: string[][] = []
    for (let index = tableStart; index < lines.length; index += 1) {
      if (index === tableStart + 1) continue
      const line = lines[index]!
      if (!line.includes('|')) break
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
      if (cells.length) rows.push(cells)
    }
    if (rows.length) return rows
  }
  return lines.map((line) => [line])
}
