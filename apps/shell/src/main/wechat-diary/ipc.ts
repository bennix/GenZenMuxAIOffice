import { ipcMain } from 'electron'
import { WECHAT_DIARY_CHANNELS } from '../../shared/wechat-diary-api'
import type { WechatDiaryPrefs } from '../../shared/wechat-diary-api'
import {
  initWechatDiary,
  openLatestDiary,
  openWechatQrUrl,
  pickWechatDiaryDir,
  readLocalAiSettings,
  setWechatDiaryPrefs,
  startWechatBind,
  stopWechatDiary,
  submitWechatPair,
  unbindWechat,
  wechatDiaryStatus,
  type WechatDiaryDeps,
} from './service'

let registered = false

export function registerWechatDiaryIpc(
  deps: Omit<WechatDiaryDeps, 'readAiSettings' | 'broadcast'> & {
    broadcast: WechatDiaryDeps['broadcast']
  },
): void {
  if (!registered) {
    ipcMain.handle(WECHAT_DIARY_CHANNELS.status, () => wechatDiaryStatus())
    ipcMain.handle(WECHAT_DIARY_CHANNELS.setPrefs, (_e, value: unknown) => {
      const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
      const prefs: WechatDiaryPrefs = {}
      if (typeof raw.enabled === 'boolean') prefs.enabled = raw.enabled
      if (typeof raw.aiEnabled === 'boolean') prefs.aiEnabled = raw.aiEnabled
      if (typeof raw.diaryDir === 'string' && raw.diaryDir.length <= 4096) {
        prefs.diaryDir = raw.diaryDir
      }
      return setWechatDiaryPrefs(prefs)
    })
    ipcMain.handle(WECHAT_DIARY_CHANNELS.startBind, () => startWechatBind())
    ipcMain.handle(WECHAT_DIARY_CHANNELS.submitPair, (_e, code: unknown) =>
      submitWechatPair(typeof code === 'string' && /^\d{1,12}$/u.test(code.trim()) ? code : ''),
    )
    ipcMain.handle(WECHAT_DIARY_CHANNELS.unbind, () => unbindWechat())
    ipcMain.handle(WECHAT_DIARY_CHANNELS.pickDir, () => pickWechatDiaryDir())
    ipcMain.handle(WECHAT_DIARY_CHANNELS.openLatest, () => openLatestDiary())
    ipcMain.handle(WECHAT_DIARY_CHANNELS.openQr, () => {
      openWechatQrUrl()
    })
    registered = true
  }
  initWechatDiary({
    ...deps,
    readAiSettings: () => readLocalAiSettings(deps.userDataPath()),
  })
}

export { stopWechatDiary }
