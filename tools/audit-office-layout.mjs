/** Independent layout audit. Requires LibreOffice + Poppler; never rewrites source Office content. */
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
const run = promisify(execFile)
const [file, references, destination] = process.argv.slice(2)
if (!file || !references || !destination)
  throw new Error(
    'Usage: node tools/audit-office-layout.mjs <office-file> <source-png-directory> <report.json>',
  )
const directory = await mkdtemp(join(tmpdir(), 'office-layout-audit-'))
try {
  const images = (await readdir(references))
    .filter((name) => /\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!images.length) throw new Error('No source page PNGs; layout cannot be verified')
  await run(
    process.env.SOFFICE_PATH || 'soffice',
    [
      `-env:UserInstallation=${pathToFileURL(join(directory, 'profile')).href}`,
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      directory,
      resolve(file),
    ],
    { timeout: 120_000 },
  )
  const pdf = join(directory, basename(file, extname(file)) + '.pdf')
  const info = await run(process.env.PDFINFO_PATH || 'pdfinfo', [pdf], { timeout: 30_000 })
  const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1])
  if (count !== images.length)
    throw new Error(`Page count mismatch: source=${images.length}, exported=${count}`)
  const pages = []
  for (const [index, name] of images.entries()) {
    const source = PNG.sync.read(await readFile(join(references, name)))
    const output = join(directory, `page-${index + 1}`)
    await run(
      process.env.PDFTOPPM_PATH || 'pdftoppm',
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
      { timeout: 120_000 },
    )
    const target = PNG.sync.read(await readFile(output + '.png'))
    if (source.width !== target.width || source.height !== target.height)
      throw new Error('Rendered page dimensions differ')
    const regions = []
    let total = 0
    for (let y = 0; y < source.height; y += 64)
      for (let x = 0; x < source.width; x += 64) {
        const width = Math.min(64, source.width - x),
          height = Math.min(64, source.height - y)
        let error = 0
        for (let j = y; j < y + height; j++)
          for (let i = x; i < x + width; i++) {
            const at = (j * source.width + i) * 4
            for (let c = 0; c < 3; c++) {
              const a =
                (source.data[at + c] * source.data[at + 3]) / 255 + 255 - source.data[at + 3]
              const b =
                (target.data[at + c] * target.data[at + 3]) / 255 + 255 - target.data[at + 3]
              error += (a - b) ** 2
            }
          }
        total += error
        const normalizedMse = error / (width * height * 3 * 255 ** 2)
        if (normalizedMse > 0.01) regions.push({ x, y, width, height, normalizedMse })
      }
    pages.push({
      page: index + 1,
      normalizedMse: total / (source.width * source.height * 3 * 255 ** 2),
      regions,
      status: regions.length ? 'review-required' : 'passed',
    })
  }
  await writeFile(
    destination,
    JSON.stringify(
      {
        renderer: 'LibreOffice',
        comparator: '64px block normalized MSE',
        threshold: 0.01,
        pages,
        status: pages.every((page) => page.status === 'passed') ? 'passed' : 'review-required',
        automaticRasterization: false,
      },
      null,
      2,
    ),
  )
  process.stdout.write(`Layout report: ${destination}\n`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
