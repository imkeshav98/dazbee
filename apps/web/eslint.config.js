import react from 'eslint-plugin-react'
import globals from 'globals'

import preset, { adr0001Pattern, webAliasPatterns } from '@dazbee/config/eslint'

// The paths after `@/` that a folder may import, as regexes.
const UI = 'components/ui/'
const LIBRARY = 'components/library/'
const BRANDS = 'components/brands/'
const BRIEF = 'components/brief/'
const BRAND_KIT = 'components/brand-kit/'
const EDITOR = 'components/editor/'
const ACTIONS = String.raw`app/(.+/)?actions\.ts$`
const LIB = 'lib/[^/]+$'
const I18N = 'lib/i18n/'
const SERVER = 'lib/server/'
const LIB_EDITOR = 'lib/editor/'
const SCRIPTS = 'scripts/'

/** How lint's message names the paths whose regex doesn't read as a folder. */
const LABELS = { [ACTIONS]: 'app/**/actions.ts', [LIB]: 'lib/ root files' }

/**
 * The folder table in docs/agents/code-layout.md: what each folder of the app may import, beside npm
 * packages and `@dazbee/*`. `app/` may import everything, so it has no row.
 */
const FOLDERS = [
  [['components/ui/**'], [UI, LIB, I18N, ACTIONS]],
  [
    ['components/library/**', 'components/brands/**', 'components/brief/**'],
    [LIBRARY, BRANDS, BRIEF, UI, BRAND_KIT, LIB, I18N, SERVER, ACTIONS],
  ],
  [['components/brand-kit/**'], [BRAND_KIT, UI, LIB, I18N, ACTIONS]],
  [['components/editor/**'], [EDITOR, UI, BRAND_KIT, LIB, I18N, LIB_EDITOR, ACTIONS]],
  [['lib/*'], [LIB, I18N]],
  [['lib/editor/**'], [LIB_EDITOR, LIB, I18N]],
  [['lib/server/**'], [SERVER, LIB, I18N]],
  [['lib/i18n/**'], [I18N]],
  [['scripts/**'], [SCRIPTS]],
]

/** A block that fails an `@/` import of any path outside `paths`, keeping the patterns every block needs. */
function mayImport(files, paths) {
  const pattern = {
    regex: `^@/(?!(${paths.join('|')}))`,
    message: `${files.join(', ')} may import only ${paths.map((p) => LABELS[p] ?? p).join(', ')}, npm packages and @dazbee/* (docs/agents/code-layout.md).`,
  }
  return {
    files,
    rules: { 'no-restricted-imports': ['error', { patterns: [adr0001Pattern, ...webAliasPatterns, pattern] }] },
  }
}

export default [
  ...preset,
  {
    // A file outside the importer's own folder is imported through `@/`, so an import names the folder it reaches.
    rules: { 'no-restricted-imports': ['error', { patterns: [adr0001Pattern, ...webAliasPatterns] }] },
  },
  ...FOLDERS.map(([files, paths]) => mayImport(files, paths)),
  {
    // The offline worker (#37) runs in a service worker, not a page.
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Every string the UI shows comes from a message catalog (lib/i18n), so components hold none.
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    plugins: { react },
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true, allowedStrings: ['/', '·'] }],
      // Chrome flags form fields with neither an id nor a name, and autofill can't tell them apart.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXOpeningElement[name.name=/^(input|select|textarea)$/]:not(:has(JSXAttribute[name.name=/^(id|name)$/])):not(:has(JSXSpreadAttribute))',
          message: 'Give every input, select and textarea a name (or an id).',
        },
      ],
    },
  },
]
