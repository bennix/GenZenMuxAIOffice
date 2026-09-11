import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { generateGongwen } from '../src/generator.js'

const body =
  '# 工作报告\n\n一、工作进展\n\n已完成本阶段任务。\n\n（一）下一步安排\n\n继续开展测试。'
async function parts(options: Record<string, string | boolean> = {}) {
  const result = await generateGongwen(body, options)
  const zip = await JSZip.loadAsync(result.bytes)
  return {
    zip,
    xml: await zip.file('word/document.xml')!.async('string'),
    warnings: result.warnings,
  }
}
describe('Office gongwen integration', () => {
  it('creates readable ordinary OOXML with A4, margins, body text and centered page field', async () => {
    const { zip, xml } = await parts()
    expect(xml).toContain('已完成本阶段任务。')
    expect(xml).toContain('w:w="11906"')
    expect(xml).toContain('w:top="2098"')
    expect(xml).toContain('w:left="1588"')
    expect(xml).not.toContain('FF0000')
    expect(await zip.file('word/footerCenter.xml')!.async('string')).toContain('PAGE')
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(styles).toContain('w:sz w:val="32"')
    expect(styles).toContain('w:outlineLvl')
  })
  it('distinguishes preprinted from digital letterheads and preserves odd/even footers', async () => {
    const args = { format: 'formal', org: '测试单位文件', 'doc-no': '测试发〔2026〕1号' }
    const paper = await parts(args)
    const digital = await parts({ ...args, letterhead: 'digital' })
    expect(paper.xml).not.toContain('FF0000')
    expect(digital.xml).toContain('FF0000')
    expect(digital.xml).toContain('测试单位文件')
    expect(paper.zip.file('word/footerOdd.xml')).not.toBeNull()
    expect(paper.zip.file('word/footerEven.xml')).not.toBeNull()
  })
  it.each(['letter', 'command', 'minutes'])('supports the dedicated %s layout', async (format) => {
    const { xml } = await parts({
      format,
      org: format === 'minutes' ? '办公会议纪要' : '测试单位',
      'doc-no': format === 'command' ? '第1号' : '测试发〔2026〕1号',
    })
    expect(xml).toContain('已完成本阶段任务。')
    expect(xml).toContain('FF0000')
  })
  it('rejects malformed fields and does not load file paths supplied as extra options', async () => {
    await expect(generateGongwen('')).rejects.toThrow('正文')
    await expect(generateGongwen(body, { format: 'other' })).rejects.toThrow('版式')
    await expect(generateGongwen(body, { date: '2026年09月11日' })).rejects.toThrow()
    await expect(
      generateGongwen(body, { format: 'formal', 'doc-no': '测试发[2026]01号' }),
    ).rejects.toThrow()
    const { xml } = await parts({ 'attachment-file': '/does/not/exist' })
    expect(xml).toContain('已完成本阶段任务。')
  })
})
