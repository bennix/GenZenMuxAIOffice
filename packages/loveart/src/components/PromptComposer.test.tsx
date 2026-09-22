import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PromptComposer from './PromptComposer'
import type { Composed } from './PromptComposer'
import { useSettings } from '../store/settingsStore'
import { useCanvas } from '../store/canvasStore'
import { createDefaultHumanScene } from '../services/humanScene'

const openDesignControlsMock = vi.hoisted(() => ({
  useTestDouble: false,
}))

vi.mock('./OpenDesignControls', async (importOriginal) => {
  const React = await import('react')
  const actual = await importOriginal<typeof import('./OpenDesignControls')>()

  return {
    default: (props: any) => {
      if (!openDesignControlsMock.useTestDouble) {
        return React.createElement(actual.default, props)
      }

      return React.createElement(
        'div',
        { 'data-testid': 'open-design-test-double' },
        React.createElement(
          'label',
          null,
          'YouMind category',
          React.createElement(
            'select',
            {
              'aria-label': 'YouMind category',
              value: props.youMindCategoryId ?? '',
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                props.onYouMindCategory?.(event.target.value || null),
            },
            React.createElement('option', { value: '' }, 'None'),
            React.createElement('option', { value: 'product-marketing' }, 'Campaign'),
          ),
        ),
        React.createElement(
          'label',
          null,
          'YouMind template',
          React.createElement(
            'select',
            {
              'aria-label': 'YouMind template',
              value: props.youMindTemplateId ?? '',
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                props.onYouMindTemplate?.(event.target.value || null),
            },
            React.createElement('option', { value: '' }, 'None'),
            React.createElement(
              'option',
              { value: 'youmind-product-marketing-launch-poster' },
              'Launch Poster',
            ),
          ),
        ),
      )
    },
  }
})

function Harness({
  onSubmit = vi.fn(),
  projectId,
  showImageWizard = false,
}: {
  onSubmit?: (composed: Composed) => void
  projectId?: string
  showImageWizard?: boolean
}) {
  const [text, setText] = useState('')

  return (
    <PromptComposer
      projectId={projectId}
      showImageWizard={showImageWizard}
      text={text}
      onText={setText}
      apiKey="test-key"
      busy={false}
      placeholder="Describe the asset"
      submitLabel="Create"
      onSubmit={onSubmit}
    />
  )
}

