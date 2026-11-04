// The workspace, brand and design routes, against Postgres from Docker Compose
// (`docker compose up -d --wait postgres`).
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { readDesignState, writeDesignState } from '@dazbee/db'
import { readDesign } from '@dazbee/doc'
import { ApiError, BrandSummary, DesignSummary, SyncToken, WorkspaceSummary } from '@dazbee/schema'
import { verifySyncToken } from '@dazbee/sync-token'

import {
  app,
  authorization,
  brand,
  call,
  db,
  other,
  otherBrand,
  personA,
  run,
  sibling,
  syncSecret,
  workspace,
} from '../test-api.ts'

describe('the workspace', () => {
  it('answers with the session’s own workspace', async () => {
    expect(WorkspaceSummary.parse((await call('a', 'GET', '/workspace')).json)).toEqual(workspace)
    expect(WorkspaceSummary.parse((await call('b', 'GET', '/workspace')).json)).toEqual(other)
  })

  it('renames the session’s workspace only, trimmed, and refuses an empty name or an empty change', async () => {
    const renamed = await call('b', 'PATCH', '/workspace', { name: '  Northwind Studio ' })
    expect(WorkspaceSummary.parse(renamed.json)).toEqual({ ...other, name: 'Northwind Studio' })
    expect(WorkspaceSummary.parse((await call('a', 'GET', '/workspace')).json).name).toBe(workspace.name)
    expect((await call('b', 'PATCH', '/workspace', { name: '   ' })).status).toBe(400)
    expect((await call('b', 'PATCH', '/workspace', {})).status).toBe(400)
    await call('b', 'PATCH', '/workspace', { name: other.name })
  })
})

