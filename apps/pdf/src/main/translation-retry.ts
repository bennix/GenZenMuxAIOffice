import { setTimeout } from 'node:timers/promises'
import type { AiChatResponse } from '@genoffice/ai-provider'

/** Five retries after the initial attempt, only for transient transport/service failures. */
export async function requestTranslationWithRetry(
  request: () => Promise<AiChatResponse>,
  signal: AbortSignal,
  progress: (message: string) => void,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => {
    await setTimeout(ms, undefined, { signal })
  },
): Promise<AiChatResponse> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try {
      const response = await request()
      signal.throwIfAborted()
      const status = response.error?.match(/HTTP\s+(\d{3})\b/i)?.[1]
      const transient = status && [408, 429, 500, 502, 503, 504].includes(Number(status))
      if (response.ok || !transient || attempt === 5) return response
    } catch (error) {
      signal.throwIfAborted()
      const message = error instanceof Error ? error.message : ''
      const transient =
        /fetch failed|network|net::ERR_(?:CONNECTION|TIMED_OUT|NAME_NOT_RESOLVED|NETWORK|INTERNET_DISCONNECTED|HTTP2|QUIC)|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(
          message,
        )
      if (!transient || attempt === 5) throw error
    }
    const delay = 1000 * 2 ** attempt
    progress(`AI 服务暂时不可用，${delay / 1000} 秒后自动重试（${attempt + 1}/5）`)
    await wait(delay, signal)
  }
}
