export const WECHAT_DIARY_CHANNELS = {
  status: 'wechat-diary:status',
  setPrefs: 'wechat-diary:set-prefs',
  startBind: 'wechat-diary:start-bind',
  submitPair: 'wechat-diary:submit-pair',
  unbind: 'wechat-diary:unbind',
  pickDir: 'wechat-diary:pick-dir',
  openLatest: 'wechat-diary:open-latest',
  openQr: 'wechat-diary:open-qr',
  changed: 'wechat-diary:changed',
} as const

export type WechatDiaryBindPhase =
  'idle' | 'wait' | 'scaned' | 'need_pair' | 'confirmed' | 'expired' | 'error'

export interface WechatDiaryStatus {
  enabled: boolean
  aiEnabled: boolean
  bound: boolean
  bindPhase: WechatDiaryBindPhase
  qrDataUrl: string | null
  qrOpenUrl: string | null
  pairHint: string | null
  userLabel: string | null
  diaryDir: string
  lastFile: string | null
  lastError: string | null
  lastInboundAt: number | null
  listening: boolean
}

export interface WechatDiaryPrefs {
  enabled?: boolean
  aiEnabled?: boolean
  diaryDir?: string
}

export interface WechatDiaryApi {
  status(): Promise<WechatDiaryStatus>
  setPrefs(prefs: WechatDiaryPrefs): Promise<WechatDiaryStatus>
  startBind(): Promise<WechatDiaryStatus>
  submitPair(code: string): Promise<WechatDiaryStatus>
  unbind(): Promise<WechatDiaryStatus>
  pickDir(): Promise<WechatDiaryStatus>
  openLatest(): Promise<string | null>
  openQrUrl(): Promise<void>
  onChanged(handler: (status: WechatDiaryStatus) => void): () => void
}
