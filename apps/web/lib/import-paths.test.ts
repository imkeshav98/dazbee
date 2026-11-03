// The app's import paths, checked with its own ESLint config: a file outside the importer's folder is
// imported through `@/`, never `../` or `./dir/…`, and each folder imports only what the folder table
// in docs/agents/code-layout.md lists.
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

/** Imports the folder table bans: the importing file, then the file it names. */
const BANNED = [
  ['components/ui/hello.ts', '@/components/library/tile-menu.tsx'],
  ['components/brand-kit/hello.ts', '@/components/editor/styles.ts'],
  ['components/brand-kit/hello.ts', '@/lib/server/api.ts'],
  ['components/library/hello.ts', '@/components/editor/shell.tsx'],
  ['components/brief/hello.ts', '@/lib/editor/size.ts'],
  ['components/brief/hello.ts', '@/app/page.tsx'],
  ['components/editor/top-bar/hello.ts', '@/components/library/tile-menu.tsx'],
  ['components/editor/hello.ts', '@/lib/server/sign-in.ts'],
  ['lib/hello.ts', '@/lib/editor/size.ts'],
  ['lib/hello.ts', '@/components/ui/button.tsx'],
  ['lib/editor/hello.ts', '@/lib/server/api.ts'],
  ['lib/server/hello.ts', '@/lib/editor/size.ts'],
  ['lib/i18n/hello.ts', '@/lib/cn.ts'],
  ['scripts/hello.ts', '@/lib/cn.ts'],
] as const

/** Imports the folder table lists, a few for each folder: the importing file, then the files it names. */
const ALLOWED = [
  ['components/ui/hello.ts', ['@/components/ui/button.tsx', '@/lib/cn.ts', '@/lib/i18n/index.ts']],
  [
    'components/library/hello.ts',
    ['@/components/brands/brand-cards.tsx', '@/components/brand-kit/kit-page.tsx', '@/lib/server/sign-in.ts'],
  ],
  ['components/brief/hello.ts', ['@/components/library/tile-menu.tsx', '@/app/brands/[brandId]/actions.ts']],
  ['components/brand-kit/hello.ts', ['@/components/ui/select.tsx', '@/lib/upload-asset.ts', '@/app/actions.ts']],
  [
    'components/editor/top-bar/hello.ts',
    ['@/components/editor/styles.ts', '@/components/brand-kit/font-catalog.ts', '@/lib/editor/size.ts'],
  ],
  ['lib/hello.ts', ['@/lib/cn.ts', '@/lib/i18n/index.ts']],
  ['lib/editor/hello.ts', ['@/lib/editor/fill.ts', '@/lib/upload-asset.ts', '@/lib/i18n/index.ts']],
  ['lib/server/hello.ts', ['@/lib/server/api.ts', '@/lib/cn.ts']],
  ['scripts/hello.ts', ['@/scripts/check-logical.ts']],
  ['app/hello.ts', ['@/lib/server/api.ts', '@/lib/editor/size.ts', '@/components/editor/shell.tsx']],
] as const

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) })

const ruleIds = async (code: string, filePath = 'components/hello.ts') => {
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((m) => m.ruleId) ?? []
}

describe('import paths', () => {
  // Loading the app's ESLint config and parsers takes past 5 s on a cold CI runner, so one lint runs first.
  beforeAll(() => eslint.lintText('', { filePath: 'components/hello.ts' }), 60_000)

  it('fails an import that leaves its folder through ../', async () => {
    expect(await ruleIds("export { api } from '../lib/api.ts'\n")).toContain('no-restricted-imports')
  })

  it('fails a relative import into a subfolder', async () => {
    expect(await ruleIds("export { Button } from './ui/button.tsx'\n")).toContain('no-restricted-imports')
  })

  it('allows a sibling through ./ and any other file through @/', async () => {
    const code = "export { cn } from '@/lib/cn.ts'\nexport { Menu } from './menu.tsx'\n"
    expect(await ruleIds(code)).not.toContain('no-restricted-imports')
  })

  it('fails an import that the folder table bans', async () => {
    const passed: string[] = []
    for (const [file, target] of BANNED) {
      const ids = await ruleIds(`export * from '${target}'\n`, file)
      if (!ids.includes('no-restricted-imports')) passed.push(`${file} → ${target}`)
    }
    expect(passed).toEqual([])
  })

  it('allows the imports that the folder table lists, and keeps the ../ ban in every folder', async () => {
    for (const [file, targets] of ALLOWED) {
      const code = targets.map((t) => `export * from '${t}'\n`).join('')
      expect(await ruleIds(code, file), file).not.toContain('no-restricted-imports')
      expect(await ruleIds("export * from '../hello.ts'\n", file), file).toContain('no-restricted-imports')
    }
  })
})
