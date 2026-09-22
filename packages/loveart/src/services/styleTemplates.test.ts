import { describe, expect, it } from 'vitest'
import { listStyleTemplates, styleBySlug } from './styleTemplates'

describe('style template localization', () => {
  it('keeps English style labels by default', () => {
    expect(listStyleTemplates()[0]?.name).toBe('Acid Lime 3D Streetwear Type Poster')
    expect(styleBySlug('bold-anime-reaction-thumbnail-style')?.summary).toContain(
      'high-impact anime web-thumbnail',
    )
  })

  it('returns Chinese style labels and summaries for Chinese UI language', () => {
    const styles = listStyleTemplates('zh')
    const acidLime = styleBySlug('acid-lime-3d-streetwear-type-poster-style', 'zh')
    const electricBlue = styleBySlug('electric-blue-silhouette-product-launch-style', 'zh')

    expect(styles[0]?.name).toBe('酸橙 3D 街头服饰文字海报')
    expect(acidLime?.summary).toContain('潮牌广告')
    expect(electricBlue?.name).toBe('电蓝剪影产品发布海报')
    expect(styleBySlug('missing-style', 'zh')).toBeUndefined()
  })
})
