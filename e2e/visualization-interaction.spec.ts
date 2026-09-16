import { test, expect, chromium } from '@playwright/test'
import { build } from 'esbuild'

test('contour lines display the actual level on hover and preserve grid coordinates', async () => {
  const bundle=await build({stdin:{contents:`import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
    window.mounted=mountInteractiveChart(document.getElementById('chart'),{chartId:'contour',title:'地形等高线',x:'X',y:['Y','高度'],
    table:{columns:['X','Y','高度'],rows:Array.from({length:21},(_,i)=>i/5-2).flatMap(x=>Array.from({length:21},(_,j)=>j/5-2).map(y=>[x,y,4-x*x-y*y]))}});`,resolveDir:process.cwd()},bundle:true,format:'iife',write:false})
  const browser=await chromium.launch({channel:'chrome',headless:true})
  try {
    const page=await browser.newPage({viewport:{width:960,height:600}})
    await page.setContent('<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>')
    await page.addScriptTag({content:bundle.outputFiles[0]!.text})
    const target=await page.evaluate(()=>{
      const chart=(window as any).mounted.chart,series=chart.getOption().series[3],line=series.data[10]
      return {point:chart.convertToPixel({seriesIndex:3},[(line[0]+line[2])/2,(line[1]+line[3])/2]),level:line[4]}
    })
    await page.mouse.move(target.point[0],target.point[1])
    await expect(page.getByText(`高度等值：${target.level}`,{exact:true})).toBeVisible()
    await page.mouse.move(0,0)
    await page.evaluate(()=>(window as any).mounted.chart.dispatchAction({type:'hideTip'}))
    await page.screenshot({path:'/tmp/zenoffice-contour.png'})
  } finally {await browser.close()}
})

test('circle packing preserves hierarchy and displays leaf details on hover', async () => {
  const bundle = await build({ stdin: { contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
    window.mounted=mountInteractiveChart(document.getElementById('chart'),{chartId:'circle-packing',title:'产品收入构成',x:'节点',parent:'父节点',y:['收入'],
      table:{columns:['节点','父节点','收入'],rows:[['总计',null,null],['产品组','总计',null],['服务','总计',15],['产品甲','产品组',20],['产品乙','产品组',5],['零收入','总计',0]]}});`, resolveDir: process.cwd() },
    bundle: true, format: 'iife', write: false })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({viewport:{width:960,height:600}})
    await page.setContent('<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>')
    await page.addScriptTag({content:bundle.outputFiles[0]!.text})
    await expect(page.getByText('产品甲', {exact:true})).toBeVisible()
    const layout = await page.evaluate(() => {
      const data = (window as any).mounted.chart.getModel().getSeriesByIndex(0).getData()
      return ['总计 / 产品组 / 产品甲', '总计 / 产品组 / 产品乙', '总计 / 服务'].map((name) => {
        const index = data.indexOfName(name)
        const circle = data.getItemGraphicEl(index).childAt(0).shape
        const label = name.split(' / ').at(-1)!
        const node = [...document.querySelectorAll('svg text')].find((node) => node.textContent === label)!
        const box = node.getBoundingClientRect()
        return {circle, box:{x:box.x,y:box.y,width:box.width,height:box.height}}
      })
    })
    for (const {circle, box} of layout) for (const x of [box.x,box.x+box.width]) for (const y of [box.y,box.y+box.height])
      expect(Math.hypot(x-circle.cx,y-circle.cy)).toBeLessThan(circle.r)
    await page.getByText('产品甲', {exact:true}).hover()
    await expect(page.getByText('总计 / 产品组 / 产品甲', {exact:true})).toBeVisible()
    await expect(page.getByText('叶子权重：20', {exact:true})).toBeVisible()
    await page.mouse.move(0,0)
    await page.evaluate(() => (window as any).mounted.chart.dispatchAction({type:'hideTip'}))
    await page.screenshot({path:'/tmp/zenoffice-circle-packing.png'})
  } finally { await browser.close() }
})

test('horizon folds signed bands and hover reports the original value', async () => {
  const bundle = await build({ stdin: { contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
    window.mounted=mountInteractiveChart(document.getElementById('chart'),{chartId:'horizon',title:'季度盈亏趋势',x:'时间',y:['甲公司','乙公司'],
    table:{columns:['时间','甲公司','乙公司'],rows:[[0,-3,2],[1,-1,1],[2,0,0],[3,2,-2],[4,3,-3],[5,1,2],[6,null,1],[7,2,0],[8,-1,-2]]}});`, resolveDir: process.cwd() },
    bundle: true, format: 'iife', write: false })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    await page.setContent('<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>')
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    await expect(page.getByText('正 2–3', { exact: true })).toBeVisible()
    await expect(page.getByText('负 2–3', { exact: true })).toBeVisible()
    const point = await page.evaluate(() => (window as any).mounted.chart.convertToPixel({seriesIndex:0}, [0,0.5]))
    await page.mouse.move(point[0] + 1, point[1])
    await expect(page.getByText('甲公司：-3', { exact: true })).toBeVisible()
    const zoom = await page.evaluate(() => {
      const chart = (window as any).mounted.chart
      chart.dispatchAction({type:'dataZoom',start:25,end:75})
      return chart.getOption().dataZoom.map((item: any) => ({start:item.start,end:item.end,xAxisIndex:item.xAxisIndex}))
    })
    expect(zoom[0]).toEqual({start:25,end:75,xAxisIndex:[0,1]})
    await page.evaluate(() => (window as any).mounted.chart.dispatchAction({type:'restore'}))
    await page.mouse.move(0,0)
    await page.evaluate(() => (window as any).mounted.chart.dispatchAction({type:'hideTip'}))
    await page.screenshot({ path: '/tmp/zenoffice-horizon.png' })
  } finally { await browser.close() }
})

