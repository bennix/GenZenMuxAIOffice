export type GongwenAiAction = 'draft' | 'polish' | 'review'

export const GONGWEN_AI_LABELS: Record<GongwenAiAction, string> = {
  draft: 'AI 起草',
  polish: 'AI 润色',
  review: 'AI 检查',
}

const TASKS: Record<GongwenAiAction, string> = {
  draft: '根据要求和现有材料起草完整公文正文。缺失的必要事实使用【待填写】，不要自行补造。',
  polish:
    '润色现有正文，使措辞准确、简洁、规范。保留全部事实、数据、日期、责任主体和原意，不擅自增加承诺或删减实质内容。',
  review:
    '只输出检查建议，不输出替换正文。逐项检查事实表述的一致性、语句歧义、文种与行文方向、称谓、标题层次、主送机关、文号和日期；列出原文片段、问题和修改建议。资料不足时标为待核对，不把建议写成事实。',
}

export function gongwenAiPrompt(
  action: GongwenAiAction,
  instruction: string,
  markdown: string,
  options: Record<string, string>,
): { system: string; user: string } {
  if (action === 'draft' && !instruction.trim() && !markdown.trim()) {
    throw new Error('请先填写写作要求或正文材料。')
  }
  if (action !== 'draft' && !markdown.trim()) throw new Error('请先填写需要处理的正文。')
  return {
    system: [
      '你是中文公文写作助手。根据用户提供的材料工作，不编造机关、文号、日期、政策依据或事实。',
      TASKS[action],
      '用户已填字段和所选版式是上下文，不得擅自修改；红头、页码、字体和版式由 GB/T 9704 排版器负责。不得声称已经通过国标认证或完成印制检查。',
      action === 'review'
        ? '使用中文分条给出可执行的内容检查建议。'
        : '只输出 Markdown 公文正文，不加解释和代码围栏。已有公文标题时不重复输出总标题；标题未填写时可用一个一级标题建议总标题。主体层次序数依次为一、（一）1.（1）。署名、成文日期和主送等已填写字段由排版器添加，不重复写入正文。',
    ].join('\n'),
    user: `操作：${GONGWEN_AI_LABELS[action]}\n写作要求：${instruction.trim() || '按所选操作处理现有正文'}\n已填字段及版式：${JSON.stringify(options)}\n正文材料：\n${markdown}`,
  }
}

export function cleanGongwenAiDraft(content: string): string {
  const cleaned = content
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1')
    .trim()
  if (!cleaned) throw new Error('AI 未返回有效内容，请重试。')
  return cleaned
}
