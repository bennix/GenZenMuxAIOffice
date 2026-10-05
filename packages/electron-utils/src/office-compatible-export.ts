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
import { dirname, extname, join } from 'node:path'
import {
  invokeOfficeCli,
  resolveOfficeCli,
  type OfficeCliRuntimeOptions,
} from './officecli-runtime'

/** 校验原生结构而不让 CLI 重写源内容，复杂 OOXML 与可编辑对象由各应用序列化器保留。 */
export async function publishCompatibleOffice(
  destination: string,
  serialize: (temporaryPath: string) => Promise<void>,
  runtime: OfficeCliRuntimeOptions,
  prepare?: (file: string) => Promise<Readonly<Record<string, unknown>>>,
): Promise<{ path: string; reportPath: string }> {
  const extension = extname(destination).toLowerCase()
  if (!['.pptx', '.docx', '.xlsx'].includes(extension))
    throw new Error('Unsupported compatible Office format')
  const binary = await resolveOfficeCli(runtime)
  const directory = await mkdtemp(join(tmpdir(), 'office-native-export-'))
  const file = join(directory, `native${extension}`)
  const staged = join(dirname(destination), `.${randomUUID()}${extension}.tmp`)
  try {
    await serialize(file)
    const layout = prepare ? await prepare(file) : undefined
    const expected = await readFile(file)
    const readResult = async (args: string[]) => {
      const result = JSON.parse(await invokeOfficeCli(binary, args)) as {
        success?: boolean
        data?: unknown
      }
      if (result.success !== true) throw new Error(`Office compatibility check failed: ${args[0]}`)
      return result
    }
    const validation = await readResult(['validate', file, '--json'])
    const issues = await readResult(['view', file, 'issues', '--json'])
    const stats = await readResult(['view', file, 'stats', '--json'])
    if (!expected.equals(await readFile(file)))
      throw new Error('Compatibility check changed native content')
    // CLI 只读检查不能意外改变序列化结果；报告明确区分结构验证和视觉验收。
    const reportPath = `${destination}.compatibility.json`
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          format: extension,
          validation,
          issues,
          stats,
          layoutVerification: layout ?? 'not-run',
          strategy:
            typeof layout?.accepted === 'number' && layout.accepted > 0
              ? 'native-with-measured-complex-raster'
              : 'native-source-preservation',
          sha256: createHash('sha256').update(expected).digest('hex'),
        },
        null,
        2,
      ),
    )
    await invokeOfficeCli(binary, ['close', file])
    await copyFile(file, staged)
    await rename(staged, destination)
    const path = await realpath(destination)
    const saved = await readFile(path)
    if (
      !(await stat(path)).isFile() ||
      !saved.length ||
      createHash('sha256').update(saved).digest('hex') !==
        createHash('sha256').update(expected).digest('hex')
    )
      throw new Error('Compatible Office file could not be verified on disk')
    return { path, reportPath }
  } finally {
    await invokeOfficeCli(binary, ['close', file]).catch(() => {})
    await rm(staged, { force: true })
    await rm(directory, { recursive: true, force: true })
  }
}
