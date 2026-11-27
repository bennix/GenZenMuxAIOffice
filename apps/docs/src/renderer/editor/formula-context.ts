import type { Editor } from '@tiptap/core'

/** Bounded, human-readable context, generated from the current edited document. */
export function formulaQuestionContext(editor: Editor, pos: number, fileName: string): string {
  const blocks: Array<{ pos: number; text: string; heading: boolean }> = []
  editor.state.doc.forEach((node, offset) => {
    const formula = node.attrs.formulaDisplay
    const text = node.textContent || String(node.attrs.previewText ?? formula?.latex ?? '')
    blocks.push({
      pos: offset,
      text,
      heading:
        node.type.name === 'docHeading' || /^Heading[1-9]$/i.test(String(node.attrs.styleId ?? '')),
    })
  })
  const at = Math.max(
    0,
    blocks.reduce((last, block, index) => (block.pos <= pos ? index : last), -1),
  )
  const heading = blocks
    .slice(0, at + 1)
    .reverse()
    .find((block) => block.heading && block.text.trim())
  const before = blocks
    .slice(0, at)
    .filter((block) => block.text.trim())
    .slice(-2)
  const after = blocks
    .slice(at + 1)
    .filter((block) => block.text.trim())
    .slice(0, 2)
  const quote = (items: typeof blocks) =>
    items.map((block) => block.text.slice(0, 1000)).join('\n\n') || '（无）'
  return [
    `文稿：${fileName.slice(0, 200)}`,
    `所在章节：${heading?.text.slice(0, 200) || '（未标注）'}`,
    `公式编号／所在段落：\n${blocks[at]?.text.slice(0, 1000) || '（见公式图片）'}`,
    `前文：\n${quote(before)}`,
    `后文：\n${quote(after)}`,
  ].join('\n\n')
}

/** Original equation previews keep their full resolution; native equations use the system capture path. */
export async function formulaImage(editor: Editor, pos: number): Promise<string> {
  const host = editor.view.nodeDOM(pos)
  if (!(host instanceof HTMLElement)) throw new Error('无法定位选中的公式')
  const image = host.querySelector<HTMLImageElement>('.doc-ole-img')
  if (image?.src.startsWith('data:image/png;base64,')) return image.src
  const math = host.querySelector<HTMLElement>('.doc-formula-math') ?? host
  math.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await document.fonts.ready
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const rect = math.getBoundingClientRect()
  return window.desktop.captureFormulaImage({
    x: Math.max(0, Math.floor(rect.left)),
    y: Math.max(0, Math.floor(rect.top)),
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
  })
}
