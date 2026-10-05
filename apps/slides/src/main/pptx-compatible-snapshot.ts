import { openPptx, savePptx } from '@genoffice/pptx-engine'

/** 修正已确认的生成器顺序缺陷，只改独立导出快照，不写回源会话。 */
export async function prepareCompatiblePptxBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const snapshot = await openPptx(bytes)
  const path = 'ppt/presentation.xml'
  const xml = snapshot.archive.readText(path)
  if (!xml) return bytes
  const notes = xml.match(/<p:notesMasterIdLst\b[^>]*>[\s\S]*?<\/p:notesMasterIdLst>/)?.[0]
  if (!notes) return bytes
  const firstLater = xml.search(/<p:(?:handoutMasterIdLst|sldIdLst|sldSz|notesSz)\b/)
  if (firstLater < 0 || xml.indexOf(notes) < firstLater) return bytes
  // 旧版生成稿把 notesMasterIdLst 放在 sldIdLst 后，严格 OpenXML 验收会拒绝。
  const without = xml.replace(notes, '')
  const fixed = without.replace(/<p:(?:handoutMasterIdLst|sldIdLst|sldSz|notesSz)\b/, `${notes}$&`)
  snapshot.archive.entries.set(path, new TextEncoder().encode(fixed))
  return savePptx(snapshot)
}
