import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// The preset is this package's own ESLint config.
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  overrideConfigFile: fileURLToPath(new URL('../eslint.config.js', import.meta.url)),
})

/** The ids of the rules the preset reports for `code`, linted as the file at `filePath`. */
async function ruleIds(code: string, filePath = 'src/sample.ts') {
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((m) => m.ruleId) ?? []
}

/** `count` lines of code, each declaring its own constant. */
const linesOfCode = (count: number) =>
  Array.from({ length: count }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n'

describe('preset', () => {
  // The first lint loads the config, its plugins and the TypeScript parser: past 5 s on a cold CI runner.
  beforeAll(async () => {
    await ruleIds('')
  }, 60_000)

  describe('no-use-before-define', () => {
    it('fails a constant, a class or a type used above its declaration', async () => {
      const code = [
        'export const a = b',
        'const b = 1',
        'export const c = new C()',
        'class C {',
        '  n = 1',
        '}',
        'export type D = E',
        'type E = string',
        '',
      ].join('\n')

      expect(await ruleIds(code)).toEqual([
        '@typescript-eslint/no-use-before-define',
        '@typescript-eslint/no-use-before-define',
        '@typescript-eslint/no-use-before-define',
      ])
    })

    it('fails a constant used above its declaration in a JavaScript file', async () => {
      expect(await ruleIds('export const a = b\nconst b = 1\n', 'src/sample.js')).toEqual([
        '@typescript-eslint/no-use-before-define',
      ])
    })

    it('passes a function declaration that a function body calls from above it', async () => {
      const code = 'export function f() {\n  return g()\n}\n\nfunction g() {\n  return 1\n}\n'

      expect(await ruleIds(code)).toEqual([])
    })

    it('passes two types that refer to each other when the first carries the one allowed disable comment', async () => {
      const code = [
        'export type Tree = {',
        '  // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the types refer to each other',
        '  leaves: Leaf[]',
        '}',
        'export type Leaf = { tree: Tree }',
        '',
      ].join('\n')

      expect(await ruleIds(code)).toEqual([])
    })
  })

  describe('max-lines', () => {
    it('passes a file of 500 lines of code, not counting blank lines and comments', async () => {
      const code = `// A comment line.\n\n/** A block comment. */\n${linesOfCode(500)}`

      expect(await ruleIds(code)).toEqual([])
    })

    it('fails a TypeScript file of 501 lines of code, tests included', async () => {
      expect(await ruleIds(linesOfCode(501))).toEqual(['max-lines'])
      expect(await ruleIds(linesOfCode(501), 'src/sample.test.ts')).toEqual(['max-lines'])
    })
  })
})
