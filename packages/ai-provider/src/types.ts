import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'

export type AiProviderId =
  'zenmux' | 'genspark' | 'anthropic' | 'gemini' | 'deepseek' | 'openai' | 'custom'

/** Genspark account status (gsk login state; the sole auth source for AI features) */
export interface GenSparkAccountStatus {
  loggedIn: boolean
  email?: string
}

export interface AiProviderConfig {
  apiKey: string
  model: string
  /** user-added model ids shown alongside the provider's built-in models */
  models?: string[] | undefined
  /** model ids explicitly hidden by the user (persists deletion of built-ins) */
  removedModels?: string[] | undefined
  /** image-generation model (ZenMux only) */
  imageModel?: string | undefined
  /** user-added image model ids shown alongside the built-in image models */
  imageModels?: string[] | undefined
  /** image model ids explicitly hidden by the user */
  removedImageModels?: string[] | undefined
  /** ZenMux (defaults to zenmux.ai) and the custom OpenAI-compatible provider */
  baseUrl?: string | undefined
}

export interface AiImageReference {
  base64: string
  mime: string
}

export interface AiImageGenerateOptions {
  apiKey: string
  model: string
  prompt: string
  aspectRatio?: string | undefined
  imageSize?: string | undefined
  referenceImages?: AiImageReference[] | undefined
  signal?: AbortSignal | undefined
}

export interface AiGeneratedImage {
  base64?: string | undefined
  mime: string
  url?: string | undefined
}

export interface AiProviderMeta {
  id: AiProviderId
  label: string
  models: string[]
  defaultModel: string
  keyPlaceholder: string
  needsBaseUrl?: boolean
}

export interface AiSettings {
  provider: AiProviderId
  providers: Record<AiProviderId, AiProviderConfig>
}

/** pre-provider settings shape (single OpenAI-compatible endpoint); migrated into "custom" */
export interface LegacyAiSettings {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export interface AiChatRequest {
  settings: AiSettings
  system: string
  user: string
  /** Optional multimodal evidence supplied to ZenMux as OpenAI-compatible image_url parts. */
  images?: AiImageReference[]
}

export interface AiChatResponse {
  ok: boolean
  content?: string
  error?: string
}

export interface AiStreamRequest {
  requestId: string
  settings: AiSettings
  system: string
  messages: AgentMessage[]
  tools?: AgentToolDef[]
  maxTokens?: number
}

export interface AiStreamChunk {
  requestId: string
  /** 'ping' = wire-level keepalive so the renderer can tell a live stream from a dead one */
  type: 'delta' | 'tool-call' | 'done' | 'error' | 'ping'
  text?: string
  /** complete parsed tool call (emitted once its arguments finish streaming) */
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable error cause ('timeout', exhausted 'credits'); lets the renderer localize the message */
  errorCode?: 'timeout' | 'credits'
  /** normalized stop reason carried on 'done' ('max_tokens' = output cut off by the token limit) */
  stopReason?: string
}
