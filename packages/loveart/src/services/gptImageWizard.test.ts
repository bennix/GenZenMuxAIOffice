import { expect, it } from 'vitest'
import { composeWizardPrompt, gptImageLibrary, templateFields } from './gptImageWizard'

it('offers all 33 source text templates across 13 categories with attribution', () => {
  expect(gptImageLibrary.categories).toHaveLength(13)
  expect(gptImageLibrary.templates).toHaveLength(33)
  for (const category of gptImageLibrary.categories)
    expect(gptImageLibrary.templates.some((template) => template.categoryId === category.id)).toBe(
      true,
    )
  for (const template of gptImageLibrary.templates) {
    expect(template.source).toContain(gptImageLibrary.commit)
    const fields = templateFields(template)
    const values = Object.fromEntries(fields.map((field) => [field.key, '用户填写的内容']))
    const result = composeWizardPrompt(template, '咖啡店海报', values, '准确保留“秋日特调”')
    expect(result).toContain('咖啡店海报')
    expect(result).toContain('准确保留“秋日特调”')
    expect(result).not.toMatch(/\[[^[\]\n]+\]|\{[^{}\n]+\}|【[^【】\n]+】/)
  }
})

it('reuses named curly variables and preserves literal user replacement characters', () => {
  const template = {
    ...gptImageLibrary.templates[0],
    prompt: '{主体}与{主体}，主色[颜色]，强调色[颜色]',
  }
  expect(templateFields(template)).toHaveLength(3)
  expect(
    composeWizardPrompt(
      template,
      'test',
      { 'shared:主体': '$&猫', 'field:2': '红', 'field:3': '蓝' },
      '',
    ),
  ).toContain('$&猫与$&猫，主色红，强调色蓝')
})
