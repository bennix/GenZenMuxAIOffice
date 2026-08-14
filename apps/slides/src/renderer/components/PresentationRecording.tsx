import React, { useEffect, useState } from 'react'
import { formatClock } from '../slideshow-utils'
import { useI18n } from '../i18n/locale'
import type { PresentationRecorderState } from '../action-context'

export interface PresentationRecordingOptions {
  microphone: boolean
  systemAudio: boolean
  deviceId?: string
  fromStart: boolean
}

export function PresentationRecordingDialog({
  onClose,
  onStart,
}: {
  onClose: () => void
  onStart: (options: PresentationRecordingOptions) => Promise<boolean>
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const [microphone, setMicrophone] = useState(true)
  const [systemAudio, setSystemAudio] = useState(true)
  const [fromStart, setFromStart] = useState(true)
  const [deviceId, setDeviceId] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let live = true
    void navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (live) setDevices(all.filter((d) => d.kind === 'audioinput'))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="modal-backdrop" onClick={starting ? undefined : onClose}>
      <div className="modal recording-setup" onClick={(e) => e.stopPropagation()}>
        <h2>{zh ? '录制幻灯片演示' : 'Record presentation'}</h2>
        <p className="recording-help">
          {zh
            ? '将幻灯片放映画面与麦克风讲解同步录制，停止后导出为 MP4。录制在本地完成，不受 AI 或网络状态影响。'
            : 'Record the slide show and microphone narration together, then export a local MP4. Recording does not use AI or the network.'}
        </p>
        <label className="dlg-check">
          <input
            type="checkbox"
            checked={microphone}
            onChange={(e) => setMicrophone(e.target.checked)}
          />
          {zh ? '录制麦克风讲解' : 'Record microphone narration'}
        </label>
        <label className="dlg-check">
          <input
            type="checkbox"
            checked={systemAudio}
            onChange={(e) => setSystemAudio(e.target.checked)}
          />
          {zh ? '同时录制系统/演示文稿声音' : 'Also record system/presentation audio'}
        </label>
        <label>
          {zh ? '麦克风' : 'Microphone'}
          <select
            disabled={!microphone}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">{zh ? '系统默认麦克风' : 'System default microphone'}</option>
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `${zh ? '麦克风' : 'Microphone'} ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label className="dlg-check">
          <input
            type="checkbox"
            checked={fromStart}
            onChange={(e) => setFromStart(e.target.checked)}
          />
          {zh ? '从第一张非隐藏幻灯片开始' : 'Start from the first visible slide'}
        </label>
        <p className="recording-permission-note">
          {zh
            ? '开始后，请允许麦克风和屏幕录制权限，并在系统选择器中选择 GenOffice 窗口或屏幕。系统声音是否可用取决于操作系统和所选捕获源。'
            : 'Allow microphone and screen recording, then select the GenOffice window or display. System-audio availability depends on the OS and selected capture source.'}
        </p>
        <div className="modal-actions">
          <button disabled={starting} onClick={onClose}>
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            className="primary"
            disabled={starting}
            onClick={async () => {
              setStarting(true)
              const ok = await onStart({
                microphone,
                systemAudio,
                deviceId: deviceId || undefined,
                fromStart,
              })
              if (!ok) setStarting(false)
            }}
          >
            {starting
              ? zh
                ? '正在请求权限…'
                : 'Requesting access…'
              : zh
                ? '开始录制'
                : 'Start recording'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PresentationRecordingControls({
  recorder,
  paused,
  onPauseResume,
  onStop,
  onCancel,
}: {
  recorder: PresentationRecorderState
  paused: boolean
  onPauseResume: () => void
  onStop: () => void
  onCancel: () => void
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])
  const pausedAt = recorder.pausedAt ?? now
  const elapsed = Math.max(0, pausedAt - recorder.startedAt - recorder.pausedTotalMs)
  return (
    <div
      className="presentation-recording-controls"
      role="toolbar"
      aria-label={zh ? '录制控制' : 'Recording controls'}
    >
      <span className="recording-live-dot" />
      <strong>{paused ? (zh ? '已暂停' : 'Paused') : zh ? '正在录制' : 'Recording'}</strong>
      <span className="recording-clock">{formatClock(elapsed)}</span>
      <button onClick={onPauseResume}>
        {paused ? (zh ? '继续' : 'Resume') : zh ? '暂停' : 'Pause'}
      </button>
      <button className="recording-stop" onClick={onStop}>
        {zh ? '停止并导出 MP4' : 'Stop & export MP4'}
      </button>
      <button onClick={onCancel}>{zh ? '取消录制' : 'Cancel recording'}</button>
    </div>
  )
}
