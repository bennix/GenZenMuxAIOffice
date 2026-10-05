import { expect, it } from 'vitest'
import { assertExpectedMacSignatureDetails, resolveOfficeCli } from '../src/officecli-runtime'

it('accepts only the packaged OfficeCLI identifier and ZenOffice signing team', () => {
  const details =
    'Executable=/Contents/Resources/officecli/officecli-mac-arm64\n' +
    'Identifier=officecli-mac-arm64\n' +
    'TeamIdentifier=5N66S29EK2\n'
  expect(() => assertExpectedMacSignatureDetails('officecli-mac-arm64', details)).not.toThrow()
  expect(() =>
    assertExpectedMacSignatureDetails(
      'officecli-mac-arm64',
      details.replace('TeamIdentifier=5N66S29EK2', 'TeamIdentifier=OTHERTEAM'),
    ),
  ).toThrow(/identity mismatch/)
  expect(() =>
    assertExpectedMacSignatureDetails(
      'officecli-mac-arm64',
      details.replace('Identifier=officecli-mac-arm64', 'Identifier=unexpected'),
    ),
  ).toThrow(/identity mismatch/)
})

if (process.platform === 'darwin' && process.env.GENOFFICE_TEST_PACKAGED_RESOURCES) {
  it('resolves the actual code-signed OfficeCLI from a packaged macOS app', async () => {
    const binary = await resolveOfficeCli({
      isPackaged: true,
      appPath: '',
      resourcesPath: process.env.GENOFFICE_TEST_PACKAGED_RESOURCES!,
    })
    expect(binary).toMatch(/officecli\/officecli-mac-arm64$/)
  })
}
