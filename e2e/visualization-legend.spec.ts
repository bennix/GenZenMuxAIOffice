import { test, expect, chromium } from '@playwright/test'
import { build } from 'esbuild'

test('legend layout follows resizing without resetting zoom or legend selection', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
        const names = ['北京','上海','广州','成都','武汉','杭州','西安','哈尔滨'].flatMap(city => [city+' 最高(℃)', city+' 最低(℃)']);
        window.names = names;
        window.mounted = mountInteractiveChart(document.getElementById('chart'), {
          chartId:'line', x:'日期', y:names,
          table:{columns:['日期', ...names], rows:Array.from({length:16}, (_,i)=>['2026-09-'+String(i+1).padStart(2,'0'), ...names.map((_,j)=>15+j+i%3)])}
        });`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 650 } })
    await page.setContent(
      '<body style="margin:0"><div id="chart" style="width:1400px;height:600px"></div></body>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    await page.evaluate(() => {
      const { chart } = (window as any).mounted
      chart.dispatchAction({ type: 'legendUnSelect', name: (window as any).names[0] })
      chart.dispatchAction({ type: 'dataZoom', start: 20, end: 80 })
    })
    for (const width of [480, 960, 1400]) {
      await page.evaluate((width) => {
        document.getElementById('chart')!.style.width = `${width}px`
      }, width)
      await expect
        .poll(() => page.evaluate(() => (window as any).mounted.chart.getWidth()))
        .toBe(width)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const boxes = [...document.querySelectorAll('svg text')].map((node) => ({
              text: node.textContent!,
              box: node.getBoundingClientRect(),
            }))
            const keys = boxes.filter(({ text }) => (window as any).names.includes(text))
            const axes = boxes.filter(({ text }) => text.startsWith('2026-'))
            return (
              keys.length === 16 &&
              axes.length > 0 &&
              Math.min(...keys.map(({ box }) => box.top)) >
                Math.max(...axes.map(({ box }) => box.bottom)) + 10
            )
          }),
        )
        .toBe(true)
      const state = await page.evaluate(() => {
        const option = (window as any).mounted.chart.getOption()
        return {
          selected: option.legend[0].selected[(window as any).names[0]],
          start: option.dataZoom[0].start,
          end: option.dataZoom[0].end,
        }
      })
      expect(state).toEqual({ selected: false, start: 20, end: 80 })
    }
    await page.screenshot({ path: '/tmp/zenoffice-legend-layout.png' })
  } finally {
    await browser.close()
  }
})
