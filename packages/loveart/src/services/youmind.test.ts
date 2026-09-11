import { describe, expect, it } from 'vitest'
import {
  applyYouMindTemplate,
  composeYouMindGuidance,
  extractYouMindBrief,
  isAppliedYouMindPrompt,
  listYouMindCategories,
  listYouMindTemplates,
  validateYouMindImportPack,
  YOUMIND_CATALOG,
  youMindCategoryById,
  youMindTemplateById,
} from './youmind'
import type { YouMindCatalog } from './youmind'

describe('youmind catalog', () => {
  it('lists localized categories and templates from the built-in catalog', () => {
    expect(listYouMindCategories().map((item) => item.id)).toContain('product-marketing')
    expect(listYouMindCategories().map((item) => item.id)).toContain('poster-flyer')
    expect(listYouMindTemplates().map((item) => item.id)).toContain(
      'youmind-product-marketing-launch-poster',
    )

    const zhCategory = youMindCategoryById('product-marketing', 'zh')
    const zhTemplate = youMindTemplateById('youmind-product-marketing-launch-poster', 'zh')

    expect(zhCategory?.title).toBe('产品营销')
    expect(zhCategory?.summary).toContain('商品卖点')
    expect(zhTemplate?.title).toBe('产品营销发布海报')
    expect(zhTemplate?.prompt).toContain('{USER_BRIEF}')
  })

  it('provides expanded template coverage for every YouMind category', () => {
    const categories = listYouMindCategories()
    const templates = listYouMindTemplates()

    expect(templates.length).toBeGreaterThanOrEqual(categories.length * 2)
    for (const category of categories) {
      expect(
        templates.filter((template) => template.categoryId === category.id).length,
      ).toBeGreaterThanOrEqual(2)
    }
    expect(templates.map((template) => template.id)).toContain('youmind-app-saas-dashboard-mockup')
    expect(templates.map((template) => template.id)).toContain('youmind-typography-quote-poster')
  })

  it('returns fresh arrays so callers cannot mutate catalog order', () => {
    const firstCategoryId = listYouMindCategories()[0]?.id
    const firstTemplateId = listYouMindTemplates()[0]?.id

    listYouMindCategories().reverse().pop()
    listYouMindTemplates().reverse().pop()

    expect(listYouMindCategories()[0]?.id).toBe(firstCategoryId)
    expect(listYouMindTemplates()[0]?.id).toBe(firstTemplateId)
  })

  it('returns fresh nested category and template objects so callers cannot mutate the catalog', () => {
    const category = youMindCategoryById('product-marketing')
    const template = youMindTemplateById('youmind-product-marketing-launch-poster')
    expect(category?.localized?.zh).toBeDefined()
    expect(template?.source).toBeDefined()

    category!.localized!.zh!.title = 'Mutated category title'
    template!.source.url = 'https://example.com/mutated-template-source'

    expect(youMindCategoryById('product-marketing', 'zh')?.title).toBe('产品营销')
    expect(youMindTemplateById('youmind-product-marketing-launch-poster')?.source.url).toBe(
      'https://youmind.com/zh-CN/prompts/image/product-marketing',
    )
  })

  it('applies an executable template with brief and aspect', () => {
    const template = youMindTemplateById('youmind-product-marketing-launch-poster')
    expect(template).toBeDefined()

    const prompt = applyYouMindTemplate(template!, {
      brief: 'a modular desk lamp for software teams',
      aspect: '16:9',
    })

    expect(prompt).toContain('YouMind GPT Image 2 template: Product Marketing Launch Poster')
    expect(prompt).toContain('User brief: a modular desk lamp for software teams')
    expect(prompt).toContain('Target aspect ratio: 16:9')
    expect(prompt).toContain('Template prompt: Create a 16:9 GPT Image 2')
    expect(prompt).toContain('Source: YouMind GPT Image 2')
  })

  it('can include category guidance in visible YouMind template prompts', () => {
    const template = youMindTemplateById('youmind-product-marketing-launch-poster', 'zh')
    const category = youMindCategoryById('product-marketing', 'zh')
    expect(template).toBeDefined()
    expect(category).toBeDefined()

    const prompt = applyYouMindTemplate(template!, {
      brief: '智能咖啡杯',
      aspect: '1:1',
      locale: 'zh',
      category,
    })

    expect(prompt).toContain('分类指引: 使用场景: 产品营销')
    expect(isAppliedYouMindPrompt(prompt)).toBe(true)
    expect(extractYouMindBrief(prompt)).toBe('智能咖啡杯')
  })

  it('applies localized template output in Chinese', () => {
    const template = youMindTemplateById('youmind-social-post-readable-type', 'zh')
    expect(template).toBeDefined()

    const prompt = applyYouMindTemplate(template!, {
      brief: '夏季咖啡新品',
      aspect: '1:1',
      locale: 'zh',
    })

    expect(prompt).toContain('YouMind GPT Image 2 模板: 社交媒体可读文字图')
    expect(prompt).toContain('用户需求: 夏季咖啡新品')
    expect(prompt).toContain('目标比例: 1:1')
    expect(prompt).toContain('模板提示词: 创建一张 1:1 GPT Image 2')
  })

  it('composes compact guidance for a selected category', () => {
    const category = youMindCategoryById('poster-flyer')
    expect(category).toBeDefined()

    const guidance = composeYouMindGuidance({ category: category! })!

    expect(guidance).toContain('YouMind GPT Image 2 source: Poster / Flyer')
    expect(guidance).toContain('Use case: event posters')
    expect(guidance).toContain('readable text')
    expect(guidance.length).toBeLessThan(1800)
  })

  it('validates authorized import packs with useful path errors', () => {
    expect(
      validateYouMindImportPack({
        source: {
          id: 'authorized-youwind-pack',
          name: 'Authorized Pack',
          url: 'https://example.com/authorized-pack',
          license: 'Authorized internal use',
        },
        importedAt: '2026-06-14',
        categories: [
          {
            id: 'custom-category',
            title: 'Custom Category',
            summary: 'Authorized custom examples.',
            tags: ['custom'],
            sourceUrl: 'https://example.com/custom-category',
          },
        ],
        items: [
          {
            id: 'custom-item',
            title: 'Custom Item',
            prompt: 'Create {USER_BRIEF} as a clean product visual.',
            categoryId: 'custom-category',
            tags: ['custom'],
            model: 'gpt-image-2',
            aspect: '1:1',
            sourceUrl: 'https://example.com/custom-item',
            license: 'Authorized internal use',
          },
        ],
      }),
    ).toBe(true)

    expect(() =>
      validateYouMindImportPack({
        source: { id: 'broken', name: '', url: 'https://example.com', license: 'test' },
        importedAt: '2026-06-14',
        categories: [],
        items: [],
      }),
    ).toThrow('Invalid YouMind import pack: source.name must be a non-empty string.')

    expect(() =>
      validateYouMindImportPack({
        source: {
          id: 'broken-category-ref',
          name: 'Broken Category Ref',
          url: 'https://example.com/broken-category-ref',
          license: 'test',
        },
        importedAt: '2026-06-14',
        categories: [
          {
            id: 'known-category',
            title: 'Known Category',
            summary: 'Known custom examples.',
            tags: ['custom'],
            sourceUrl: 'https://example.com/known-category',
          },
        ],
        items: [
          {
            id: 'unknown-category-item',
            title: 'Unknown Category Item',
            prompt: 'Create {USER_BRIEF} as a clean product visual.',
            categoryId: 'missing-category',
            tags: ['custom'],
            model: 'gpt-image-2',
            aspect: '1:1',
            sourceUrl: 'https://example.com/unknown-category-item',
            license: 'test',
          },
        ],
      }),
    ).toThrow(
      'Invalid YouMind import pack: items[0].categoryId must reference a category id from categories.',
    )
  })

  it('protects helper reads from exported catalog snapshot mutation attempts', () => {
    const exportedCatalog = YOUMIND_CATALOG as unknown as YouMindCatalog
    const exportedCategory = exportedCatalog.categories.find(
      (item) => item.id === 'product-marketing',
    )
    const exportedTemplate = exportedCatalog.promptTemplates.find(
      (item) => item.id === 'youmind-product-marketing-launch-poster',
    )
    expect(exportedCategory?.localized?.zh).toBeDefined()
    expect(exportedTemplate?.source).toBeDefined()

    const originalCategoryTitle = exportedCategory!.localized!.zh!.title
    const originalTemplateTitle = exportedTemplate!.title
    const originalTemplateSourceUrl = exportedTemplate!.source.url

    try {
      try {
        exportedCategory!.localized!.zh!.title = 'Mutated exported category title'
        exportedTemplate!.title = 'Mutated exported template title'
        exportedTemplate!.source.url = 'https://example.com/exported-mutation'
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError)
      }

      expect(
        listYouMindCategories('zh').find((item) => item.id === 'product-marketing')?.title,
      ).toBe('产品营销')
      expect(
        listYouMindTemplates().find((item) => item.id === 'youmind-product-marketing-launch-poster')
          ?.title,
      ).toBe('Product Marketing Launch Poster')
      expect(youMindTemplateById('youmind-product-marketing-launch-poster')?.source.url).toBe(
        'https://youmind.com/zh-CN/prompts/image/product-marketing',
      )
    } finally {
      if (!Object.isFrozen(exportedCategory!.localized!.zh!)) {
        exportedCategory!.localized!.zh!.title = originalCategoryTitle
      }
      if (!Object.isFrozen(exportedTemplate!)) {
        exportedTemplate!.title = originalTemplateTitle
      }
      if (!Object.isFrozen(exportedTemplate!.source)) {
        exportedTemplate!.source.url = originalTemplateSourceUrl
      }
    }
  })
})
