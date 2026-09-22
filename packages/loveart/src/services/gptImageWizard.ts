import library from '../data/gptImageLibrary/templates.json'

export const gptImageLibrary = library
export type ImageWizardTemplate = (typeof library.templates)[number]
const placeholders = /\[([^[\]\n]+)\]|\{([^{}\n]+)\}|【([^【】\n]+)】/g

export function templateFields(template: ImageWizardTemplate) {
  return [...template.prompt.matchAll(placeholders)]
    .map((match, index) => ({
      key: match[2] ? `shared:${match[2]}` : `field:${index}`,
      label: match[1] ?? match[2] ?? match[3],
    }))
    .filter((field, index, fields) => fields.findIndex((item) => item.key === field.key) === index)
}

export function composeWizardPrompt(
  template: ImageWizardTemplate,
  brief: string,
  values: Record<string, string>,
  constraints: string,
) {
  let index = 0
  const filled = template.prompt.replace(placeholders, (_token, square, curly, wide) => {
    const key = curly ? `shared:${curly}` : `field:${index}`
    index++
    return values[key]?.trim() || `（${square ?? curly ?? wide}：按用户需求合理安排）`
  })
  return [
    `用户需求：${brief.trim()}`,
    filled,
    constraints.trim() ? `额外要求与保留内容：${constraints.trim()}` : '',
    '以用户需求和填写的内容为准。指定文案逐字保留；未提供的事实、数据和品牌信息不要编造。涉及参考图时按附件编号区分用途，Sketch 用于构图。',
  ]
    .filter(Boolean)
    .join('\n\n')
}
