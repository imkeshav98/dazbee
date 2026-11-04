import { defineConfig } from 'drizzle-kit'

// `pnpm --filter @dazbee/db migration` writes the initial migration from tables.ts; never edit it by hand.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/tables.ts',
  out: './migrations',
})