test('hexbin hover reports duplicate counts and resize preserves bins', async () => {
  const bundle = await build({ stdin: { contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
    import {buildChartOption} from './packages/visualization/src/render.ts';
    window.drawDense=()=>window.mounted.chart.setOption(buildChartOption({chartId:'hexbin',title:'密集观测分箱',x:'长度',y:['重量'],
      table:{columns:['长度','重量'],rows:Array.from({length:10000},(_,i)=>[(i*71%1000)/10-50,(i*193%997)/20-25])}}),true);
    window.mounted=mountInteractiveChart(document.getElementById('chart'), {chartId:'hexbin',title:'六边形分箱',x:'长度',y:['重量'],
      table:{columns:['长度','重量'],rows:[[0,0],[0,0],[0,0],[10,10],[5,3],[5,3],[4,8]]}});`, resolveDir: process.cwd() },
    bundle: true, format: 'iife', write: false })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    await page.setContent('<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>')
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    const counts = await page.evaluate(() => (window as any).mounted.chart.getOption().series[0].data.map((p: number[]) => p[2]))
    expect(counts.reduce((sum: number, n: number) => sum + n, 0)).toBe(7)
    const point = await page.evaluate(() => (window as any).mounted.chart.convertToPixel({seriesIndex:0}, [0,0]))
    await page.mouse.move(point[0], point[1])
    await expect(page.getByText('观测数', { exact: true }).last()).toBeVisible()
    await expect(page.getByText('3', { exact: true })).toHaveCount(2)
    await expect(page.getByText('3', { exact: true }).last()).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({ path: '/tmp/zenoffice-hexbin.png' })
    await page.evaluate(() => { const mounted = (window as any).mounted; mounted.chart.resize({ width: 800, height: 500 }) })
    expect(await page.evaluate(() => (window as any).mounted.chart.getOption().series[0].data.map((p: number[]) => p[2]))).toEqual(counts)
    await page.evaluate(() => { (window as any).mounted.chart.resize({ width: 960, height: 600 }); (window as any).drawDense() })
    expect(await page.evaluate(() => (window as any).mounted.chart.getOption().series[0].data.reduce((sum: number, p: number[]) => sum + p[2], 0))).toBe(10000)
    await page.screenshot({ path: '/tmp/zenoffice-hexbin-dense.png' })
  } finally { await browser.close() }
})

test('dendrogram hover reports the computed merge distance and sample count', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
      window.mounted=mountInteractiveChart(document.getElementById('chart'),{chartId:'dendrogram',x:'name',y:['value'],table:{columns:['name','value'],rows:[['A',0],['B',2],['C',10]]}});`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    await page.setContent(
      '<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    const point = await page.evaluate(() =>
      (window as any).mounted.chart
        .getModel()
        .getSeriesByIndex(0)
        .coordinateSystem.dataToPoint([0.5, 6]),
    )
    await page.mouse.move(point[0], point[1])
    await expect(page.getByText('样本数', { exact: true })).toBeVisible()
    await expect(page.getByText('3', { exact: true })).toBeVisible()
  } finally {
    await browser.close()
  }
})

test('word cloud renders every term without actual browser text overlap and reports frequency', async () => {
  const terms = Array.from({ length: 40 }, (_, i) => `词语${i}`)
  const bundle = await build({
    stdin: {
      contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
      mountInteractiveChart(document.getElementById('chart'), {chartId:'word-cloud',x:'词语',y:['频次'],
      table:{columns:['词语','频次'],rows:${JSON.stringify(terms.map((term, i) => [term, i + 1]))}}});`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    await page.setContent(
      '<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    const boxes = await page.locator('svg text').evaluateAll(
      (nodes, terms) =>
        nodes
          .filter((node) => terms.includes(node.textContent ?? ''))
          .map((node) => {
            const box = node.getBoundingClientRect()
            return { x: box.x, y: box.y, width: box.width, height: box.height }
          }),
      terms,
    )
    expect(boxes).toHaveLength(40)
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(960)
      expect(box.y + box.height).toBeLessThanOrEqual(600)
      for (const other of boxes.slice(index + 1))
        expect(
          box.x < other.x + other.width &&
            box.x + box.width > other.x &&
            box.y < other.y + other.height &&
            box.y + box.height > other.y,
        ).toBe(false)
    }
    await page.screenshot({ path: '/tmp/zenoffice-word-cloud.png' })
    await page.getByText('词语39', { exact: true }).hover()
    await expect(page.getByText('40', { exact: true })).toBeVisible()
  } finally {
    await browser.close()
  }
})

test('force network nodes can be dragged without changing edge data', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
        window.mounted = mountInteractiveChart(document.getElementById('chart'), {
          chartId:'force-network', x:'source', target:'target', y:['weight'],
          table:{columns:['source','target','weight'],rows:[['A','B',5],['B','A',10],['B','C',8],['C','D',3]]}
        });`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent(
      '<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    const position = () =>
      page.evaluate(() =>
        (window as any).mounted.chart.getModel().getSeriesByIndex(0).getData().getItemLayout(0),
      )
    const before = await position()
    const node = page.locator('path[fill="#2563eb"]').first()
    const box = await node.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2 + 45, box!.y + box!.height / 2 + 30, {
      steps: 10,
    })
    await page.mouse.up()
    await expect.poll(position).not.toEqual(before)
    expect(
      await page.evaluate(() =>
        (window as any).mounted.chart.getOption().series[0].links.map((edge: any) => edge.value),
      ),
    ).toEqual([5, 10, 8, 3])
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
})

test('arc hover exposes the actual combined edge weight', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
        mountInteractiveChart(document.getElementById('chart'), {
          chartId:'arc', x:'source', target:'target', y:['weight'],
          table:{columns:['source','target','weight'],rows:[['A','B',2],['A','B',3],['B','A',10],['B','C',8]]}
        });`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent(
      '<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    await page.mouse.move(333, 149)
    await expect(page.getByText('A → B', { exact: true })).toBeVisible()
    await expect(page.getByText('5', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
})

test('chart range slider and restore operate in the browser without deleting data', async () => {
  const bundle = await build({
    stdin: {
      contents: `import {mountInteractiveChart} from './packages/visualization/src/interactive.ts';
        window.mounted=mountInteractiveChart(document.getElementById('chart'),{
          chartId:'column',x:'类别',y:['数值'],table:{columns:['类别','数值'],
          rows:Array.from({length:30},(_,i)=>['类别'+i,i+1])}});`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent(
      '<body style="margin:0"><div id="chart" style="width:960px;height:600px"></div></body>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
    const state = () =>
      page.evaluate(() => {
        const host = window as unknown as {
          mounted: {
            chart: {
              getOption(): {
                dataZoom: { start: number; end: number }[]
                series: { data: unknown[] }[]
              }
            }
          }
        }
        const option = host.mounted.chart.getOption()
        return {
          start: option.dataZoom[0]!.start,
          end: option.dataZoom[0]!.end,
          count: option.series[0]!.data.length,
        }
      })
    expect(await state()).toEqual({ start: 0, end: 100, count: 30 })
    await page.mouse.move(78, 567)
    await page.mouse.down()
    await page.mouse.move(400, 567, { steps: 20 })
    await page.mouse.up()
    await expect.poll(async () => (await state()).start).toBeGreaterThan(30)
    expect((await state()).count).toBe(30)
    await page.mouse.click(927, 53)
    await expect.poll(state).toEqual({ start: 0, end: 100, count: 30 })
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
})
