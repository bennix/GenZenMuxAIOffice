export interface OfficeBridge {
  saveApiKey?(key: string): Promise<void>
  insertImage(dataUrl: string): Promise<void>
  fetchImage(url: string): Promise<{ base64: string; mime: string } | null>
}
declare global {
  interface Window {
    loveArtOffice?: OfficeBridge
  }
}
export async function insertOfficeImage(src: string): Promise<void> {
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
  await bridge.insertImage(dataUrl)
}
