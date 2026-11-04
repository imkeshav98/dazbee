// A design's picture through its route, against Postgres from Docker Compose
// (`docker compose up -d --wait postgres`).
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { writeDesignState } from '@dazbee/db'
import { loadDesign } from '@dazbee/doc'
import { DesignSummary, DesignThumbnail } from '@dazbee/schema'

import { readImageHeader } from '../assets/images.ts'
import { brand, call, db, sibling } from '../test-api.ts'

// A design's picture for the home's bento (#84), drawn with CanvasKit like an export.
describe('design thumbnails', { timeout: 30_000 }, () => {
  /**
   * A first page with no frame, then a page whose first frame by order is a story, listed after a
   * square: the cover frame is the story.
   */
  const story = (color: string) => ({
    meta: { designId: 'ignored', name: 'Story' },
    pages: { p1: { name: 'Empty', order: 'a0' }, p2: { name: 'Page 2', order: 'a1' } },
    frames: {
      sq: {
        pageId: 'p2',
        name: 'Square',
        width: 1080,
        height: 1080,
        x: 1280,
        y: 0,
        fills: [{ type: 'solid', color }],
        order: 'a1',
      },
      st: {
        pageId: 'p2',
        name: 'Story',
        width: 1080,
        height: 1920,
        x: 0,
        y: 0,
        fills: [{ type: 'solid', color }],
        order: 'a0',
      },
    },
    nodes: {},
  })
  const keyOf = (url: string) => new URL(url).pathname

  it('draws the cover frame, at most 640 a side, once per version', async () => {
    const { json } = await call('a', 'POST', `/brands/${brand.id}/designs`, {
      name: 'Story',
      content: story('#FF48B0FF'),
    })
    const design = DesignSummary.parse(json)
    const first = DesignThumbnail.parse(
      (await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/thumbnail`)).json,
    )
    // The cover frame's own size, so a tile can be tall before the picture loads.
    expect([first.width, first.height]).toEqual([1080, 1920])
    expect((await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/cover`)).json).toEqual({
      width: 1080,
      height: 1920,
    })
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

  it('has no picture or cover for a design with no frame on any page', async () => {
    const content = { meta: { designId: 'ignored', name: 'Empty' }, pages: { p1: { name: 'Page 1', order: 'a0' } } }
    const design = DesignSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/designs`, {
          name: 'Empty',
          content: { ...content, frames: {}, nodes: {} },
        })
      ).json,
    )
    const nothing = { error: 'This design has nothing to show yet' }
    expect(await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/thumbnail`)).toEqual({
      status: 404,
      json: nothing,
    })
    expect(await call('a', 'GET', `/brands/${brand.id}/designs/${design.id}/cover`)).toEqual({
      status: 404,
      json: nothing,
    })
  })
})
