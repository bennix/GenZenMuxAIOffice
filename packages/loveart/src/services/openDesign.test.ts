import { describe, expect, it } from 'vitest'
import {
  applyOpenDesignTemplate,
  composeOpenDesignContext,
  listOpenDesignSystems,
  listOpenDesignTemplates,
  openDesignSystemById,
  openDesignTemplateById,
} from './openDesign'
import type { OpenDesignTemplate } from './openDesign'

describe('openDesign catalog', () => {
  it('lists curated systems and filters templates by surface', () => {
    expect(listOpenDesignSystems().map((s) => s.id)).toContain('notion')
    expect(listOpenDesignSystems().map((s) => s.id)).toContain('openai')
    expect(listOpenDesignTemplates('image').every((t) => t.surface === 'image')).toBe(true)
    expect(listOpenDesignTemplates('video').every((t) => t.surface === 'video')).toBe(true)
  })

  it('finds systems and templates by id', () => {
    expect(openDesignSystemById('stripe')?.name).toBe('Stripe')
    expect(openDesignTemplateById('notion-team-dashboard-live-artifact')?.surface).toBe('image')
    expect(openDesignTemplateById('missing-template')).toBeUndefined()
  })

  it('localizes systems and templates for Chinese UI language', () => {
    const defaultSystem = listOpenDesignSystems('zh')[0]
    const notionSystem = openDesignSystemById('notion', 'zh')
    const notionTemplate = openDesignTemplateById('notion-team-dashboard-live-artifact', 'zh')

    expect(defaultSystem?.name).toBe('中性现代')
    expect(notionSystem?.category).toBe('效率工具与 SaaS')
    expect(notionSystem?.summary).toContain('温暖极简')
    expect(notionTemplate?.title).toBe('Notion 风格团队仪表盘')
    expect(notionTemplate?.tags).toContain('仪表盘')
    expect(notionTemplate?.prompt).toContain('示例数据说明')
    expect(listOpenDesignSystems()[0]?.name).toBe('Neutral Modern')
  })

  it('returns fresh catalog lists so callers cannot reorder catalog state', () => {
    const firstSystemId = listOpenDesignSystems()[0]?.id
    const firstTemplateId = listOpenDesignTemplates()[0]?.id

    const systems = listOpenDesignSystems()
    systems.sort((a, b) => b.id.localeCompare(a.id))
    systems.pop()

    const templates = listOpenDesignTemplates()
    templates.sort((a, b) => b.id.localeCompare(a.id))
    templates.pop()

    const imageTemplates = listOpenDesignTemplates('image')
    imageTemplates.length = 0

    expect(listOpenDesignSystems()[0]?.id).toBe(firstSystemId)
    expect(listOpenDesignTemplates()[0]?.id).toBe(firstTemplateId)
    expect(listOpenDesignTemplates('image').length).toBeGreaterThan(0)
  })

  it('applies a template with brief, aspect, and design-system context', () => {
    const template = openDesignTemplateById('notion-team-dashboard-live-artifact')
    const system = openDesignSystemById('notion')
    expect(template).toBeDefined()
    expect(system).toBeDefined()

    const prompt = applyOpenDesignTemplate(template!, {
      brief: 'Q3 roadmap command center for a product team',
      aspect: '16:9',
      designSystem: system,
    })

    expect(prompt).toContain('Notion-style Team Dashboard')
    expect(prompt).toContain('Q3 roadmap command center for a product team')
    expect(prompt).toContain('Target aspect ratio: 16:9')
    expect(prompt).toContain('Warm minimalism')
    expect(prompt).toContain('Source: Open Design')
  })

  it('applies localized template and design-system context in Chinese', () => {
    const template = openDesignTemplateById('notion-team-dashboard-live-artifact', 'zh')
    const system = openDesignSystemById('notion', 'zh')
    expect(template).toBeDefined()
    expect(system).toBeDefined()

    const prompt = applyOpenDesignTemplate(template!, {
      brief: '产品团队 Q3 路线图指挥中心',
      aspect: '16:9',
      designSystem: system,
      locale: 'zh',
    })

    expect(prompt).toContain('Open Design 模板: Notion 风格团队仪表盘')
    expect(prompt).toContain('用户需求: 产品团队 Q3 路线图指挥中心')
    expect(prompt).toContain('目标比例: 16:9')
    expect(prompt).toContain('模板提示词: 为 产品团队 Q3 路线图指挥中心 创建')
    expect(prompt).toContain('设计系统概要: 温暖极简')
  })

  it('falls back to a default brief for nullish template briefs', () => {
    const template = openDesignTemplateById('notion-team-dashboard-live-artifact')
    expect(template).toBeDefined()

    expect(applyOpenDesignTemplate(template!, { brief: null, aspect: '1:1' })).toContain(
      'an original design asset',
    )
    expect(applyOpenDesignTemplate(template!, { brief: undefined, aspect: '1:1' })).toContain(
      'an original design asset',
    )
  })

  it('uses exact placeholder argument names before replacing with brief text', () => {
    const template: OpenDesignTemplate = {
      id: 'synthetic-argument-template',
      surface: 'image',
      title: 'Synthetic Argument Template',
      summary: 'Exercises Open Design argument placeholder replacement.',
      category: 'Test',
      tags: ['test'],
      model: 'test-model',
      aspect: '1:1',
      prompt:
        'Subject {argument name="subject" default="Thing"}. Brand color {argument name="brandColor" default="#123456"}.',
      source: {
        repo: 'https://github.com/nexu-io/open-design',
        path: 'prompt-templates/image/synthetic.json',
        license: 'Apache-2.0',
      },
    }

    const prompt = applyOpenDesignTemplate(template, {
      brief: 'Aurora wallet',
      aspect: '1:1',
    })

    expect(prompt).toContain('Subject Aurora wallet')
    expect(prompt).toContain('Brand color #123456')
    expect(prompt).not.toContain('Brand color Aurora wallet')
  })

  it('composes compact agent context from a design system', () => {
    const system = openDesignSystemById('linear-app')
    expect(system).toBeDefined()

    const context = composeOpenDesignContext({ designSystem: system! })

    expect(context).toContain('Open Design design system: Linear')
    expect(context).toContain('dark-mode-native')
    expect(context.length).toBeLessThan(1800)
  })

  it('composes compact localized agent context from a design system', () => {
    const system = openDesignSystemById('linear-app', 'zh')
    expect(system).toBeDefined()

    const context = composeOpenDesignContext({ designSystem: system!, locale: 'zh' })

    expect(context).toContain('Open Design 设计系统: Linear')
    expect(context).toContain('原生深色模式')
    expect(context).toContain('内部契约')
    expect(context.length).toBeLessThan(1800)
  })
})
