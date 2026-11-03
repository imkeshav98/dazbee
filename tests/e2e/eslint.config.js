import preset, { adr0001Pattern } from '@dazbee/config/eslint'

export default [
  ...preset,
  {
    // Specs take `test` from support/test.ts, which fails a test on page errors, console errors and failed requests.
    files: ['specs/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@playwright/test', message: "Import test and expect from '../support/test.ts'." }],
          patterns: [adr0001Pattern],
        },
      ],
    },
  },
]
