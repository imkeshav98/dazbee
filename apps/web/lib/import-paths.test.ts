// The app's import paths, checked with its own ESLint config: a file outside the importer's folder is
// imported through `@/`, never `../` or `./dir/…`.
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) })

const ruleIds = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath: 'components/hello.ts' })
  return result?.messages.map((m) => m.ruleId) ?? []
}

describe('import paths', () => {
  // Loading the app's whole ESLint config takes past 5 s on a cold CI runner, so it loads once, up front.
  beforeAll(() => eslint.calculateConfigForFile('components/hello.ts'), 60_000)

  it('fails an import that leaves its folder through ../', async () => {
    expect(await ruleIds("export { api } from '../lib/api.ts'\n")).toContain('no-restricted-imports')
  })

  it('fails a relative import into a subfolder', async () => {
    expect(await ruleIds("export { Button } from './ui/button.tsx'\n")).toContain('no-restricted-imports')
  })

  it('allows a sibling through ./ and any other file through @/', async () => {
    const code = "export { api } from '@/lib/api.ts'\nexport { Menu } from './menu.tsx'\n"
    expect(await ruleIds(code)).not.toContain('no-restricted-imports')
  })
})
