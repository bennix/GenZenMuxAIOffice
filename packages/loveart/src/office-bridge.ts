export interface OfficeBridge {
  insertLabel?: string
  insertVideo?(dataUrl: string): Promise<void>
  fetchMedia?(url: string): Promise<{ base64: string; mime: string } | null>
  saveApiKey?(key: string): Promise<void>
  insertImage(dataUrl: string): Promise<void>
  listImageTargets?(): Promise<Array<{ id: string; kind: string; title: string }>>
  shareImage?(targetId: string, dataUrl: string): Promise<{ ok: boolean; error?: string }>
  fetchImage(url: string): Promise<{ base64: string; mime: string } | null>
}
declare global {
  interface Window {
    loveArtOffice?: OfficeBridge
  }
}
export async function insertOfficeImage(src: string, targetId?: string): Promise<void> {
  const bridge = window.loveArtOffice
  if (!bridge) throw new Error('请从 Office 打开 ArtFlow。')
  let dataUrl = src
  if (/^https?:/.test(src)) {
    const image = await bridge.fetchImage(src)
    if (!image) throw new Error('图片下载失败，请重试。')
    dataUrl = `data:${image.mime};base64,${image.base64}`
  } else if (src.startsWith('blob:')) {
    const blob = await (await fetch(src)).blob()
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('无法读取图片。'))
      reader.readAsDataURL(blob)
    })
  }
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(dataUrl))
    throw new Error('请选择 PNG、JPEG 或 WebP 图片。')
  // Word embeds PNG/JPEG. Convert WebP before returning to its OOXML writer.
  if (dataUrl.startsWith('data:image/webp;')) {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    dataUrl = canvas.toDataURL('image/png')
  }
  if (targetId) {
    if (!bridge.shareImage) throw new Error('当前环境不支持跨文件分享。')
    const result = await bridge.shareImage(targetId, dataUrl)
    if (!result.ok) throw new Error(result.error || '图片分享失败。')
  } else await bridge.insertImage(dataUrl)
}

/** MP4 stays an embedded media object in PowerPoint, not a frame screenshot. */
export async function insertOfficeVideo(src: string): Promise<void> {
  const bridge = window.loveArtOffice
  if (!bridge?.insertVideo) throw new Error('请从 PPT 的 AI 素材入口插入视频。')
  let dataUrl = src
  if (/^https?:/.test(src)) {
    const media = await bridge.fetchMedia?.(src)
    if (!media || media.mime !== 'video/mp4') throw new Error('请选择 MP4 视频。')
    dataUrl = `data:${media.mime};base64,${media.base64}`
  } else if (src.startsWith('blob:')) {
    const blob = await (await fetch(src)).blob()
    if (blob.size > 64_000_000) throw new Error('视频不能超过 64 MB。')
    const signature = new TextDecoder().decode(await blob.slice(4, 8).arrayBuffer())
    if (signature !== 'ftyp') throw new Error('请选择 MP4 视频。')
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('无法读取视频。'))
      reader.readAsDataURL(new Blob([blob], { type: 'video/mp4' }))
    })
  }
  if (!/^data:video\/mp4;base64,[A-Za-z0-9+/=\s]+$/.test(dataUrl) || dataUrl.length > 86_000_000)
    throw new Error('请选择 64 MB 以内的 MP4 视频。')
  await bridge.insertVideo(dataUrl)
}
