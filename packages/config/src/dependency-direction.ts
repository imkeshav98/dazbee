// ADR-0001's checks over the whole repo: workspace dependencies point downward, and every ESLint block
// that sets `no-restricted-imports` keeps the pattern that bans relative imports into another workspace.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import type { Linter } from 'eslint'

import preset, { adr0001Pattern, webAliasPatterns } from '../eslint.config.js'

/** One package in the pnpm workspace (not a Workspace; see GLOSSARY.md). */
export interface WorkspacePackage {
  name: string
  /** Path relative to the repo root, e.g. `apps/web` or `packages/schema`. */
  dir: string
  /** Workspace names this one depends on, from any dependency field. */
  deps: string[]
}

/** One `patterns` entry of `no-restricted-imports`, as the preset writes them. */
type RestrictedPattern = { regex: string; message: string }

/** ADR-0001: each core package may depend only on those before it. */
const CORE_CHAIN = ['@dazbee/schema', '@dazbee/doc', '@dazbee/renderer', '@dazbee/editor']
const CHAIN_TEXT = CORE_CHAIN.map((name) => name.replace('@dazbee/', '')).join(' → ')

/** What a workspace root holds. Packages may never depend on apps or test suites. */
const ROOT_KINDS: Record<string, string> = { apps: 'an app', packages: 'a package', tests: 'a test suite' }
const kindOf = (w: WorkspacePackage) => ROOT_KINDS[w.dir.split('/')[0] ?? '']

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** The patterns a workspace's own `no-restricted-imports` blocks hold beyond ADR-0001's, by workspace dir. */
const OWN_PATTERNS: Record<string, { name: string; patterns: readonly RestrictedPattern[] }> = {
  'apps/web': { name: 'webAliasPatterns', patterns: webAliasPatterns },
}
const FROM_PRESET = 'from @dazbee/config/eslint'

export async function checkRepo(root: string): Promise<string[]> {
  const { workspaces, problems } = readWorkspaces(root)
  return [...problems, ...findViolations(workspaces), ...(await checkImportRules(root, workspaces))]
}

export function findViolations(workspaces: WorkspacePackage[]): string[] {
  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const violations: string[] = []
  for (const w of workspaces) {
    for (const dep of w.deps) {
      const target = byName.get(dep)
      if (!target) continue
      if (kindOf(w) === ROOT_KINDS.packages && kindOf(target) !== ROOT_KINDS.packages) {
        violations.push(`${w.name} (a package) depends on ${target.name} (${kindOf(target)})`)
      }
      const from = CORE_CHAIN.indexOf(w.name)
      const to = CORE_CHAIN.indexOf(target.name)
      if (from !== -1 && to > from) {
        violations.push(`${w.name} depends on ${target.name}, which comes later in ${CHAIN_TEXT}`)
      }
    }
  }
  return violations
}

/**
 * Reads the workspace packages named by `pnpm-workspace.yaml` under `root`.
 * Anything it can't check is reported as a problem, so the check never passes by seeing nothing.
 */
export function readWorkspaces(root: string): { workspaces: WorkspacePackage[]; problems: string[] } {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const packagesBlock = yaml.match(/^packages:\s*\n((?:[ \t]+-.*\n?)*)/m)?.[1] ?? ''
  const patterns = [...packagesBlock.matchAll(/^[ \t]+-[ \t]*['"]?([^'"\n]+?)['"]?[ \t]*$/gm)].map(
    (m) => m[1] as string,
  )
  const workspaces: WorkspacePackage[] = []
  const problems: string[] = []
  for (const pattern of patterns) {
    const parent = pattern.match(/^([\w.-]+)\/\*$/)?.[1]
    if (!parent) {
      problems.push(`pnpm-workspace.yaml: cannot check the pattern "${pattern}"; use "dir/*"`)
      continue
    }
    if (!existsSync(join(root, parent))) continue
    for (const child of readdirSync(join(root, parent))) {
      const dir = `${parent}/${child}`
      const file = join(root, dir, 'package.json')
      if (!existsSync(file)) continue
      const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      if (typeof json.name !== 'string') {
        problems.push(`${dir}/package.json: missing "name"`)
        continue
      }
      const deps = DEP_FIELDS.flatMap((f) => Object.keys((json[f] as object | undefined) ?? {}))
      workspaces.push({ name: json.name, dir, deps })
    }
  }
  if (problems.length === 0 && workspaces.length === 0) {
    problems.push('pnpm-workspace.yaml: no workspace packages found')
  }
  return { workspaces, problems }
}

/** Loads each workspace's `eslint.config.js` and checks its import rule blocks. A workspace without one has no lint. */
export async function checkImportRules(root: string, workspaces: readonly WorkspacePackage[]): Promise<string[]> {
  const presetBlocks = new Set<object>(preset)
  const gaps: string[] = []
  for (const w of workspaces) {
    const file = join(root, w.dir, 'eslint.config.js')
    if (!existsSync(file)) continue
    const loaded = ((await import(pathToFileURL(file).href)) as { default: unknown }).default
    gaps.push(...findImportRuleGaps(w.dir, [loaded].flat(Infinity) as Linter.Config[], presetBlocks))
  }
  return gaps
}

/**
 * Lists the blocks of one workspace's ESLint config that drop a required import pattern. A later block's
 * `no-restricted-imports` options replace an earlier block's, so every block that sets the rule sets it at
 * error with `adr0001Pattern`. A workspace in `OWN_PATTERNS` also sets its patterns in a block of its own,
 * and in every block of its own that sets the rule; `presetBlocks` are the preset's, shared by every workspace.
 */
export function findImportRuleGaps(
  dir: string,
  config: readonly Linter.Config[],
  presetBlocks: ReadonlySet<object>,
): string[] {
  const file = `${dir}/eslint.config.js`
  const own = OWN_PATTERNS[dir]
  const gaps: string[] = []
  let ownBlocks = 0
  config.forEach((block, index) => {
    const entry = block.rules?.['no-restricted-imports']
    if (entry === undefined) return
    const where = `${file}: block ${index}${block.files ? ` (${block.files.flat().join(', ')})` : ''}`
    const [severity, ...options] = Array.isArray(entry) ? entry : [entry]
    const patterns = options.flatMap((o: unknown) => (isRecord(o) && Array.isArray(o.patterns) ? o.patterns : []))
    const holds = (pattern: RestrictedPattern) => patterns.some((p: unknown) => isDeepStrictEqual(p, pattern))
    if (severity !== 'error' && severity !== 2) gaps.push(`${where} sets no-restricted-imports below error`)
    if (!holds(adr0001Pattern)) gaps.push(`${where} sets no-restricted-imports without adr0001Pattern ${FROM_PRESET}`)
    if (!own || presetBlocks.has(block)) return
    ownBlocks += 1
    if (!own.patterns.every(holds)) gaps.push(`${where} sets no-restricted-imports without ${own.name} ${FROM_PRESET}`)
  })
  if (own && ownBlocks === 0) {
    gaps.push(`${file}: no block of its own sets no-restricted-imports with ${own.name} ${FROM_PRESET}`)
  }
  return gaps
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
