import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The preset is this package's own ESLint config.
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  overrideConfigFile: fileURLToPath(new URL('../eslint.config.js', import.meta.url)),
})

/** The rule ids the preset reports for `code` as a TypeScript file. */
async function problems(code: string, filePath = 'src/sample.ts') {
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((m) => m.ruleId) ?? []
}

/** `count` lines of code, each declaring its own constant. */
const linesOfCode = (count: number) =>
  Array.from({ length: count }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n'

describe('max-lines', () => {
  it('passes a file of 500 lines of code, not counting blank lines and comments', async () => {
    const code = `// A comment line.\n\n/** A block comment. */\n${linesOfCode(500)}`

    expect(await problems(code)).toEqual([])
  })

  it('fails a file of 501 lines of code, tests included', async () => {
    expect(await problems(linesOfCode(501))).toEqual(['max-lines'])
    expect(await problems(linesOfCode(501), 'src/sample.test.ts')).toEqual(['max-lines'])
  })
})

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

    expect(await problems(code)).toEqual([
      '@typescript-eslint/no-use-before-define',
      '@typescript-eslint/no-use-before-define',
      '@typescript-eslint/no-use-before-define',
    ])
  })

  it('passes a function declaration that a function body calls from above it', async () => {
    const code = 'export function f() {\n  return g()\n}\n\nfunction g() {\n  return 1\n}\n'

    expect(await problems(code)).toEqual([])
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

    expect(await problems(code)).toEqual([])
  })
})