describe('designs per brand', () => {
  it('creates, lists and opens a design', async () => {
    const created = await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Spring sale' })
    expect(created.status).toBe(201)
    const design = DesignSummary.parse(created.json)
    expect(design).toMatchObject({ brandId: brand.id, name: 'Spring sale' })
    expect(created.json).not.toHaveProperty('kind')

    const listed = await call('a', 'GET', `/brands/${brand.id}/designs`)
    expect(
      DesignSummary.array()
        .parse(listed.json)
        .map((d) => d.id),
    ).toEqual([design.id])

    const opened = await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}`)
    expect(opened).toEqual({ status: 200, json: design })
  })

  it('starts a design as one page holding one empty, white 1080×1080 frame, already in the store for the sync server', async () => {
    const { json } = await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Blank' })
    const { id } = DesignSummary.parse(json)
    const state = await readDesignState(db, id)
    if (!state) throw new Error('no state')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    expect(readDesign(doc)).toEqual({
      meta: { designId: id, name: 'Blank' },
      pages: { p1: { name: 'Page 1', order: 'a0' } },
      frames: {
        f1: {
          pageId: 'p1',
          name: 'Feed square',
          width: 1080,
          height: 1080,
          x: 0,
          y: 0,
          fills: [{ type: 'solid', color: '#FFFFFFFF' }],
          order: 'a0',
        },
      },
      nodes: {},
    })
  })

  it('starts a design from given content, under its own id and name', async () => {
    const portrait = (pageId: string) => ({
      pageId,
      name: 'Portrait',
      width: 1080,
      height: 1350,
      x: 0,
      y: 0,
      fills: [],
      order: 'a0',
    })
    const content = {
      meta: { designId: 'ignored', name: 'Ignored' },
      pages: { p1: { name: 'Card 1', order: 'a0' }, p2: { name: 'Card 2', order: 'a1' } },
      frames: { 'p1-pt': portrait('p1'), 'p2-pt': portrait('p2') },
      nodes: {},
    }
    const { status, json } = await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Carousel', content })
    expect(status).toBe(201)
    const { id } = DesignSummary.parse(json)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, (await readDesignState(db, id)) ?? new Uint8Array())
    expect(readDesign(doc)).toEqual({ ...content, meta: { designId: id, name: 'Carousel' } })
  })

  it('lists only the asked brand’s designs, newest change first', async () => {
    const first = DesignSummary.parse(
      (await call('a', 'POST', `/brands/${sibling.id}/designs`, { name: 'First' })).json,
    )
    const second = DesignSummary.parse(
      (await call('a', 'POST', `/brands/${sibling.id}/designs`, { name: 'Second' })).json,
    )
    const { json } = await call('a', 'GET', `/brands/${sibling.id}/designs`)
    expect(
      DesignSummary.array()
        .parse(json)
        .map((d) => d.id),
    ).toEqual([second.id, first.id])
  })

  it('lists and creates brands within the workspace only', async () => {
    const created = await call('a', 'POST', '/brands', { name: 'New brand' })
    expect(created.status).toBe(201)
    const { json } = await call('a', 'GET', '/brands')
    expect(
      BrandSummary.array()
        .parse(json)
        .map((c) => c.name),
    ).toEqual(['Brand A', 'Brand A2', 'New brand'])
    const theirs = await call('b', 'GET', '/brands')
    expect(
      BrandSummary.array()
        .parse(theirs.json)
        .map((c) => c.id),
    ).toEqual([otherBrand.id])
  })
})

describe('refusals', () => {
  it('refuses every route without a session', async () => {
    for (const [method, path] of [
      ['GET', '/workspace'],
      ['PATCH', '/workspace'],
      ['GET', '/brands'],
      ['POST', '/brands'],
      ['GET', `/brands/${brand.id}/designs`],
      ['POST', `/brands/${brand.id}/designs`],
    ] as const) {
      const response = await call(null, method, path, method === 'GET' ? undefined : { name: 'x' })
      expect(response, `${method} ${path}`).toEqual({ status: 401, json: { error: 'Sign in first' } })
    }
  })

  it('answers another workspace’s brand and design as if they did not exist', async () => {
    const theirs = DesignSummary.parse(
      (await call('b', 'POST', `/brands/${otherBrand.id}/designs`, { name: 'Theirs' })).json,
    )
    expect((await call('a', 'GET', `/brands/${otherBrand.id}/designs`)).status).toBe(404)
    expect((await call('a', 'GET', `/brands/${otherBrand.id}/designs/${theirs.id}`)).status).toBe(404)
    expect((await call('a', 'POST', `/brands/${otherBrand.id}/designs`, { name: 'Sneaky' })).status).toBe(404)
    // The owner still sees it.
    expect((await call('b', 'GET', `/brands/${otherBrand.id}/designs/${theirs.id}`)).status).toBe(200)

    // Every brand route answers "No such brand", for another workspace's brand and for one that doesn't
    // exist, before it reads the body: the empty body would be refused as not valid.
    for (const brandId of [otherBrand.id, `no-such-brand-${run}`]) {
      for (const [method, path] of [
        ['GET', 'designs'],
        ['POST', 'designs'],
        ['GET', `designs/${theirs.id}`],
        ['PATCH', `designs/${theirs.id}`],
        ['DELETE', `designs/${theirs.id}`],
        ['POST', `designs/${theirs.id}/duplicate`],
        ['GET', `designs/${theirs.id}/cover`],
        ['GET', `designs/${theirs.id}/thumbnail`],
        ['POST', `designs/${theirs.id}/sync-token`],
        ['GET', 'assets'],
        ['POST', 'assets/uploads'],
        ['POST', 'assets'],
        ['GET', 'assets/any'],
        ['PATCH', 'assets/any'],
        ['GET', 'assets/any/uses'],
        ['DELETE', 'assets/any'],
        ['GET', 'assets/any/thumbnail'],
        ['GET', 'templates'],
        ['POST', 'templates'],
        ['PATCH', 'templates/any'],
        ['DELETE', 'templates/any'],
        ['GET', 'templates/any/thumbnail'],
        ['POST', 'templates/any/designs'],
        ['GET', 'kit'],
        ['PUT', 'kit'],
        ['GET', 'fonts'],
        ['POST', 'fonts/uploads'],
        ['POST', 'fonts'],
        ['GET', 'fonts/faces/any'],
      ] as const) {
        const response = await call('a', method, `/brands/${brandId}/${path}`, method === 'GET' ? undefined : {})
        expect(response, `${method} /brands/${brandId}/${path}`).toEqual({
          status: 404,
          json: { error: 'No such brand' },
        })
      }
    }
  })

  it('refuses a design opened under another brand of the same workspace', async () => {
    const design = DesignSummary.parse((await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Mine' })).json)
    const { status, json } = await call('a', 'GET', `/brands/${sibling.id}/designs/${design.id}`)
    expect(status).toBe(404)
    expect(ApiError.parse(json).error).toBe('No such design')
  })

  it('refuses a bad body and a design that is not valid, saying why', async () => {
    const empty = await call('a', 'POST', `/brands/${brand.id}/designs`, { name: '  ' })
    expect(empty.status).toBe(400)
    expect(ApiError.parse(empty.json).error).toMatch(/^name:/)
    const broken = await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Broken', content: { meta: {} } })
    expect(broken.status).toBe(400)
    expect(ApiError.parse(broken.json).error).toMatch(/^The design is not valid: /)
    const notJson = await app.request(`/brands/${brand.id}/designs`, {
      method: 'POST',
      headers: authorization('a'),
      body: '{',
    })
    expect(notJson.status).toBe(400)
  })
})

describe('sync tokens', () => {
  it('issues a token for a design the session may open, good for that design only', async () => {
    const design = DesignSummary.parse(
      (await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Tokened' })).json,
    )
    const { status, json } = await call('a', 'POST', `/brands/${brand.id}/designs/${design.id}/sync-token`)
    expect(status).toBe(200)
    const { token, expiresAt } = SyncToken.parse(json)
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())
    expect(verifySyncToken(syncSecret, token, design.id)).toMatchObject({
      ok: true,
      payload: { designId: design.id, workspaceId: workspace.id, userId: personA.id },
    })
    expect(verifySyncToken(syncSecret, token, 'another-design')).toEqual({
      ok: false,
      reason: 'token for another design',
    })
  })

  it('issues none without a session, for another workspace, or under another brand', async () => {
    const mine = DesignSummary.parse((await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Mine' })).json)
    expect((await call(null, 'POST', `/brands/${brand.id}/designs/${mine.id}/sync-token`)).status).toBe(401)
    expect((await call('b', 'POST', `/brands/${brand.id}/designs/${mine.id}/sync-token`)).status).toBe(404)
    expect((await call('a', 'POST', `/brands/${sibling.id}/designs/${mine.id}/sync-token`)).status).toBe(404)
  })
})

describe('renaming, copying and deleting designs (#159)', () => {
  it('renames, copies and deletes a design of the brand, and nothing of another workspace', async () => {
    const design = DesignSummary.parse((await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Draft' })).json)
    const renamed = await call('a', 'PATCH', `/brands/${brand.id}/designs/${design.id}`, { name: '  Spring launch ' })
    expect(DesignSummary.parse(renamed.json)).toMatchObject({ id: design.id, name: 'Spring launch' })
    expect((await call('a', 'PATCH', `/brands/${brand.id}/designs/${design.id}`, { name: '  ' })).status).toBe(400)
    expect((await call('b', 'PATCH', `/brands/${brand.id}/designs/${design.id}`, { name: 'Taken' })).status).toBe(404)

    // A copy has the content under its own id, named after the original.
    const copied = await call('a', 'POST', `/brands/${brand.id}/designs/${design.id}/duplicate`, {})
    expect(copied.status).toBe(201)
    const copy = DesignSummary.parse(copied.json)
    expect(copy).toMatchObject({ name: 'Spring launch copy', brandId: brand.id })
    expect(copy.id).not.toBe(design.id)
    const state = await readDesignState(db, copy.id)
    if (!state) throw new Error('no state')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    expect(readDesign(doc).meta).toMatchObject({ designId: copy.id, name: 'Spring launch copy' })

    // Deleting takes the design and its state; the copy stays.
    expect((await call('b', 'DELETE', `/brands/${brand.id}/designs/${design.id}`)).status).toBe(404)
    expect((await call('a', 'DELETE', `/brands/${brand.id}/designs/${design.id}`)).status).toBe(204)
    expect((await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}`)).status).toBe(404)
    expect(await readDesignState(db, design.id)).toBeNull()
    expect((await call('a', 'DELETE', `/brands/${brand.id}/designs/${design.id}`)).status).toBe(404)
    expect((await call('a', 'GET', `/brands/${brand.id}/designs/${copy.id}`)).status).toBe(200)
    // The sync server storing a deleted design's state is a no-op, not an error.
    await expect(writeDesignState(db, design.id, state)).resolves.toBeUndefined()
    expect(await readDesignState(db, design.id)).toBeNull()
  })
})
