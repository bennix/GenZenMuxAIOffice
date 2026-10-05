/** Visual PPTX export: each page is a full-page image, separate from editable compatibility save. */
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { invokeOfficeCli, resolveOfficeCli } from '@genoffice/electron-utils'

export async function exportVisualPptx(
  pngsBase64: string[],
  destination: string,
  widthPx: number,
  heightPx: number,
): Promise<string> {
  if (!Array.isArray(pngsBase64) || pngsBase64.length < 1 || pngsBase64.length > 500)
    throw new Error('Invalid slide count')
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0 ||
    widthPx > 10000 ||
    heightPx > 10000
  )
    throw new Error('Invalid slide canvas')
  const pngs: Buffer[] = []
  let total = 0
  for (const base64 of pngsBase64) {
    if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
      throw new Error('Invalid slide image')
    const png = Buffer.from(base64, 'base64')
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error('Invalid PNG image')
    total += png.length
    if (total > 50 * 1024 * 1024) throw new Error('Slide images exceed 50 MiB')
    pngs.push(png)
  }
  const binary = await resolveOfficeCli({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  })
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-visual-pptx-'))
  const file = join(dir, 'deck.pptx')
  try {
    await invokeOfficeCli(binary, ['create', file, '--locale', 'zh-CN'])
    const width = `${Math.round(widthPx)}px`
    const height = `${Math.round(heightPx)}px`
    const commands: object[] = [
      {
        command: 'set',
        path: '/',
        props: { slideWidth: width, slideHeight: height, author: 'ZenOffice' },
      },
    ]
    for (let i = 0; i < pngs.length; i++) {
      const path = join(dir, `${i + 1}.png`)
      await writeFile(path, pngs[i]!)
      commands.push({ command: 'add', parent: '/', type: 'slide' })
      commands.push({
        command: 'add',
        parent: `/slide[${i + 1}]`,
        type: 'picture',
        props: { src: path, x: '0', y: '0', width, height, alt: `Slide ${i + 1}` },
      })
    }
    const batch = join(dir, 'commands.json')
    await writeFile(batch, JSON.stringify(commands))
    await invokeOfficeCli(binary, ['batch', file, '--input', batch, '--json'])
    await invokeOfficeCli(binary, ['save', file])
    const validation = JSON.parse(await invokeOfficeCli(binary, ['validate', file, '--json']))
    const issues = JSON.parse(await invokeOfficeCli(binary, ['view', file, 'issues', '--json']))
    const stats = JSON.parse(await invokeOfficeCli(binary, ['view', file, 'stats', '--json']))
    if (
      validation.success !== true ||
      issues.success !== true ||
      stats.success !== true ||
      stats.data?.slides !== pngs.length ||
      stats.data?.pictures !== pngs.length
    )
      throw new Error(
        `OfficeCLI validation failed: ${JSON.stringify({ validation, issues, stats }).slice(0, 2000)}`,
      )
    await invokeOfficeCli(binary, ['close', file])
    // Only publish the verified temporary deck.
    const staged = join(dirname(destination), `.${randomUUID()}.pptx.tmp`)
    try {
      await copyFile(file, staged)
      await rename(staged, destination)
      // 不能把工具退出成功或请求路径当作落盘证据；确认最终目标并返回真实路径。
      const savedPath = await realpath(destination)
      const savedStat = await stat(savedPath)
      const [expected, saved] = await Promise.all([readFile(file), readFile(savedPath)])
      if (
        !savedStat.isFile() ||
        savedStat.size === 0 ||
        createHash('sha256').update(expected).digest('hex') !==
          createHash('sha256').update(saved).digest('hex')
      ) {
        throw new Error('Saved PPTX could not be verified on disk')
      }
      return savedPath
    } finally {
      await rm(staged, { force: true })
    }
  } finally {
    await invokeOfficeCli(binary, ['close', file]).catch(() => {})
    await rm(dir, { recursive: true, force: true })
  }
}
