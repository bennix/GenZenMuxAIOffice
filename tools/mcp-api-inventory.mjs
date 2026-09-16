import ts from 'typescript'
import { resolve, relative } from 'node:path'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const surfaces = [
  ['word', 'apps/docs/src/shared/ipc.ts', 'DesktopApi', 'desktop'],
  ['excel', 'apps/sheets/src/shared/desktop-api.ts', 'DesktopApi', 'desktopApi'],
  ['ppt', 'apps/slides/src/shared/ipc.ts', 'SlidesApi', 'slidesApi'],
  ['ppt-files', 'apps/slides/src/shared/ipc.ts', 'DesktopFilesApi', 'desktop'],
  ['pdf', 'apps/pdf/src/shared/ipc.ts', 'PdfApi', 'pdfApi'],
  ['markdown', 'apps/markdown/src/shared/ipc.ts', 'MarkdownApi', 'markdownApi'],
  ['application', 'apps/shell/src/shared/home-api.ts', 'HomeApi', 'aiOffice'],
  ['projects', 'apps/shell/src/shared/home-api.ts', 'ProjectHomeApi', 'aiOfficeProject'],
  ['tabs', 'apps/shell/src/shared/tabs-api.ts', 'TabsApi', 'aiOfficeTabs'],
  ['project-store', 'packages/project-store/src/ipc.ts', 'ProjectApi', 'projectApi'],
]
const program = ts.createProgram(
  surfaces.map(([, path]) => resolve(root, path)),
  {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  },
)
const checker = program.getTypeChecker()
const inventory = []
for (const [module, path, interfaceName, global] of surfaces) {
  const source = program.getSourceFile(resolve(root, path))
  const declaration = source?.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  )
  if (!declaration) throw new Error(`Missing interface ${interfaceName} in ${path}`)
  const type = checker.getTypeAtLocation(declaration)
  const operations = []
  for (const property of type.getProperties()) {
    const member = property.valueDeclaration ?? property.declarations?.[0]
    if (!member) continue
    const signatures = checker.getTypeOfSymbolAtLocation(property, member).getCallSignatures()
    for (const signature of signatures) {
      const parameters = signature.parameters.map((parameter) => {
        const location = parameter.valueDeclaration ?? member
        const parameterType = checker.getTypeOfSymbolAtLocation(parameter, location)
        return {
          name: parameter.name,
          type: checker.typeToString(parameterType, location, ts.TypeFormatFlags.NoTruncation),
          optional:
            Boolean(parameter.flags & ts.SymbolFlags.Optional) ||
            Boolean(location.questionToken) ||
            Boolean(location.initializer),
          callback: parameterType.getCallSignatures().length > 0,
        }
      })
      const file = member.getSourceFile()
      const position = file.getLineAndCharacterOfPosition(member.getStart())
      operations.push({
        name: property.name,
        parameters,
        result: checker.typeToString(
          signature.getReturnType(),
          member,
          ts.TypeFormatFlags.NoTruncation,
        ),
        description: ts.displayPartsToString(property.getDocumentationComment(checker)),
        transport: parameters.some((parameter) => parameter.callback)
          ? 'subscription-adapter-required'
          : 'request-response',
        source: `${relative(root, file.fileName)}:${position.line + 1}`,
        mcpStatus: 'not-implemented',
      })
    }
  }
  inventory.push({ module, global, interfaceName, operations })
}
const output = {
  description:
    'Source API inventory for MCP implementation; inclusion does not mean an MCP tool exists. Renderer-only actions and ArtFlow services require additional inventory.',
  surfaces: inventory,
}
const destination = process.argv[2]
if (destination) writeFileSync(resolve(destination), JSON.stringify(output, null, 2) + '\n')
else process.stdout.write(JSON.stringify(output, null, 2) + '\n')
