// Shared ESLint preset: import it from a package's own eslint.config.js.
import js from '@eslint/js'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * ADR-0001: reach other workspaces through their declared package name, never a relative path, so the
 * dependency-direction check sees every edge. Every block that sets `no-restricted-imports` spreads this
 * in, because a later block's options replace an earlier block's; `dazbee-check-deps` fails a block without it.
 */
export const adr0001Pattern = {
  regex: '^(\\.\\./)+(apps|packages|tests)/',
  message: 'Import another workspace by its package name and declare it in package.json.',
}

/**
 * apps/web imports a file outside the importer's own folder through `@/`, never `../` or `./dir/…`, so an
 * import's text names the folder it reaches. Every `no-restricted-imports` block in apps/web spreads these in.
 */
export const webAliasPatterns = [
  { regex: '^\\.\\./', message: "Import a file outside this folder through '@/'." },
  { regex: '^\\./[^/]+/', message: "Import a file in a subfolder through '@/'." },
]

/** Import groups, in order: side effects, `node:` built-ins, npm packages, `@dazbee/*`, `@/`, then relative paths. */
const IMPORT_GROUPS = [['^\\u0000'], ['^node:'], ['^@?\\w'], ['^@dazbee/'], ['^@/'], ['^\\.']]

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'no-restricted-imports': ['error', { patterns: [adr0001Pattern] }],
      'simple-import-sort/imports': ['error', { groups: IMPORT_GROUPS }],
    },
  },
)
