import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import OpenDesignControls from './OpenDesignControls'
import type { OpenDesignSurface } from '../services/openDesign'
import { useSettings } from '../store/settingsStore'

function Harness({
  mode: initialMode,
  initialYouMindCategoryId = null,
}: {
  mode: OpenDesignSurface
  initialYouMindCategoryId?: string | null
}) {
  const [mode, setMode] = useState<OpenDesignSurface>(initialMode)
  const [systemId, setSystemId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [youMindCategoryId, setYouMindCategoryId] = useState<string | null>(
    initialYouMindCategoryId,
  )
  const [youMindTemplateId, setYouMindTemplateId] = useState<string | null>(null)

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  return (
    <>
      <OpenDesignControls
        mode={mode}
        systemId={systemId}
        templateId={templateId}
        youMindCategoryId={youMindCategoryId}
        youMindTemplateId={youMindTemplateId}
        onMode={setMode}
        onSystem={setSystemId}
        onTemplate={setTemplateId}
        onYouMindCategory={setYouMindCategoryId}
        onYouMindTemplate={setYouMindTemplateId}
      />
      <output data-testid="mode">{mode}</output>
      <output data-testid="system-id">{systemId ?? ''}</output>
      <output data-testid="template-id">{templateId ?? ''}</output>
      <output data-testid="youmind-category-id">{youMindCategoryId ?? ''}</output>
      <output data-testid="youmind-template-id">{youMindTemplateId ?? ''}</output>
    </>
  )
}

describe('OpenDesignControls', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    useSettings.setState({ lang: 'en' })
  })

  it('selects and clears a design system from compact controls', () => {
    render(<Harness mode="image" />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Design system' }), {
      target: { value: 'notion' },
    })

    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('notion')
    expect(screen.getByTestId('system-id')).toHaveTextContent('notion')

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByRole('combobox', { name: 'Design system' })).toHaveValue('')
    expect(screen.getByTestId('system-id')).toHaveTextContent('')
  })

  it('filters compact templates by current mode', () => {
    const { rerender } = render(<Harness mode="image" />)
    const imageTemplates = within(screen.getByRole('combobox', { name: 'Template' }))

    expect(
      imageTemplates.getByRole('option', { name: 'Notion-style Team Dashboard' }),
    ).toBeInTheDocument()
    expect(
      imageTemplates.queryByRole('option', { name: 'Minimal Product Reveal' }),
    ).not.toBeInTheDocument()

    rerender(<Harness mode="video" />)
    const videoTemplates = within(screen.getByRole('combobox', { name: 'Template' }))

    expect(
      videoTemplates.getByRole('option', { name: 'Minimal Product Reveal' }),
    ).toBeInTheDocument()
    expect(
      videoTemplates.queryByRole('option', { name: 'Notion-style Team Dashboard' }),
    ).not.toBeInTheDocument()
  })

  it('shows localized design systems and templates when language is Chinese', () => {
    useSettings.setState({ lang: 'zh' })
    render(<Harness mode="image" />)

    expect(screen.getByRole('combobox', { name: '设计系统' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('combobox', { name: '设计系统' })).getByRole('option', {
        name: '中性现代',
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('combobox', { name: '模板' })).getByRole('option', {
        name: 'Notion 风格团队仪表盘',
      }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '浏览更多' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design 素材库' })

    expect(within(dialog).getByRole('tab', { name: '设计系统' })).toBeInTheDocument()
    expect(within(dialog).getByText('Notion 风格团队仪表盘')).toBeInTheDocument()
    expect(within(dialog).getByText(/单屏 Notion 原生团队仪表盘样稿/)).toBeInTheDocument()
    expect(within(dialog).getByText('仪表盘')).toBeInTheDocument()
  })

  it('shows YouMind category and template controls', () => {
    render(<Harness mode="image" />)

    expect(screen.getByRole('combobox', { name: 'YouMind category' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'YouMind template' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('combobox', { name: 'YouMind category' })).getByRole('option', {
        name: 'Product Marketing',
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('combobox', { name: 'YouMind template' })).getByRole('option', {
        name: 'Product Marketing Launch Poster',
      }),
    ).toBeInTheDocument()
  })

  it('selects YouMind category and template from compact controls', () => {
    render(<Harness mode="image" />)

    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind category' }), {
      target: { value: 'product-marketing' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'YouMind template' }), {
      target: { value: 'youmind-product-marketing-launch-poster' },
    })

    expect(screen.getByTestId('youmind-category-id')).toHaveTextContent('product-marketing')
    expect(screen.getByTestId('youmind-template-id')).toHaveTextContent(
      'youmind-product-marketing-launch-poster',
    )
  })

  it('clears invalid YouMind category ids from parent state', () => {
    render(<Harness mode="image" initialYouMindCategoryId="unknown-youmind-category" />)

    expect(screen.getByRole('combobox', { name: 'YouMind category' })).toHaveValue('')
    expect(screen.getByTestId('youmind-category-id')).toBeEmptyDOMElement()
  })

  it('shows localized YouMind controls and drawer content', () => {
    useSettings.setState({ lang: 'zh' })
    render(<Harness mode="image" />)

    expect(screen.getByRole('combobox', { name: 'YouMind 分类' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('combobox', { name: 'YouMind 分类' })).getByRole('option', {
        name: '产品营销',
      }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '浏览更多' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design 素材库' })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'YouMind GPT Image 2' }))

    const categoryCard = within(dialog)
      .getByRole('heading', { name: '产品营销' })
      .closest('article')
    expect(categoryCard).not.toBeNull()
    expect(within(dialog).getByRole('heading', { name: '产品营销发布海报' })).toBeInTheDocument()
    expect(within(categoryCard as HTMLElement).getByRole('link', { name: '来源' })).toHaveAttribute(
      'href',
      expect.stringContaining('youmind.com'),
    )
  })

  it('uses a YouMind category from browse drawer', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'YouMind GPT Image 2' }))

    const card = within(dialog)
      .getByRole('heading', { name: 'Product Marketing' })
      .closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Use guidance' }))

    expect(screen.getByTestId('youmind-category-id')).toHaveTextContent('product-marketing')
    expect(screen.queryByRole('dialog', { name: 'Open Design Library' })).not.toBeInTheDocument()
  })

  it('switches to image mode when using a YouMind template from video mode', () => {
    render(<Harness mode="video" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'YouMind GPT Image 2' }))

    const card = within(dialog)
      .getByRole('heading', { name: 'Product Marketing Launch Poster' })
      .closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Use' }))

    expect(screen.getByTestId('mode')).toHaveTextContent('image')
    expect(screen.getByTestId('youmind-template-id')).toHaveTextContent(
      'youmind-product-marketing-launch-poster',
    )
    expect(screen.queryByRole('dialog', { name: 'Open Design Library' })).not.toBeInTheDocument()
  })

  it('exposes image and video template tabs in the browse drawer', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })

    expect(within(dialog).getByRole('tab', { name: 'Design Systems' })).toBeInTheDocument()
    expect(within(dialog).getByRole('tab', { name: 'Image Templates' })).toBeInTheDocument()
    expect(within(dialog).getByRole('tab', { name: 'Video Templates' })).toBeInTheDocument()
    expect(within(dialog).getByText('Notion-style Team Dashboard')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Video Templates' }))

    expect(within(dialog).getByText('Minimal Product Reveal')).toBeInTheDocument()
    expect(within(dialog).queryByText('Notion-style Team Dashboard')).not.toBeInTheDocument()
  })

  it('uses an item from browse drawer', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))

    const card = screen
      .getByRole('heading', { name: 'Notion-style Team Dashboard' })
      .closest('article')
    expect(card).not.toBeNull()

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Use' }))

    expect(screen.getByTestId('template-id')).toHaveTextContent(
      'notion-team-dashboard-live-artifact',
    )
    expect(screen.queryByRole('dialog', { name: 'Open Design Library' })).not.toBeInTheDocument()
  })

  it('switches mode when using a template from another drawer tab', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Video Templates' }))

    const card = screen.getByRole('heading', { name: 'Minimal Product Reveal' }).closest('article')
    expect(card).not.toBeNull()
    expect(
      within(card as HTMLElement).getByRole('link', { name: 'Preview video' }),
    ).toHaveAttribute('href', expect.stringContaining('.mp4'))

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Use' }))

    expect(screen.getByTestId('mode')).toHaveTextContent('video')
    expect(screen.getByTestId('template-id')).toHaveTextContent(
      'hyperframes-product-reveal-minimal',
    )
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue(
      'hyperframes-product-reveal-minimal',
    )
    expect(screen.queryByRole('dialog', { name: 'Open Design Library' })).not.toBeInTheDocument()
  })

  it('closes on backdrop click but not on drawer panel click', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })
    const backdrop = dialog.parentElement
    expect(backdrop).not.toBeNull()

    fireEvent.click(dialog)
    expect(screen.getByRole('dialog', { name: 'Open Design Library' })).toBeInTheDocument()

    fireEvent.click(backdrop as HTMLElement)
    expect(screen.queryByRole('dialog', { name: 'Open Design Library' })).not.toBeInTheDocument()
  })

  it('focuses the drawer and closes it with Escape', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })
    const closeButton = within(dialog).getByRole('button', { name: 'Cancel' })

    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Open Design Library' })).not.toBeInTheDocument()
  })

  it('keeps Tab navigation inside the drawer', () => {
    render(<Harness mode="image" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    const dialog = screen.getByRole('dialog', { name: 'Open Design Library' })
    const closeButton = within(dialog).getByRole('button', { name: 'Cancel' })
    const useButtons = within(dialog).getAllByRole('button', { name: 'Use' })

    useButtons[useButtons.length - 1].focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })

    expect(closeButton).toHaveFocus()
  })
})
