import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'

/** Stream one prompt to completion. `onDelta` receives the accumulated text. */
export async function streamPromptText(
  api: {
    getAiSettings(): Promise<AiSettings>
    aiStream(request: AiStreamRequest): Promise<void>
    aiStreamCancel(requestId: string): Promise<void> | void
    onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  },
  prompt: { system: string; user: string },
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const settings = await api.getAiSettings()
  if (!settings.providers.zenmux.apiKey) throw new Error('请先在设置中配置 ZenMux API Key。')
  if (signal.aborted) throw new Error('已取消')
  const requestId = crypto.randomUUID()
  let text = ''
  let settled = false
  return await new Promise<string>((resolve, reject) => {
    const off = api.onAiStream((chunk) => {
      if (chunk.requestId !== requestId || settled) return
      if (chunk.type === 'delta' && chunk.text) {
        text += chunk.text
        onDelta(text)
      } else if (chunk.type === 'done') finish(() => resolve(text))
      else if (chunk.type === 'error') finish(() => reject(new Error(chunk.error || 'AI 处理失败')))
    })
    const finish = (settle: () => void) => {
      if (settled) return
      settled = true
      off()
      signal.removeEventListener('abort', onAbort)
      settle()
    }
    const onAbort = () => {
      void api.aiStreamCancel(requestId)
      finish(() => reject(new Error('已取消')))
    }
    signal.addEventListener('abort', onAbort)
    void api
      .aiStream({
        requestId,
        settings,
        system: prompt.system,
        messages: [{ role: 'user', text: prompt.user }],
      })
      .catch((error: unknown) =>
        finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
      )
  })
}
