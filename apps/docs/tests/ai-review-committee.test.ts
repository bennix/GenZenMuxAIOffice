import { describe, expect, it } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import {
  REVIEW_PROFILES,
  assignReviewModels,
  availableReviewModels,
  reviewerSystemPrompt,
  settingsForReviewModel,
} from '@genoffice/ai-provider'
import type { Editor } from '@tiptap/core'
import { collectReviewDocumentMaterial } from '../src/renderer/ai-review-committee'

describe('AI review committee', () => {
  it('provides a distinct committee with at least three members for every requested venue', () => {
    expect(REVIEW_PROFILES.map((profile) => profile.id)).toEqual(
      expect.arrayContaining([
        'science',
        'nature',
        'cell',
        'elsevier',
        'ieee-top-journal',
        'ieee-top-conference',
        'ieee-conference',
        'nsfc',
        '863',
        'technology-proposal',
        'commercial-bid',
      ]),
    )
    expect(REVIEW_PROFILES.every((profile) => profile.members.length >= 3)).toBe(true)
  })

  it('randomizes configured ZenMux models and repeats only when necessary', () => {
    expect(assignReviewModels(['a', 'b', 'c'], 3, () => 0)).toEqual(['b', 'c', 'a'])
    expect(new Set(assignReviewModels(['a', 'b', 'c'], 3, () => 0.5)).size).toBe(3)
    expect(assignReviewModels(['a'], 3, () => 0.5)).toEqual(['a', 'a', 'a'])
  })

  it('includes custom models and forces every member request through ZenMux', () => {
    const settings = defaultAiSettings()
    settings.providers.zenmux.apiKey = 'secret'
    settings.providers.zenmux.models = ['vendor/custom-reviewer']
    const models = availableReviewModels(settings)
    expect(models).toContain('vendor/custom-reviewer')
    const assigned = settingsForReviewModel(settings, 'vendor/custom-reviewer')
    expect(assigned.provider).toBe('zenmux')
    expect(assigned.providers.zenmux.model).toBe('vendor/custom-reviewer')
  })

  it('builds strict language-specific reviewer instructions', () => {
    const prompt = reviewerSystemPrompt(REVIEW_PROFILES[0]!, REVIEW_PROFILES[0]!.members[0]!, 'zh')
    expect(prompt).toContain('strict Science-level Journal')
    expect(prompt).toContain('Simplified Chinese')
    expect(prompt).toContain('Do not invent')
  })

  it('supports every General language in review reports', () => {
    const prompt = reviewerSystemPrompt(REVIEW_PROFILES[0]!, REVIEW_PROFILES[0]!.members[0]!, 'ja')
    expect(prompt).toContain('Write entirely in Japanese')
  })

  it('provides level-specific Chinese and English composition assessment panels', () => {
    const composition = REVIEW_PROFILES.filter((profile) => profile.category === 'composition')
    expect(composition.map((profile) => profile.id)).toEqual(
      expect.arrayContaining([
        'zhongkao-composition',
        'gaokao-composition',
        'chinese-competition-composition',
        'university-chinese-composition',
        'middle-school-english-composition',
        'high-school-english-composition',
        'cet4-writing',
        'cet6-writing',
        'toefl-writing',
        'ielts-writing',
        'gre-writing',
      ]),
    )
    expect(composition.every((profile) => profile.members.length === 3)).toBe(true)
    expect(reviewerSystemPrompt(composition[0]!, composition[0]!.members[0]!, 'zh')).toContain(
      'writing assessment panel',
    )
  })

  it('assigns live literature verification only to the academic novelty reviewer', () => {
    const science = REVIEW_PROFILES.find((profile) => profile.id === 'science')!
    expect(science.category).toBe('academic')
    expect(science.members.filter((member) => member.literatureReviewer)).toHaveLength(1)
    expect(reviewerSystemPrompt(science, science.members[0]!, 'en')).toContain(
      'LIVE SCHOLARLY METADATA EVIDENCE',
    )
  })

  it('collects equations and deduplicated visual evidence for multimodal review', () => {
    const dataUrl = 'data:image/png;base64,QUJD'
    const editor = {
      getJSON: () => ({
        type: 'doc',
        content: [
          { type: 'docInlineMath', attrs: { latex: 'E=mc^2' } },
          {
            type: 'docProtected',
            attrs: { blockType: 'chart', label: 'Figure 1', imageDataUrl: dataUrl },
          },
          { type: 'docInlineImage', attrs: { dataUrl } },
        ],
      }),
    } as unknown as Editor

    const material = collectReviewDocumentMaterial(editor)
    expect(material.objectCatalog).toContain('E=mc^2')
    expect(material.objectCatalog).toContain('Figure 1')
    expect(material.images).toEqual([{ mime: 'image/png', base64: 'QUJD' }])
    expect(material.omittedImageCount).toBe(0)
  })

  it('reports visual evidence omitted by attachment limits', () => {
    const editor = {
      getJSON: () => ({
        type: 'doc',
        content: [
          { type: 'docInlineImage', attrs: { dataUrl: 'data:image/png;base64,QUJD' } },
          { type: 'docInlineImage', attrs: { dataUrl: 'data:image/jpeg;base64,REVG' } },
        ],
      }),
    } as unknown as Editor

    const material = collectReviewDocumentMaterial(editor, 1)
    expect(material.images).toHaveLength(1)
    expect(material.omittedImageCount).toBe(1)
  })
})
