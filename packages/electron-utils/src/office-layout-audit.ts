import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface AuditPixels {
  width: number
  height: number
  data: Uint8Array
}
export interface LayoutRegion {
  x: number
  y: number
  width: number
  height: number
  normalizedMse: number
}
export interface LayoutPageAudit {
  page: number
  width: number
  height: number
  normalizedMse: number
  regions: LayoutRegion[]
  status: 'passed' | 'review-required'
}
export interface OfficeLayoutAudit {
  status: 'passed' | 'review-required' | 'unavailable'
  renderer: 'LibreOffice'
  pages: LayoutPageAudit[]
  reason?: string
}
const run = promisify(execFile)

/** 两路像素需采用同一通道排列；alpha 合成到白色，不把透明边缘当作差异。 */
export function compareLayoutPixels(
  source: AuditPixels,
  target: AuditPixels,
  page: number,
): LayoutPageAudit {
  const { width, height } = source
  if (
    width !== target.width ||
    height !== target.height ||
    width < 1 ||
    height < 1 ||
    source.data.length !== width * height * 4 ||
    target.data.length !== width * height * 4
  )
    throw new Error('Layout bitmap dimensions differ')
  const regions: LayoutRegion[] = []
  let total = 0
  for (let y = 0; y < height; y += 64)
    for (let x = 0; x < width; x += 64) {
      const w = Math.min(64, width - x),
        h = Math.min(64, height - y)
      let error = 0
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++) {
          const at = (j * width + i) * 4
          for (let c = 0; c < 3; c++) {
            const a =
              (source.data[at + c]! * source.data[at + 3]!) / 255 + 255 - source.data[at + 3]!
            const b =
              (target.data[at + c]! * target.data[at + 3]!) / 255 + 255 - target.data[at + 3]!
            error += (a - b) ** 2
          }
        }
      total += error
      const normalizedMse = error / (w * h * 3 * 255 ** 2)
      if (normalizedMse > 0.01) regions.push({ x, y, width: w, height: h, normalizedMse })
    }
  return {
    page,
    width,
    height,
    normalizedMse: total / (width * height * 3 * 255 ** 2),
    regions,
    status: regions.length ? 'review-required' : 'passed',
  }
}

export async function resolveLayoutExecutable(
  command: string,
  candidates: string[],
): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      /* 未安装的平台路径继续查找 PATH。 */
    }
  }
  return command
}

/** 独立渲染失败显式标注 unavailable；不把结构校验成功冒充视觉通过。 */
export async function auditOfficeLayout(
  file: string,
  references: readonly Buffer[],
  decode: (png: Buffer) => AuditPixels,
  onPage?: (page: number, total: number) => void,
): Promise<OfficeLayoutAudit> {
  let directory: string | undefined
  try {
    if (!references.length || references.length > 500)
      throw new Error('No valid source page references')
    directory = await mkdtemp(join(tmpdir(), 'office-layout-'))
    const soffice = await resolveLayoutExecutable('soffice', [
      join(homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/opt/homebrew/bin/soffice',
      '/usr/bin/soffice',
      ...(process.env.ProgramFiles
        ? [join(process.env.ProgramFiles, 'LibreOffice', 'program', 'soffice.exe')]
        : []),
    ])
    const poppler = await resolveLayoutExecutable('pdftoppm', [
      '/opt/homebrew/bin/pdftoppm',
      '/usr/bin/pdftoppm',
    ])
    const pdfinfo = await resolveLayoutExecutable('pdfinfo', [
      '/opt/homebrew/bin/pdfinfo',
      '/usr/bin/pdfinfo',
    ])
    await run(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(join(directory, 'profile')).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        directory,
        file,
      ],
      { timeout: 120_000, maxBuffer: 128 * 1024 },
    )
    const pdf = join(directory, basename(file, extname(file)) + '.pdf')
    const info = await run(pdfinfo, [pdf], { timeout: 30_000, maxBuffer: 128 * 1024 })
    const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1])
    if (count !== references.length)
      throw new Error(`Page count mismatch: source=${references.length}, rendered=${count}`)
    const pages: LayoutPageAudit[] = []
    for (const [index, reference] of references.entries()) {
      onPage?.(index + 1, references.length)
      const source = decode(reference)
      if (
        source.width > 10000 ||
        source.height > 10000 ||
        source.width * source.height > 40_000_000
      )
        throw new Error('Source page bitmap too large')
      const output = join(directory, `page-${index + 1}`)
      await run(
        poppler,
        [
          '-f',
          String(index + 1),
          '-l',
          String(index + 1),
          '-singlefile',
          '-png',
          '-scale-to-x',
          String(source.width),
          '-scale-to-y',
          String(source.height),
          pdf,
          output,
        ],
        { timeout: 120_000, maxBuffer: 128 * 1024 },
      )
      pages.push(compareLayoutPixels(source, decode(await readFile(output + '.png')), index + 1))
    }
    return {
      renderer: 'LibreOffice',
      status: pages.every((page) => page.status === 'passed') ? 'passed' : 'review-required',
      pages,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      renderer: 'LibreOffice',
      status: 'unavailable',
      pages: [],
      reason:
        code === 'ENOENT'
          ? 'LibreOffice or Poppler is not installed'
          : error instanceof Error
            ? error.message.slice(0, 300)
            : 'Independent renderer failed',
    }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
