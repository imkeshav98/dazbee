// ADR-0001's import rule over every package of the pnpm workspace: each ESLint block that sets
// `no-restricted-imports` keeps the pattern that bans relative imports into another package, and
// apps/web's blocks keep the ban on `../` and `./dir/…` imports.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import type { Linter } from 'eslint'

import preset, { adr0001Pattern, webAliasPatterns } from '../eslint.config.js'

const WEB_DIR = 'apps/web'
const FROM_PRESET = 'from @dazbee/config/eslint'
const ADR_0001 = `adr0001Pattern ${FROM_PRESET}`

/** Loads the `eslint.config.js` of each package dir and checks its import rule blocks. A dir without one has no lint. */
export async function checkImportRules(root: string, dirs: readonly string[]): Promise<string[]> {
  const presetBlocks = new Set<object>(preset)
  const gaps: string[] = []
  for (const dir of dirs) {
    const file = join(root, dir, 'eslint.config.js')
    if (!existsSync(file)) continue
    const loaded = ((await import(pathToFileURL(file).href)) as { default: unknown }).default
    gaps.push(...findImportRuleGaps(dir, [loaded].flat(Infinity) as Linter.Config[], presetBlocks))
  }
  return gaps
}

/**
 * Lists the blocks of one package's ESLint config that drop a required import pattern. A later block's
 * `no-restricted-imports` options replace an earlier block's, so every block that sets the rule sets it at
 * error with `adr0001Pattern`. In apps/web, every block of its own that sets the rule also holds
 * `webAliasPatterns`, and one of them has no `files`, so the ban covers every file; `presetBlocks` are
 * the preset's, which every package shares.
 */
export function findImportRuleGaps(
  dir: string,
  config: readonly Linter.Config[],
  presetBlocks: ReadonlySet<object>,
): string[] {
  const file = `${dir}/eslint.config.js`
  const isWeb = dir === WEB_DIR
  const gaps: string[] = []
  let webBanEverywhere = false
  config.forEach((block, index) => {
    const entry = block.rules?.['no-restricted-imports']
    if (entry === undefined) return
    const where = `${file}: block ${index}${block.files ? ` (${block.files.flat().join(', ')})` : ''}`
    const [severity, ...options] = Array.isArray(entry) ? entry : [entry]
    const patterns = options.flatMap((o: unknown) => (isRecord(o) && Array.isArray(o.patterns) ? o.patterns : []))
    const hasPattern = (pattern: object) => patterns.some((p: unknown) => isDeepStrictEqual(p, pattern))
    if (severity !== 'error' && severity !== 2) gaps.push(`${where} sets no-restricted-imports below error`)
    if (!hasPattern(adr0001Pattern)) gaps.push(`${where} sets no-restricted-imports without ${ADR_0001}`)
    if (!isWeb || presetBlocks.has(block)) return
    if (!webAliasPatterns.every(hasPattern)) {
      gaps.push(`${where} sets no-restricted-imports without webAliasPatterns ${FROM_PRESET}`)
    } else if (!block.files) webBanEverywhere = true
  })
  if (isWeb && !webBanEverywhere) {
    gaps.push(
      `${file}: no block of its own without files sets no-restricted-imports with webAliasPatterns ${FROM_PRESET}`,
    )
  }
  return gaps
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
