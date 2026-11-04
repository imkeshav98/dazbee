import preset, { adr0001Pattern } from '@dazbee/config/eslint'

export default [
  ...preset,
  {
    // Only editor.ts and save-state.ts reach the Yjs document and its providers, so nothing else in
    // the editor can get at the document without a command; tests may, to fake a provider.
    files: ['**/*.ts'],
    ignores: ['src/editor.ts', 'src/save-state.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            adr0001Pattern,
            {
              regex: '^(yjs|y-indexeddb|@hocuspocus/provider)(/|$)',
              message: 'Only editor.ts and save-state.ts import yjs, y-indexeddb or @hocuspocus/provider.',
            },
          ],
        },
      ],
    },
  },
]
