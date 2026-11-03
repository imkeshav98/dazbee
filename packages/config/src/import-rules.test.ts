import type { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { adr0001Pattern, webAliasPatterns } from '../eslint.config.js'
import { findImportRuleGaps } from './import-rules.ts'

const importRule = (...patterns: object[]): Linter.Config => ({
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})
const preset = importRule(adr0001Pattern)

// checkImportRules, which loads each package's config from disk, is covered by checkRepo's tests.

describe('findImportRuleGaps', () => {
  it('passes blocks that hold the patterns their package needs, and holds the preset to ADR-0001 only', () => {
    const editorRules: Linter.RulesRecord = {
      'no-restricted-imports': ['error', { paths: ['yjs'], patterns: [adr0001Pattern] }],
    }
    const editor = [preset, { files: ['src/**'], rules: editorRules }]
    const web = [preset, importRule(adr0001Pattern, ...webAliasPatterns)]

    expect(findImportRuleGaps('packages/editor', editor, new Set([preset]))).toEqual([])
    expect(findImportRuleGaps('apps/web', web, new Set([preset]))).toEqual([])
  })

  it('fails the web config when no block of its own sets webAliasPatterns', () => {
    expect(findImportRuleGaps('apps/web', [preset], new Set([preset]))).toEqual([
      'apps/web/eslint.config.js: no block of its own without files sets no-restricted-imports with webAliasPatterns from @dazbee/config/eslint',
    ])
  })

  it('fails the web config when its only block with webAliasPatterns covers some files, not all', () => {
    const components = { ...importRule(adr0001Pattern, ...webAliasPatterns), files: ['components/**'] }

    expect(findImportRuleGaps('apps/web', [preset, components], new Set([preset]))).toEqual([
      'apps/web/eslint.config.js: no block of its own without files sets no-restricted-imports with webAliasPatterns from @dazbee/config/eslint',
    ])
  })

  it('fails a block that sets no-restricted-imports below error', () => {
    const rules: Linter.RulesRecord = { 'no-restricted-imports': ['warn', { patterns: [adr0001Pattern] }] }

    expect(findImportRuleGaps('packages/doc', [{ rules }], new Set())).toEqual([
      'packages/doc/eslint.config.js: block 0 sets no-restricted-imports below error',
    ])
  })
})
