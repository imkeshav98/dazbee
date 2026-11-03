// The UI's fixed rules (#51) and the app's import paths, checked over the real source.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import { physicalSides } from '@/scripts/check-logical.ts'

const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname })

describe('message catalogs', () => {
  // Lints every page and component with the app's whole config: about 2 s here, past 5 s on a cold CI runner.
  it('finds no hard-coded UI string in any component', async () => {
    const results = await eslint.lintFiles(['app/**/*.tsx', 'components/**/*.tsx'])
    const literals = results.flatMap((r) =>
      r.messages.filter((m) => m.ruleId === 'react/jsx-no-literals').map((m) => `${r.filePath}:${m.line}`),
    )
    expect(literals).toEqual([])
  }, 60_000)

  it('catches a hard-coded string when there is one', async () => {
    const [result] = await eslint.lintText('export const Hello = () => <p>Hello there</p>\n', {
      filePath: 'components/hello.tsx',
    })
    expect(result?.messages.map((m) => m.ruleId)).toContain('react/jsx-no-literals')
  })
})

describe('import paths', () => {
  const ruleIds = async (code: string) => {
    const [result] = await eslint.lintText(code, { filePath: 'components/hello.ts' })
    return result?.messages.map((m) => m.ruleId) ?? []
  }

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

describe('logical sides', () => {
  it('rejects physical left and right in CSS', () => {
    expect(physicalSides('a.css', '.x { margin-left: 4px; }')).toHaveLength(1)
    expect(physicalSides('a.css', '.x { left: 0 }')).toHaveLength(1)
    expect(physicalSides('a.css', '.x { text-align: right; }')).toHaveLength(1)
    expect(physicalSides('a.css', '.x { margin-inline-start: 4px; inset-inline-end: 0; }')).toEqual([])
  })

  it('rejects physical Tailwind classes but not logical ones', () => {
    expect(physicalSides('a.tsx', '<div className="ml-2 p-4" />')).toHaveLength(1)
    expect(physicalSides('a.tsx', '<div className="hover:pr-3" />')).toHaveLength(1)
    expect(physicalSides('a.tsx', '<div className="left-0 top-0" />')).toHaveLength(1)
    expect(physicalSides('a.tsx', '<div className="ms-2 pe-4 start-0 text-start border-s rounded-s-lg" />')).toEqual([])
  })
})
