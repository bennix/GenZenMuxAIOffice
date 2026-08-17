import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const modules = ['docs', 'sheets', 'slides', 'pdf', 'markdown']
const externalWorkspaceRequire = /require\(["']@genoffice\//
const failures = []

for (const moduleName of modules) {
  const file = resolve(`apps/${moduleName}/out/preload/index.js`)
  const source = readFileSync(file, 'utf8')
  if (externalWorkspaceRequire.test(source)) failures.push(file)
}

if (failures.length > 0) {
  console.error(
    `Packaged preload bundles still require workspace packages:\n${failures.map((file) => `- ${file}`).join('\n')}`,
  )
  process.exitCode = 1
} else {
  console.log('All module preload bundles are self-contained.')
}