describe('PromptComposer Open Design integration', () => {
  it('applies a wizard prompt and model to the actual home submission and clears design context', async () => {
    const originalModels = useSettings.getState().models
    useSettings.setState({
      models: [
        { id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true },
        { id: 'openai/gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', category: 'image' },
      ],
    })
    const onSubmit = vi.fn()
    render(<Harness showImageWizard onSubmit={onSubmit} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Design system' }), {
      target: { value: 'notion' },
    })
    fireEvent.click(screen.getByRole('button', { name: /GPT-Image 2 提示词向导/ }))
    fireEvent.click(await screen.findByRole('button', { name: /填写需求/ }))
    fireEvent.change(screen.getByLabelText('主体与用途（必填）'), {
      target: { value: '咖啡 App 界面' },
    })
    fireEvent.click(screen.getByRole('button', { name: /预览提示词/ }))
    fireEvent.change(screen.getByLabelText('生成模型'), {
      target: { value: 'openai/gpt-image-2.5-sunburst' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用到主页' }))
    expect(
      (screen.getByPlaceholderText('Describe the asset') as HTMLTextAreaElement).value,
    ).toContain('咖啡 App 界面')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-image-2.5-sunburst',
        text: expect.stringContaining('咖啡 App 界面'),
        openDesignSystemId: null,
        openDesignTemplateId: null,
        youMindTemplateId: null,
        styleSlug: null,
      }),
    )
    cleanup()
    useSettings.setState({ models: originalModels })
  })
  afterEach(() => {
    openDesignControlsMock.useTestDouble = false
    cleanup()
  })

  beforeEach(() => {
    useSettings.setState({ lang: 'en' })
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  })

  it('renders Open Design controls', () => {
    render(<Harness />)

    expect(screen.getByRole('combobox', { name: 'Design system' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Template' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse more' })).toBeInTheDocument()
  })

  it('submits Seedance 2.5 controls and corrects stale settings after switching to Veo', () => {
    const onSubmit = vi.fn()
    const originalModels = useSettings.getState().models
    useSettings.getState().setDefault('bytedance/doubao-seedance-2.5')
    render(<Harness onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    fireEvent.click(screen.getByRole('button', { name: '21:9' }))
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Video resolution'), { target: { value: '720p' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Audio' }))
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Long shot' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        videoAspect: '21:9',
        duration: 30,
        resolution: '720p',
        generateAudio: false,
        model: 'bytedance/doubao-seedance-2.5',
      }),
    )
    fireEvent.change(screen.getByTitle('video model'), {
      target: { value: 'google/veo-3.1-generate-001' },
    })
    expect(screen.queryByRole('button', { name: '21:9' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Length')).toHaveValue('8')
    cleanup()
    useSettings.setState({ models: originalModels })
  })

  it('switches photography effects without losing the brief and submits the visible prompt', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText('Describe the asset')
    fireEvent.change(input, { target: { value: 'A mountain lake at dawn' } })
    const picker = screen.getByRole('combobox', { name: 'Photo enhancements' })
    expect(within(picker).getAllByRole('option')).toHaveLength(8)
    fireEvent.change(picker, { target: { value: 'film' } })
    expect((input as HTMLTextAreaElement).value).toContain('1970s 35mm')
    fireEvent.change(picker, { target: { value: 'landscape' } })
    const prompt = (input as HTMLTextAreaElement).value
    expect(prompt).toContain('A mountain lake at dawn')
    expect(prompt).toContain('rock textures')
    expect(prompt).not.toContain('1970s 35mm')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ text: prompt, mode: 'image', styleSlug: null }),
    )
    expect(input).toHaveValue('')
    expect(picker).toHaveValue('')
  })

  it('removes only the photography block and hides the entry in video mode', () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe the asset')
    fireEvent.change(input, { target: { value: 'A studio portrait' } })
    const picker = screen.getByRole('combobox', { name: 'Photo enhancements' })
    fireEvent.change(picker, { target: { value: 'portrait' } })
    fireEvent.change(picker, { target: { value: '' } })
    expect(input).toHaveValue('A studio portrait')
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    expect(screen.queryByRole('combobox', { name: 'Photo enhancements' })).not.toBeInTheDocument()
  })

  it('localizes style names and exposes a selected-style explanation', () => {
    useSettings.setState({ lang: 'zh' })
    render(<Harness />)

    const styleSelect = screen.getByRole('combobox', { name: '风格' })
    expect(
      within(styleSelect).getByRole('option', { name: '🎨 酸橙 3D 街头服饰文字海报' }),
    ).toBeInTheDocument()
    expect(
      within(styleSelect).getByRole('option', { name: '🎨 电蓝剪影产品发布海报' }),
    ).toBeInTheDocument()

    fireEvent.change(styleSelect, {
      target: { value: 'style:acid-lime-3d-streetwear-type-poster-style' },
    })

    expect(screen.getByRole('button', { name: '风格说明' })).toBeInTheDocument()
    expect(screen.getByText(/偏潮牌广告的 3D 海报风格/)).toBeInTheDocument()
  })

  it('merges YouMind templates into the style picker and fills the visible prompt', () => {
    useSettings.setState({ lang: 'zh' })
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    const prompt = screen.getByPlaceholderText('Describe the asset')
    fireEvent.change(prompt, {
      target: { value: '一款给设计师使用的模块化台灯' },
    })

    const styleSelect = screen.getByRole('combobox', { name: '风格' })
    expect(
      within(styleSelect).getByRole('option', { name: '🧠 产品营销发布海报' }),
    ).toBeInTheDocument()

    fireEvent.change(styleSelect, {
      target: { value: 'youmind:youmind-product-marketing-launch-poster' },
    })

    const filledPrompt = (prompt as HTMLTextAreaElement).value
    expect(filledPrompt).toContain('YouMind GPT Image 2 模板: 产品营销发布海报')
    expect(filledPrompt).toContain('用户需求: 一款给设计师使用的模块化台灯')
    expect(filledPrompt).toContain('分类指引: 使用场景: 产品营销')
    expect(filledPrompt).toContain('模板提示词: 创建一张 16:9 GPT Image 2')
    expect(styleSelect).toHaveValue('youmind:youmind-product-marketing-launch-poster')

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        styleSlug: null,
        youMindCategoryId: 'product-marketing',
        youMindTemplateId: 'youmind-product-marketing-launch-poster',
      }),
    )
  })

  it('only revokes removed reference previews and keeps remaining previews alive', () => {
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    let urlIndex = 0
    const createObjectURL = vi.fn(() => `blob:test-${++urlIndex}`)
    const revokeObjectURL = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })

    try {
      const { container, unmount } = render(<Harness />)
      const prompt = screen.getByPlaceholderText('Describe the asset')
      const files = [
        new File(['first'], 'first.png', { type: 'image/png' }),
        new File(['second'], 'second.png', { type: 'image/png' }),
      ]

      fireEvent.paste(prompt, {
        clipboardData: {
          items: files.map((file) => ({
            type: file.type,
            getAsFile: () => file,
          })),
        },
      })

      expect(createObjectURL).toHaveBeenCalledTimes(2)
      expect(container.querySelectorAll('img')).toHaveLength(2)

      fireEvent.click(screen.getAllByRole('button', { name: 'Remove reference' })[0])

      expect(revokeObjectURL).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
      expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:test-2')
      expect(container.querySelectorAll('img')).toHaveLength(1)

      unmount()

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-2')
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      })
    }
  })

  it('links Open Design systems and templates in both directions', () => {
    render(<Harness />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Design system' }), {
      target: { value: 'notion' },
    })
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue(
      'notion-team-dashboard-live-artifact',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Design system' }), {
      target: { value: '' },
    })
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue('')

    fireEvent.change(screen.getByRole('combobox', { name: 'Template' }), {
      target: { value: 'notion-team-dashboard-live-artifact' },
    })
    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('notion')
  })

  it('fills the visible prompt when Open Design system or template is selected', () => {
    useSettings.setState({ lang: 'zh' })
    render(<Harness />)

    const prompt = screen.getByPlaceholderText('Describe the asset')
    fireEvent.change(prompt, {
      target: { value: '一个给创作者管理项目的仪表盘' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '设计系统' }), {
      target: { value: 'notion' },
    })

    let filledPrompt = (prompt as HTMLTextAreaElement).value
    expect(filledPrompt).toContain('Open Design 模板: Notion 风格团队仪表盘')
    expect(filledPrompt).toContain('用户需求: 一个给创作者管理项目的仪表盘')
    expect(filledPrompt).toContain(
      '模板提示词: 为 一个给创作者管理项目的仪表盘 创建一张 Notion 原生团队仪表盘样稿',
    )
    expect(filledPrompt).toContain('Open Design 设计系统: Notion')
    expect(filledPrompt).toContain('设计系统规则: 带有空白画布感的温暖极简')

    fireEvent.change(screen.getByRole('combobox', { name: '模板' }), {
      target: { value: 'vr-headset-exploded-view-poster' },
    })

    filledPrompt = (prompt as HTMLTextAreaElement).value
    expect(filledPrompt).toContain('Open Design 模板: VR 头显爆炸图海报')
    expect(filledPrompt).toContain('用户需求: 一个给创作者管理项目的仪表盘')
    expect(screen.getByRole('combobox', { name: '设计系统' })).toHaveValue('default')
  })

  it('keeps Open Design and YouMind groups mutually exclusive', () => {
    render(<Harness />)

    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind category' }), {
      target: { value: 'text-typography' },
    })
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue(
      'youmind-typography-quote-poster',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Design system' }), {
      target: { value: 'notion' },
    })
    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('notion')
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue(
      'notion-team-dashboard-live-artifact',
    )
    expect(screen.getByRole('combobox', { name: 'YouMind category' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveValue('')

    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind template' }), {
      target: { value: 'youmind-product-benefit-breakdown-ad' },
    })
    expect(screen.getByRole('combobox', { name: 'YouMind category' })).toHaveValue(
      'product-marketing',
    )
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue(
      'youmind-product-benefit-breakdown-ad',
    )
    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue('')
  })

  it('submits selected Open Design ids and clears only the prompt-scoped template', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Design system' }), {
      target: { value: 'notion' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Template' }), {
      target: { value: 'notion-team-dashboard-live-artifact' },
    })
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Roadmap dashboard for launch planning' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Roadmap dashboard for launch planning',
        mode: 'image',
        openDesignSystemId: 'notion',
        openDesignTemplateId: 'notion-team-dashboard-live-artifact',
      }),
    )
    expect(screen.getByPlaceholderText('Describe the asset')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('notion')
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue('')
  })

  it('selects the matching YouMind template and fills the prompt when a category is chosen', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    const prompt = screen.getByPlaceholderText('Describe the asset')
    fireEvent.change(prompt, {
      target: { value: 'Modular desk lamp for designers' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind category' }), {
      target: { value: 'text-typography' },
    })

    expect(screen.getByRole('combobox', { name: 'YouMind category' })).toHaveValue(
      'text-typography',
    )
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue(
      'youmind-typography-quote-poster',
    )
    const filledPrompt = (prompt as HTMLTextAreaElement).value
    expect(filledPrompt).toContain('YouMind GPT Image 2 template: Typography Quote Poster')
    expect(filledPrompt).toContain('User brief: Modular desk lamp for designers')
    expect(filledPrompt).toContain('Category guidance: Use case: typography')
  })

  it('submits selected YouMind ids and clears only the prompt-scoped YouMind template', () => {
    openDesignControlsMock.useTestDouble = true
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind category' }), {
      target: { value: 'product-marketing' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind template' }), {
      target: { value: 'youmind-product-marketing-launch-poster' },
    })
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Campaign concept board' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Campaign concept board',
        mode: 'image',
        youMindCategoryId: 'product-marketing',
        youMindTemplateId: 'youmind-product-marketing-launch-poster',
      }),
    )
    expect(screen.getByPlaceholderText('Describe the asset')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'YouMind category' })).toHaveValue(
      'product-marketing',
    )
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue('')
  })

  it('clears selected YouMind image template when switching to video', () => {
    openDesignControlsMock.useTestDouble = true
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind template' }), {
      target: { value: 'youmind-product-marketing-launch-poster' },
    })
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue(
      'youmind-product-marketing-launch-poster',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toHaveValue('')

    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Product launch teaser' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'video',
        youMindTemplateId: null,
      }),
    )
  })

  it('switches Open Design template to the current mode while keeping linked system context', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Template' }), {
      target: { value: 'notion-team-dashboard-live-artifact' },
    })
    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('notion')

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    const templateSelect = screen.getByRole('combobox', { name: 'Template' })
    expect(templateSelect).toHaveValue('hyperframes-product-reveal-minimal')
    expect(
      within(templateSelect).getByRole('option', { name: 'Minimal Product Reveal' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Product launch teaser' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'video',
        openDesignSystemId: 'notion',
        openDesignTemplateId: 'hyperframes-product-reveal-minimal',
      }),
    )
  })

  it('shows Human Scene picker only for video mode when a project id is available', () => {
    render(<Harness projectId="project-1" />)

    expect(screen.queryByRole('combobox', { name: 'Human Scene' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    expect(screen.getByRole('combobox', { name: 'Human Scene' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New human scene' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Image' }))

    expect(screen.queryByRole('combobox', { name: 'Human Scene' })).not.toBeInTheDocument()
  })

  it('shows a draft Human Scene picker in video mode without a project id', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    expect(screen.getByRole('combobox', { name: 'Human Scene' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New human scene' }))
    fireEvent.click(screen.getByLabelText('Use sketch reference'))
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Create a lobby walkthrough' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'video',
        humanSceneId: expect.stringMatching(/^draft-human-scene-/),
        humanSceneDraft: expect.objectContaining({
          name: 'Human Scene 1',
          people: [expect.objectContaining({ label: 'Person A' })],
        }),
        useHumanSceneReference: true,
      }),
    )
    expect(useCanvas.getState().humanScenes).toEqual([])
  })

  it('submits selected Human Scene ids for video and clears them when switching to image', () => {
    const onSubmit = vi.fn()
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })

    render(<Harness projectId="project-1" onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Human Scene' }), {
      target: { value: sceneId },
    })
    fireEvent.click(screen.getByLabelText('Use sketch reference'))
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Create a lobby walkthrough' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'video',
        humanSceneId: sceneId,
        useHumanSceneReference: true,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Create a lobby poster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'image',
        humanSceneId: null,
        useHumanSceneReference: false,
      }),
    )
  })

  it('clears selected Human Scene state when the project id changes', () => {
    const onSubmit = vi.fn()
    const sceneId = useCanvas.getState().addHumanScene({
      ...createDefaultHumanScene('project-1', 'Lobby blocking', '16:9'),
      projectId: 'project-1',
    })
    const { rerender } = render(<Harness projectId="project-1" onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Human Scene' }), {
      target: { value: sceneId },
    })
    fireEvent.click(screen.getByLabelText('Use sketch reference'))
    fireEvent.change(screen.getByPlaceholderText('Describe the asset'), {
      target: { value: 'Create a lobby walkthrough' },
    })

    rerender(<Harness projectId="project-2" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'video',
        humanSceneId: null,
        useHumanSceneReference: false,
      }),
    )
  })
})
