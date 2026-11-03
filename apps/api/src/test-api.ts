// The API as its seam tests call it: the test database and storage, two workspaces with a brand and a
// person each, `call` to ask the app as one of them, and the upload flow. A test file that imports it
// adds the workspaces before its tests and closes the database after them.
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect } from 'vitest'

import { brands, memberships, openDatabase, users, workspaces } from '@dazbee/db'
import { AssetSummary, UploadTicket } from '@dazbee/schema'
import { openStorage, storageSettings } from '@dazbee/storage'

import { createApp } from './app.ts'
import { type Session, signSessionToken, tokenSession } from './session.ts'
import { DATABASE_URL } from './test-database.ts'
import { sha256 } from './test-files.ts'

const database = openDatabase(DATABASE_URL)
export const db = database.db

// Two workspaces with a brand each, fresh for every run so runs never see each other's rows.
export const run = randomUUID().slice(0, 8)
export const workspace = { id: `workspace-a-${run}`, name: 'Agency A', kind: 'agency' as const }
export const other = { id: `workspace-b-${run}`, name: 'Studio B', kind: 'solo' as const }
export const brand = { id: `brand-a-${run}`, workspaceId: workspace.id, name: 'Brand A' }
export const sibling = { id: `brand-a2-${run}`, workspaceId: workspace.id, name: 'Brand A2' }
export const otherBrand = { id: `brand-b-${run}`, workspaceId: other.id, name: 'Brand B' }

// Real sessions (#58): a person in each workspace, signed in with a session token.
export const personA = { id: `user-a-${run}`, workosUserId: `workos-a-${run}`, email: `a-${run}@example.com` }
const personB = { id: `user-b-${run}`, workosUserId: `workos-b-${run}`, email: `b-${run}@example.com` }
const sessions: Record<string, Session> = {
  a: { userId: personA.id, workspaceId: workspace.id },
  b: { userId: personB.id, workspaceId: other.id },
}
const sessionSecret = 'test-session-secret-'.padEnd(32, 'x')
const tokens = Object.fromEntries(
  Object.entries(sessions).map(([as, session]) => [
    as,
    signSessionToken(sessionSecret, { ...session, workosSessionId: null }).token,
  ]),
)
export const authorization = (as: string) => ({ authorization: `Bearer ${tokens[as]}` })

export const syncSecret = 'test-secret-'.padEnd(32, 'x')
export const storage = openStorage(
  storageSettings({
    STORAGE_ENDPOINT: 'http://127.0.0.1:59000',
    STORAGE_BUCKET: 'razzlr-test',
    STORAGE_ACCESS_KEY_ID: 'razzlr',
    STORAGE_SECRET_ACCESS_KEY: 'razzlr-local-secret',
    STORAGE_REGION: 'us-east-1',
    ...process.env,
  }),
)
export const app = createApp({ db, storage, sessionOf: tokenSession(db, sessionSecret), syncSecret })

export async function call(as: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (as) Object.assign(headers, authorization(as))
  const response = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, json: response.status === 204 ? null : ((await response.json()) as unknown) }
}

/** Starts an image upload as `as`, PUTs the bytes when asked to, and records the asset. */
export async function uploadImage(
  as: string,
  brandId: string,
  bytes: Uint8Array,
  name?: string,
  contentType = 'image/png',
) {
  const ticket = UploadTicket.parse(
    (
      await call(as, 'POST', `/brands/${brandId}/assets/uploads`, {
        sha256: sha256(bytes),
        byteSize: bytes.length,
        contentType,
      })
    ).json,
  )
  if (ticket.asset) return { asset: ticket.asset, uploaded: false }
  const put = await fetch(ticket.upload.url, { method: 'PUT', body: bytes, headers: ticket.upload.headers })
  expect(put.status).toBe(200)
  const recorded = await call(as, 'POST', `/brands/${brandId}/assets`, {
    sha256: sha256(bytes),
    ...(name ? { name } : {}),
  })
  expect(recorded.status).toBe(201)
  return { asset: AssetSummary.parse(recorded.json), uploaded: true }
}

beforeAll(async () => {
  await storage.ensureBucket()
  await db.insert(workspaces).values([workspace, other])
  await db.insert(brands).values([brand, sibling, otherBrand])
  await db.insert(users).values([personA, personB])
  await db.insert(memberships).values([
    { workspaceId: workspace.id, userId: personA.id, role: 'owner' },
    { workspaceId: other.id, userId: personB.id, role: 'editor' },
  ])
})
afterAll(async () => {
  await database.close()
})
