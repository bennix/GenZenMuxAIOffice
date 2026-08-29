import QRCode from 'qrcode'

export async function qrDataUrlFromPayload(imageOrUrl: string): Promise<{
  dataUrl: string | null
  openUrl: string | null
}> {
  const raw = imageOrUrl.trim()
  if (!raw) return { dataUrl: null, openUrl: null }
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/iu.test(raw)) {
    return { dataUrl: raw, openUrl: null }
  }
  if (/^https?:\/\//i.test(raw)) {
    const dataUrl = await QRCode.toDataURL(raw, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#111111', light: '#ffffff' },
    })
    return { dataUrl, openUrl: raw }
  }
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.length > 32) {
      return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, openUrl: null }
    }
  } catch {
    /* fall through and encode as text */
  }
  const dataUrl = await QRCode.toDataURL(raw, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
  })
  return { dataUrl, openUrl: null }
}
