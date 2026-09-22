import { describe, expect, it } from 'vitest'
import { normalizeAiMarkdownText } from '../src/markdown-normalize'

describe('normalizeAiMarkdownText', () => {
  it('normalizes the overescaped formulas found in a saved review file', () => {
    const markdown = String.raw`第 3.2 节将关键点坐标定义为 (R\_{t-1}\\in\\mathbb{R}^{N\_q\\times3})，但式（13）写为
$$
R\_t^{gt}=T\_\\theta R\_{t-1}+t\_{gt},
$$
其中 (T\_\\theta\\in\\mathbb{R}^{3\\times3})。`
    expect(normalizeAiMarkdownText(markdown))
      .toBe(String.raw`第 3.2 节将关键点坐标定义为 $R_{t-1}\in\mathbb{R}^{N_q\times3}$，但式（13）写为

$$
R_t^{gt}=T_\theta R_{t-1}+t_{gt},
$$

其中 $T_\theta\in\mathbb{R}^{3\times3}$。`)
  })

  it('keeps inline and fenced code byte-for-byte unchanged', () => {
    const markdown = [
      String.raw`代码 \`(R\_{t-1}\\in\\mathbb{R})\`。`,
      '```tex',
      String.raw`(R\_{t-1}\\in\\mathbb{R})`,
      '```',
    ].join('\n')
    expect(normalizeAiMarkdownText(markdown)).toBe(markdown)
  })

  it('preserves an intentional single escaped underscore in existing math', () => {
    const markdown = String.raw`Keep $v\_0$ literal.`
    expect(normalizeAiMarkdownText(markdown)).toBe(markdown)
  })

  it('repairs whitespace just inside otherwise-literal bold delimiters', () => {
    expect(normalizeAiMarkdownText('UniKPT 为** 45.03/74.62**，结果较低。')).toBe(
      'UniKPT 为 **45.03/74.62**，结果较低。',
    )
  })

  it('does not pair the close of one bold span with the open of the next', () => {
    const markdown = 'P2P 为 **46.43/75.08**，UniKPT 为 **45.03/74.62**，两项均较低。'
    expect(normalizeAiMarkdownText(markdown)).toBe(markdown)
  })
})
