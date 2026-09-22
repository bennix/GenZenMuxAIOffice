import { httpBodyDetail } from './http-error'
import { resolveZenmuxBaseUrl } from './providers'

/** A typed question for the System One API. Jev returns a decision, not prose. */
export interface SystemOneQuestion {
  type: 'noul' | 'choice' | 'score'
  instructions: string
  criteria?: Record<string, string | null> | string[]
}

export interface NoulAnswer {
  type: 'noul'
  noul: number
}

export interface ChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities?: Record<string, number>
  confidence?: number
}

export interface ScoreAnswer {
  type: 'score'
  score: number
  confidence?: number
}

export type SystemOneAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer

export interface SystemOneCall {
  apiKey: string
  baseUrl?: string | undefined
  model: string
  state: string | Record<string, unknown> | unknown[]
  questions: Record<string, SystemOneQuestion>
  signal?: AbortSignal | undefined
}

export type SystemOneResponse =
  | { ok: true; model: string; answers: Record<string, SystemOneAnswer> }
  | { ok: false; error: string }

/**
 * POST {baseUrl}/systemone. ZenMux forwards this to TypeSafe Jev.
 * One call can carry several questions; each answer comes back under the same key.
 */
export async function askSystemOne(call: SystemOneCall): Promise<SystemOneResponse> {
  const timeout = AbortSignal.timeout(20_000)
  const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(`${resolveZenmuxBaseUrl(call)}/systemone`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${call.apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
        state: call.state,
        questions: call.questions,
      }),
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `Jev HTTP ${response.status}: ${httpBodyDetail(await response.text())}`,
    }
  }
  const json = (await response.json()) as {
    model?: string
    answers?: Record<string, SystemOneAnswer>
  }
  if (!json.answers || typeof json.answers !== 'object') {
    return { ok: false, error: 'Jev returned no answers' }
  }
  return { ok: true, model: json.model ?? call.model, answers: json.answers }
}
