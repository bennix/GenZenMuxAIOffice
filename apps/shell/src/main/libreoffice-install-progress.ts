import { BrowserWindow, dialog, shell } from 'electron'

import {
  LIBREOFFICE_DOWNLOAD_URL,
  canAutoInstallLibreOffice,
  installLibreOffice,
  type LibreOfficeInstallProgress,
} from './libreoffice-install'

export function buildLibreOfficeProgressHtml(chinese: boolean): string {
  const title = chinese ? '正在安装 LibreOffice' : 'Installing LibreOffice'
  const note = chinese
    ? '请保持 ZenOffice 运行。安装完成后将自动继续打开文档。'
    : 'Keep ZenOffice running. The document will open automatically after installation.'
  const preparing = chinese ? '正在准备系统安装器…' : 'Preparing the system installer…'
  const elapsed = chinese ? '已用时间' : 'Elapsed'
  const commandLog = chinese ? '实时安装日志' : 'Live installation log'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;background:#f5f5f7;color:#171717}main{box-sizing:border-box;height:100vh;padding:28px 30px 24px;display:flex;flex-direction:column}
h1{margin:0;font-size:21px;line-height:1.25;font-weight:700}.note{margin:9px 0 18px;color:#5d5d63;font-size:13px;line-height:1.5}
.track{position:relative;height:9px;overflow:hidden;border-radius:999px;background:#d8d8dc}.bar{position:absolute;inset:0 auto 0 0;width:34%;border-radius:inherit;background:#111;animation:travel 1.35s ease-in-out infinite alternate}
.track.determinate .bar{animation:none;transition:width .25s ease}@keyframes travel{from{transform:translateX(-20%)}to{transform:translateX(210%)}}
.row{display:flex;justify-content:space-between;gap:16px;margin-top:11px;color:#55555b;font-size:12px}#stage{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:470px}#percent{font-variant-numeric:tabular-nums;white-space:nowrap}
.log-title{margin:18px 0 7px;font-size:12px;font-weight:650;color:#45454a}.log{box-sizing:border-box;flex:1;min-height:150px;margin:0;padding:12px 14px;overflow:auto;border:1px solid #d2d2d7;border-radius:9px;background:#ececef;color:#242426;font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
@media(prefers-color-scheme:dark){body{background:#242426;color:#f5f5f7}.note,.row,.log-title{color:#b7b7bd}.track{background:#4a4a4f}.bar{background:#fff}.log{border-color:#4b4b50;background:#18181a;color:#e8e8ea}}
</style></head><body><main><h1>${title}</h1><p class="note">${note}</p><div id="track" class="track"><div id="bar" class="bar"></div></div><div class="row"><span id="stage">${preparing}</span><span id="percent">${elapsed} 00:00</span></div><div class="log-title">${commandLog}</div><pre id="log" class="log"></pre></main><script>
const started=Date.now(),elapsedLabel=${JSON.stringify(elapsed)},NL=String.fromCharCode(10);let knownPercent=null;
window.setInstallProgress=(message,percent)=>{document.getElementById('stage').textContent=message;const log=document.getElementById('log');log.textContent+=(log.textContent?NL:'')+message;const lines=log.textContent.split(NL);if(lines.length>300)log.textContent=lines.slice(-300).join(NL);log.scrollTop=log.scrollHeight;if(typeof percent==='number'){knownPercent=Math.max(0,Math.min(100,percent));document.getElementById('track').classList.add('determinate');document.getElementById('bar').style.width=knownPercent+'%'}};
setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000),time=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');document.getElementById('percent').textContent=knownPercent===null?elapsedLabel+' '+time:Math.round(knownPercent)+'% · '+time},250);
</script></body></html>`
}

async function updateProgress(
  window: BrowserWindow,
  progress: LibreOfficeInstallProgress,
): Promise<void> {
  if (window.isDestroyed()) return
  await window.webContents
    .executeJavaScript(
      `window.setInstallProgress(${JSON.stringify(progress.message)}, ${progress.percent ?? 'null'})`,
    )
    .catch(() => undefined)
}

export async function installLibreOfficeWithProgress(
  parent: BrowserWindow | undefined,
  chinese: boolean,
): Promise<boolean> {
  if (!canAutoInstallLibreOffice()) {
    await shell.openExternal(LIBREOFFICE_DOWNLOAD_URL)
    return false
  }
  const progressWindow = new BrowserWindow({
    width: 680,
    height: 470,
    parent,
    modal: Boolean(parent),
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: chinese ? '安装 LibreOffice' : 'Install LibreOffice',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  progressWindow.setMenuBarVisibility(false)
  progressWindow.setClosable(false)
  await progressWindow.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(buildLibreOfficeProgressHtml(chinese))}`,
  )
  progressWindow.show()
  parent?.setProgressBar(2)
  const installed = await installLibreOffice((progress) => {
    void updateProgress(progressWindow, progress)
  })
  parent?.setProgressBar(-1)
  if (installed.ok) {
    await updateProgress(progressWindow, {
      message: chinese ? '安装完成，正在打开文档…' : 'Installation complete. Opening document…',
      percent: 100,
    })
    await new Promise((resolve) => setTimeout(resolve, 650))
  }
  progressWindow.setClosable(true)
  progressWindow.close()
  if (installed.ok) return true

  await shell.openExternal(LIBREOFFICE_DOWNLOAD_URL)
  const failed = {
    type: 'error' as const,
    message: chinese ? 'LibreOffice 自动安装失败' : 'LibreOffice installation failed',
    detail: installed.detail,
  }
  if (parent && !parent.isDestroyed()) await dialog.showMessageBox(parent, failed)
  else await dialog.showMessageBox(failed)
  return false
}
