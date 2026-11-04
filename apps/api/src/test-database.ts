// Vitest's global setup: brings the test database up to the latest migration once, so test files
// running side by side never migrate it at the same time.
import { migrateDatabase, openDatabase } from '@dazbee/db'

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://dazbee:dazbee-local@127.0.0.1:55432/dazbee'

export async function setup() {
  const { db, close } = openDatabase(DATABASE_URL)
  try {
    await migrateDatabase(db)
  } finally {
    await close()
  }
}
