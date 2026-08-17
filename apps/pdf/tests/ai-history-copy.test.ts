import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = process.cwd().endsWith('/apps/pdf')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/pdf')

const panel = readFileSync(resolve(workspace, 'src/renderer/ai/AiPanel.tsx'), 'utf8')
const preload = readFileSync(resolve(workspace, 'src/preload/index.ts'), 'utf8')
const app = readFileSync(resolve(workspace, 'src/renderer/App.tsx'), 'utf8')

describe('PDF AI transcript parity', () => {
  it('offers copy actions for prompts, replies, and restored messages', () => {
    expect(panel).toContain('copyTextToClipboard')
    expect(panel).toContain('复制提示词 / Copy prompt')
    expect(panel).toContain('复制回复 / Copy reply')
    expect(panel).toContain('historic-${index}')
  })

  it('persists and restores chat by the open PDF path', () => {
    expect(preload).toContain("contextBridge.exposeInMainWorld('projectApi', projectApi)")
    expect(panel).toContain('.resolveChat({ filePath, tempChatId })')
    expect(panel).toContain('projectApi.loadChat')
    expect(panel).toContain('.appendChat({')
    expect(panel).toContain('loopRef.current?.restore')
    expect(app).toContain("key={filePath || 'pdf-unopened'}")
    expect(app).toContain('filePath={filePath || null}')
  })
})
