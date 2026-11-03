import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Linter } from 'eslint'
import { afterEach, describe, expect, it } from 'vitest'

import { adr0001Pattern, webAliasPatterns } from '../eslint.config.js'
import { checkRepo, findViolations, type WorkspacePackage } from './dependency-direction.ts'

const workspacePackage = (name: string, dir: string, deps: string[] = []): WorkspacePackage => ({ name, dir, deps })
const importRule = (...patterns: object[]): Linter.Config => ({
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})

describe('checkRepo', () => {
  let root: string
  const repo = (workspaceYaml: string) => {
    root = mkdtempSync(join(tmpdir(), 'dazbee-deps-'))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), workspaceYaml)
  }
  const pkg = (dir: string, json: object) => {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(json))
  }
  const eslintConfig = (dir: string, config: Linter.Config[]) => {
    writeFileSync(join(root, dir, 'eslint.config.js'), `export default ${JSON.stringify(config)}\n`)
  }
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('reads every workspace listed in pnpm-workspace.yaml and checks all dependency fields', async () => {
    repo('packages:\n  - apps/*\n  - packages/*\n')
    pkg('apps/web', { name: '@dazbee/web' })
    pkg('packages/doc', { name: '@dazbee/doc', devDependencies: { '@dazbee/web': 'workspace:*' } })

    expect(await checkRepo(root)).toEqual(['@dazbee/doc (a package) depends on @dazbee/web (an app)'])
  })

  it('fails instead of passing when a workspace pattern is not understood', async () => {
    repo('packages:\n  - apps/*\n  - packages/**\n')
    pkg('apps/web', { name: '@dazbee/web' })

    expect(await checkRepo(root)).toEqual(['pnpm-workspace.yaml: cannot check the pattern "packages/**"; use "dir/*"'])
  })

  it('fails instead of passing when no workspace packages are found', async () => {
    repo('packages:\n  - apps/*\n')

    expect(await checkRepo(root)).toEqual(['pnpm-workspace.yaml: no workspace packages found'])
  })

  it('fails when a workspace package has no name', async () => {
    repo('packages:\n  - apps/*\n')
    pkg('apps/web', {})

    expect(await checkRepo(root)).toEqual(['apps/web/package.json: missing "name"'])
  })

  it("fails when a block of a package's ESLint config sets no-restricted-imports without adr0001Pattern", async () => {
    repo('packages:\n  - packages/*\n')
    pkg('packages/doc', { name: '@dazbee/doc', type: 'module' })
    eslintConfig('packages/doc', [
      importRule(adr0001Pattern),
      { files: ['src/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['yjs'] }] } },
    ])

    expect(await checkRepo(root)).toEqual([
      'packages/doc/eslint.config.js: block 1 (src/**/*.ts) sets no-restricted-imports without adr0001Pattern from @dazbee/config/eslint',
    ])
  })

  it('fails when a block of the web ESLint config sets no-restricted-imports without the ../ and subfolder ban', async () => {
    repo('packages:\n  - apps/*\n')
    pkg('apps/web', { name: '@dazbee/web', type: 'module' })
    eslintConfig('apps/web', [importRule(adr0001Pattern, ...webAliasPatterns), importRule(adr0001Pattern)])

    expect(await checkRepo(root)).toEqual([
      'apps/web/eslint.config.js: block 1 sets no-restricted-imports without webAliasPatterns from @dazbee/config/eslint',
    ])
  })
})

describe('findViolations', () => {
  it('flags a package that depends on an app', () => {
    const violations = findViolations([
      workspacePackage('@dazbee/web', 'apps/web'),
      workspacePackage('@dazbee/schema', 'packages/schema', ['@dazbee/web']),
    ])
    expect(violations).toEqual(['@dazbee/schema (a package) depends on @dazbee/web (an app)'])
  })

  it('flags a package that depends on a test suite', () => {
    const violations = findViolations([
      workspacePackage('@dazbee/e2e', 'tests/e2e'),
      workspacePackage('@dazbee/doc', 'packages/doc', ['@dazbee/e2e']),
    ])
    expect(violations).toEqual(['@dazbee/doc (a package) depends on @dazbee/e2e (a test suite)'])
  })

  it('flags a core package that depends on one later in schema → doc → renderer → editor', () => {
    const violations = findViolations([
      workspacePackage('@dazbee/schema', 'packages/schema', ['@dazbee/renderer']),
      workspacePackage('@dazbee/renderer', 'packages/renderer'),
    ])
    expect(violations).toEqual([
      '@dazbee/schema depends on @dazbee/renderer, which comes later in schema → doc → renderer → editor',
    ])
  })

  it('allows core packages to depend downward and apps and tests to depend on anything below them', () => {
    const violations = findViolations([
      workspacePackage('@dazbee/schema', 'packages/schema'),
      workspacePackage('@dazbee/doc', 'packages/doc', ['@dazbee/schema']),
      workspacePackage('@dazbee/renderer', 'packages/renderer', ['@dazbee/doc', '@dazbee/schema', '@dazbee/fonts']),
      workspacePackage('@dazbee/fonts', 'packages/fonts'),
      workspacePackage('@dazbee/editor', 'packages/editor', ['@dazbee/renderer']),
      workspacePackage('@dazbee/web', 'apps/web', ['@dazbee/editor']),
      workspacePackage('@dazbee/e2e', 'tests/e2e', ['@dazbee/web']),
    ])
    expect(violations).toEqual([])
  })
})
