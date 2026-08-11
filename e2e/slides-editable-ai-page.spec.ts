import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

async function findShellPage(app: ElectronApplication, timeoutMs = 15_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const candidate of app.windows()) {
      const has = await candidate
        .evaluate(() => Boolean((window as unknown as { aiOffice?: unknown }).aiOffice))
        .catch(() => false)
      if (has) return candidate
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('No window exposing window.aiOffice')
    await app.waitForEvent('window', { timeout: Math.min(remaining, 1_000) }).catch(() => {})
  }
}

test('AI HTML page lands as separate editable PowerPoint objects', async () => {
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'slides-editable-ai-page' })
  try {
    const shellPage = await findShellPage(launched.app)
    await shellPage.locator('.quick-card', { hasText: 'AI Slides' }).click()
    const editorPage = await waitForPageWithUrl(launched.app, 'slides/out')
    await editorPage.waitForFunction(() => Boolean(window.slidesApi?.htmlToPptx))

    const html = `<!doctype html><html><head><style>
      body { margin:0; width:1280px; height:720px; overflow:hidden; background:#f5f7fb; }
      .card { position:absolute; left:70px; top:80px; width:1140px; height:560px; background:#fff; border:2px solid #dbe3ef; border-radius:24px; }
      h1 { position:absolute; left:120px; top:130px; width:900px; height:90px; margin:0; font:700 52px Arial; color:#112233; }
      p { position:absolute; left:120px; top:260px; width:820px; height:160px; margin:0; font:24px Arial; color:#334455; }
    </style></head><body>
      <div class="card" data-pptx-kind="shape"></div>
      <h1 data-pptx-kind="text">Editable AI title</h1>
      <p data-pptx-kind="text">Every paragraph remains a separate PowerPoint text box.</p>
    </body></html>`

    const result = await editorPage.evaluate(
      (pageHtml) =>
        window.slidesApi.htmlToPptx([pageHtml], 960, 'replace', undefined, 'Editable AI Test'),
      html,
    )
    expect(result).toHaveProperty('slides')
    const slides = await editorPage.evaluate(() => window.slidesApi.getRenderSlides())
    expect(slides).toHaveLength(1)
    expect(slides![0]!.nodes.filter((element) => element.type === 'picture')).toHaveLength(0)
    expect(
      slides![0]!.nodes.filter((element) => element.type === 'text' || element.type === 'shape')
        .length,
    ).toBeGreaterThanOrEqual(3)
  } finally {
    await closeAndSaveVideo(launched, 'slides-editable-ai-page')
  }
})
