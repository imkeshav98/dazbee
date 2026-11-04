// The sync server refuses every connection without a valid token for the design it opens (#34), and
// compacts a design once its last connection leaves (#57).
// Runs against Postgres from Docker Compose, like the API's seam tests.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'

import { HocuspocusProvider } from '@hocuspocus/provider'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { brands, designs, designStates, migrateDatabase, openDatabase, readDesignState, workspaces } from '@dazbee/db'
import { signSyncToken } from '@dazbee/sync-token'

import { createSyncServer } from './server.ts'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://dazbee:dazbee-local@127.0.0.1:55432/dazbee'
const { db, close } = openDatabase(DATABASE_URL)
const secret = 'sync-test-secret-'.padEnd(32, 'x')
const server = createSyncServer({ db, secret, port: 0 })
let url = ''

const run = randomUUID().slice(0, 8)
const design = `design-${run}`
const other = `design-other-${run}`
const tidy = `design-tidy-${run}`
const who = { workspaceId: `workspace-${run}`, userId: 'user-1' }

beforeAll(async () => {
  await migrateDatabase(db)
  await db.insert(workspaces).values({ id: who.workspaceId, name: 'Workspace' })
  await db.insert(brands).values({ id: `brand-${run}`, workspaceId: who.workspaceId, name: 'Brand' })
  await db.insert(designs).values(
    [design, other, tidy].map((id) => ({
      id,
      workspaceId: who.workspaceId,
      brandId: `brand-${run}`,
      name: id,
    })),
  )
  const doc = new Y.Doc()
  doc.getMap('meta').set('name', 'stored')
  await db.insert(designStates).values([
    { designId: design, state: Y.encodeStateAsUpdate(doc) },
    { designId: tidy, state: Y.encodeStateAsUpdate(withDeletedLayer()) },
  ])
  await server.listen()
  url = `ws://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`
})
afterAll(async () => {
  await server.destroy()
  await close()
})

/** A box's props, as a layer's `props` map keeps them. */
const BOX = { x: 10, y: 10, width: 40, height: 40, shape: { kind: 'rect' } }

/** A page with one frame `f`, and layers as the doc keeps them: one live in `f`, one deleted, one whose frame is gone. */
function withDeletedLayer() {
  const doc = new Y.Doc()
  const map = (json: Record<string, unknown>) => new Y.Map<unknown>(Object.entries(json))
  const layer = (id: string, parentId: string, deleted: boolean) => {
    const node = map({ type: 'graphic', parentId, link: id, index: 'a0', name: 'Box', ...(deleted && { deleted }) })
    node.set('props', map(BOX))
    return node
  }
  doc.transact(() => {
    doc.getMap('pages').set('p1', map({ name: 'Page 1', order: 'a0' }))
    doc
      .getMap('frames')
      .set('f', map({ pageId: 'p1', name: 'Square', width: 100, height: 100, x: 0, y: 0, fills: [], order: 'a0' }))
    doc.getMap('nodes').set('live', layer('live', 'f', false))
    doc.getMap('nodes').set('gone', layer('gone', 'f', true))
    doc.getMap('nodes').set('lost', layer('lost', 'deleted-frame', false))
  })
  return doc
}

/** Connects with `token` and reports whether the server let the design open. */
function connect(name: string, token: string | null) {
  const document = new Y.Doc()
  return new Promise<{ outcome: 'synced' | 'refused'; document: Y.Doc }>((resolve) => {
    const provider = new HocuspocusProvider({
      url,
      name,
      document,
      token,
      onSynced: () => finish('synced'),
      onAuthenticationFailed: () => finish('refused'),
    })
    function finish(outcome: 'synced' | 'refused') {
      provider.destroy()
      resolve({ outcome, document })
    }
  })
}

describe('sync server tokens', () => {
  it('opens the design for a valid token, with its stored state', async () => {
    const { outcome, document } = await connect(design, signSyncToken(secret, { designId: design, ...who }).token)
    expect(outcome).toBe('synced')
    expect(document.getMap('meta').get('name')).toBe('stored')
  })

  it('refuses a connection without a token', async () => {
    expect((await connect(design, null)).outcome).toBe('refused')
  })

  it('refuses an expired token', async () => {
    const { token } = signSyncToken(secret, { designId: design, ...who }, Date.now() - 11 * 60 * 1000)
    expect((await connect(design, token)).outcome).toBe('refused')
  })

  it('refuses a token for another design', async () => {
    const { token } = signSyncToken(secret, { designId: other, ...who })
    const { outcome, document } = await connect(design, token)
    expect(outcome).toBe('refused')
    expect(document.getMap('meta').size).toBe(0)
  })

  it('refuses a token signed with another secret', async () => {
    const { token } = signSyncToken('someone-else-'.padEnd(32, 'y'), { designId: design, ...who })
    expect((await connect(design, token)).outcome).toBe('refused')
  })
})

describe('compaction', () => {
  const token = () => signSyncToken(secret, { designId: tidy, ...who }).token
  /** A tab that stays connected until it leaves. */
  function open() {
    const document = new Y.Doc()
    return new Promise<{ document: Y.Doc; leave: () => void }>((resolve) => {
      const provider = new HocuspocusProvider({
        url,
        name: tidy,
        document,
        token: token(),
        onSynced: () => resolve({ document, leave: () => provider.destroy() }),
      })
    })
  }
  const keys = (doc: Y.Doc, name: string) => [...doc.getMap(name).keys()].sort()
  const stored = async () => {
    const state = await readDesignState(db, tidy)
    const doc = new Y.Doc()
    if (state) Y.applyUpdate(doc, state)
    return doc
  }
  const until = async (ok: () => Promise<boolean>) => {
    for (let i = 0; i < 100 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 50))
  }

  it('waits while anyone is connected, then drops deleted layers and layers in no frame, and stores the result', async () => {
    const first = await open()
    const second = await open()
    expect(keys(second.document, 'nodes')).toEqual(['gone', 'live', 'lost'])
    first.leave()
    // The other tab is still here, so nothing changes under it.
    await new Promise((r) => setTimeout(r, 800))
    expect(keys(second.document, 'nodes')).toEqual(['gone', 'live', 'lost'])
    expect(keys(await stored(), 'nodes')).toEqual(['gone', 'live', 'lost'])

    second.leave()
    await until(async () => keys(await stored(), 'nodes').length === 1)
    const after = await stored()
    expect(keys(after, 'nodes')).toEqual(['live'])
    expect(keys(after, 'pages')).toEqual(['p1'])
    expect(keys(after, 'frames')).toEqual(['f'])

    // Coming back, a tab sees the same live layer.
    const again = await open()
    expect(keys(again.document, 'nodes')).toEqual(['live'])
    expect(again.document.getMap<Y.Map<unknown>>('nodes').get('live')?.toJSON()).toEqual({
      type: 'graphic',
      parentId: 'f',
      link: 'live',
      index: 'a0',
      name: 'Box',
      props: BOX,
    })
    again.leave()
  })
})
