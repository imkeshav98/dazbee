// The API seam, against Postgres from Docker Compose (`docker compose up -d --wait postgres`).
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { writeDesignState } from '@dazbee/db'
import { loadDesign } from '@dazbee/doc'
import { DesignSummary, DesignThumbnail } from '@dazbee/schema'

import { readImageHeader } from '../assets/images.ts'
import { brand, call, db, sibling } from '../test-api.ts'

// A design's picture for the home's bento (#84), drawn with CanvasKit like an export.
describe('design thumbnails', { timeout: 30_000 }, () => {
  const story = (color: string) => ({
    meta: { schemaVersion: 5, designId: 'ignored', name: 'Story', kind: 'single', primaryFormatId: 'st' },
    formats: {
      sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
      st: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
    },
    pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color }] } },
    nodes: {},
    overrides: {},
  })
  const keyOf = (url: string) => new URL(url).pathname

  it('draws the first page in the primary format, at most 640 a side, once per version', async () => {
    const { json } = await call('a', 'POST', `/brands/${brand.id}/designs`, {
      name: 'Story',
      content: story('#FF48B0FF'),
    })
    const design = DesignSummary.parse(json)
    const first = DesignThumbnail.parse(
      (await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/thumbnail`)).json,
    )
    // The format's own size, so a tile can be tall before the picture loads.
    expect([first.width, first.height]).toEqual([1080, 1920])
    const bytes = new Uint8Array(await (await fetch(first.url)).arrayBuffer())
    expect(readImageHeader(bytes)).toEqual({ contentType: 'image/png', width: 360, height: 640 })
    // Asked again, the same stored picture.
    const again = DesignThumbnail.parse(
      (await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/thumbnail`)).json,
    )
    expect(keyOf(again.url)).toBe(keyOf(first.url))
    // Once the design changes, a new one.
    const blue = story('#3D6BFFFF')
    await writeDesignState(
      db,
      design.id,
      Y.encodeStateAsUpdate(loadDesign({ ...blue, meta: { ...blue.meta, designId: design.id } } as never)),
    )
    const changed = DesignThumbnail.parse(
      (await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/thumbnail`)).json,
    )
    expect(keyOf(changed.url)).not.toBe(keyOf(first.url))
  })

  it("keeps a design's picture to its brand and workspace", async () => {
    const design = DesignSummary.parse((await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Mine' })).json)
    expect((await call('a', 'GET', `/brands/${sibling.id}/designs/${design.id}/thumbnail`)).status).toBe(404)
    expect((await call('b', 'GET', `/brands/${brand.id}/designs/${design.id}/thumbnail`)).status).toBe(404)
  })
})
