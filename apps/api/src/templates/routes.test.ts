// The template routes, against Postgres from Docker Compose (`docker compose up -d --wait postgres`).
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { readDesignState } from '@dazbee/db'
import { readDesign } from '@dazbee/doc'
import { AssetSummary, type Design, DesignSummary, parseDesign, SignedLink, TemplateSummary } from '@dazbee/schema'

import { readImageHeader } from '../assets/images.ts'
import { coverOf } from '../drawing/design-thumbnails.ts'
import { renderCover } from '../drawing/render.ts'
import { brand, call, db, otherBrand, run, SHORT_ID, sibling, storage, uploadImage, workspace } from '../test-api.ts'
import { png } from '../test-files.ts'

// Saving a template draws its thumbnail with CanvasKit, which takes seconds on a busy CI runner.
describe('templates (#54)', { timeout: 60_000 }, () => {
  /** A shape, text and one of the brand's images in a square frame, each layer's link its own id. */
  const square = (assetId: string) => ({
    photo: {
      type: 'graphic',
      parentId: 'sq',
      link: 'photo',
      index: 'a0',
      name: 'Photo',
      props: {
        x: 20,
        y: 20,
        width: 200,
        height: 150,
        shape: { kind: 'rect' },
        fills: [{ type: 'image', assetId, fit: 'fill' }],
      },
    },
    dot: {
      type: 'graphic',
      parentId: 'sq',
      link: 'dot',
      index: 'a1',
      name: 'Dot',
      props: {
        x: 250,
        y: 40,
        width: 120,
        height: 120,
        shape: { kind: 'ellipse' },
        fills: [{ type: 'solid', color: '#E0262BFF' }],
      },
    },
    words: {
      type: 'text',
      parentId: 'sq',
      link: 'words',
      index: 'a2',
      name: 'Words',
      props: {
        x: 20,
        y: 250,
        width: 360,
        height: 80,
        text: 'Fresh roast',
        style: { fontFamily: 'Noto Sans', fontSize: 48, color: '#14213DFF' },
      },
    },
  })
  /** The square frame, and a wide frame beside it holding linked copies of its layers, the dot further right. */
  const content = (assetId: string) => {
    const layers = square(assetId)
    const wide: Record<string, Record<string, unknown>> = { dot: { x: 600 } }
    const background = [{ type: 'solid', color: '#FFF6E8FF' }]
    return {
      meta: { designId: 'any', name: 'Sale' },
      pages: { p1: { name: 'Page 1', order: 'a0' } },
      frames: {
        sq: { pageId: 'p1', name: 'Square', width: 400, height: 400, x: 0, y: 0, fills: background, order: 'a0' },
        wide: { pageId: 'p1', name: 'Wide', width: 800, height: 400, x: 600, y: 0, fills: background, order: 'a1' },
      },
      nodes: {
        ...layers,
        ...Object.fromEntries(
          Object.entries(layers).map(([id, layer]) => [
            `wide-${id}`,
            { ...layer, parentId: 'wide', link: id, props: { ...layer.props, ...wide[id] } },
          ]),
        ),
      },
    }
  }
  const designOf = async (designId: string) => {
    const state = await readDesignState(db, designId)
    if (!state) throw new Error('no state')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    return readDesign(doc)
  }
  /** Every id a design holds: its pages, frames, layers and link ids. */
  const ids = (d: Design) => [
    ...Object.keys(d.pages),
    ...Object.keys(d.frames),
    ...Object.keys(d.nodes),
    ...Object.values(d.nodes).map((node) => node.link),
  ]

  it('saves a brand template with a thumbnail, and starting from it gives a design with the same pixels and no shared ids', async () => {
    const photo = (await uploadImage('a', brand.id, png(64, 48, `${run}-template`))).asset
    const saved = await call('a', 'POST', `/brands/${brand.id}/templates`, {
      name: 'Sale square',
      scope: 'brand',
      content: content(photo.id),
    })
    expect(saved.status).toBe(201)
    const template = TemplateSummary.parse(saved.json)
    expect(template.id).toMatch(SHORT_ID)
    expect(template).toMatchObject({
      name: 'Sale square',
      scope: 'brand',
      brandId: brand.id,
      width: 400,
      height: 400,
    })
    const link = SignedLink.parse(
      (await call('a', 'GET', `/brands/${brand.id}/templates/${template.id}/thumbnail`)).json,
    )
    expect(readImageHeader(new Uint8Array(await (await fetch(link.url)).arrayBuffer()))).toEqual({
      contentType: 'image/png',
      width: 320,
      height: 320,
    })

    const started = await call('a', 'POST', `/brands/${brand.id}/templates/${template.id}/designs`, {})
    expect(started.status).toBe(201)
    const design = DesignSummary.parse(started.json)
    expect(design).toMatchObject({ name: 'Sale square', brandId: brand.id })
    expect(design.id).toMatch(SHORT_ID)
    const copy = await designOf(design.id)
    const original = parseDesign(content(photo.id))
    if (!original.success) throw new Error(original.errors.join('\n'))
    expect(ids(copy).filter((id) => ids(original.design).includes(id))).toEqual([])
    // The copies stay linked to each other: one new link id per old one.
    expect(Object.keys(copy.frames)).toHaveLength(2)
    expect(new Set(Object.values(copy.nodes).map((node) => node.link)).size).toBe(3)
    // The same brand: the same asset.
    expect(JSON.stringify(copy)).toContain(photo.id)
    const [a, b] = await Promise.all([
      renderCover(db, storage, workspace.id, brand.id, original.design),
      renderCover(db, storage, workspace.id, brand.id, copy),
    ])
    expect(Buffer.from(b.pixels).equals(Buffer.from(a.pixels))).toBe(true)
  })

  it("draws a template's thumbnail from its cover frame and takes its size: the first frame of the first page that has one", async () => {
    // An empty page first; then two pages at the same order, the one listed first not the one first by id.
    const square = (pageId: string, side: number, color: string) => ({
      pageId,
      name: 'Square',
      width: side,
      height: side,
      x: 0,
      y: 0,
      fills: [{ type: 'solid', color }],
      order: 'a0',
    })
    const content = {
      meta: { designId: 'any', name: 'Tie' },
      pages: {
        p0: { name: 'Empty', order: 'a0' },
        pb: { name: 'Red', order: 'a1' },
        pa: { name: 'Navy', order: 'a1' },
      },
      frames: { 'pb-sq': square('pb', 60, '#E0262BFF'), 'pa-sq': square('pa', 40, '#14213DFF') },
      nodes: {},
    }
    const parsed = parseDesign(content)
    if (!parsed.success) throw new Error(parsed.errors.join('\n'))
    expect(coverOf(parsed.design)?.frameId).toBe('pa-sq')
    const drawn = await renderCover(db, storage, workspace.id, brand.id, parsed.design)
    expect([drawn.width, drawn.height]).toEqual([40, 40])
    expect([...drawn.pixels.slice(0, 4)]).toEqual([0x14, 0x21, 0x3d, 0xff])
    const saved = await call('a', 'POST', `/brands/${brand.id}/templates`, { name: 'Tie', scope: 'brand', content })
    expect(TemplateSummary.parse(saved.json)).toMatchObject({ width: 40, height: 40 })
  })

  it('renames and deletes a template the brand can see (#159)', async () => {
    const photo = (await uploadImage('a', brand.id, png(64, 48, `${run}-template`))).asset
    const template = TemplateSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: 'Old name',
          scope: 'brand',
          content: content(photo.id),
        })
      ).json,
    )
    expect(
      TemplateSummary.parse(
        (await call('a', 'PATCH', `/brands/${brand.id}/templates/${template.id}`, { name: 'New name' })).json,
      ),
    ).toMatchObject({ id: template.id, name: 'New name' })
    // Another brand can't see a brand template, so can't change it.
    expect(
      (await call('a', 'PATCH', `/brands/${sibling.id}/templates/${template.id}`, { name: 'Theirs' })).status,
    ).toBe(404)
    expect((await call('a', 'DELETE', `/brands/${sibling.id}/templates/${template.id}`)).status).toBe(404)
    expect((await call('a', 'DELETE', `/brands/${brand.id}/templates/${template.id}`)).status).toBe(204)
    const listed = TemplateSummary.array()
      .parse((await call('a', 'GET', `/brands/${brand.id}/templates`)).json)
      .map((t) => t.id)
    expect(listed).not.toContain(template.id)
  })

  it('shows workspace templates to every brand and brand templates to their brand only', async () => {
    const photo = (await uploadImage('a', brand.id, png(64, 48, `${run}-template`))).asset
    const mine = TemplateSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: 'Mine',
          scope: 'brand',
          content: content(photo.id),
        })
      ).json,
    )
    const shared = TemplateSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: 'Agency',
          scope: 'workspace',
          content: content(photo.id),
        })
      ).json,
    )
    expect(shared).toMatchObject({ scope: 'workspace', brandId: null })
    const listed = (b: string) =>
      call('a', 'GET', `/brands/${b}/templates`).then((r) =>
        TemplateSummary.array()
          .parse(r.json)
          .map((t) => t.id),
      )
    expect(await listed(brand.id)).toEqual(expect.arrayContaining([mine.id, shared.id]))
    expect(await listed(sibling.id)).toContain(shared.id)
    expect(await listed(sibling.id)).not.toContain(mine.id)
    expect((await call('a', 'POST', `/brands/${sibling.id}/templates/${mine.id}/designs`, {})).status).toBe(404)
    expect((await call('a', 'GET', `/brands/${sibling.id}/templates/${mine.id}/thumbnail`)).status).toBe(404)
    expect((await call('b', 'GET', `/brands/${brand.id}/templates`)).status).toBe(404)
    expect((await call('b', 'POST', `/brands/${otherBrand.id}/templates/${shared.id}/designs`, {})).status).toBe(404)
  })

  it("gives another brand its own assets of a workspace template's images, drawn the same", async () => {
    const photo = (await uploadImage('a', brand.id, png(64, 48, `${run}-crossing`))).asset
    const shared = TemplateSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: 'Agency',
          scope: 'workspace',
          content: content(photo.id),
        })
      ).json,
    )
    const design = DesignSummary.parse(
      (await call('a', 'POST', `/brands/${sibling.id}/templates/${shared.id}/designs`, { name: 'For A2' })).json,
    )
    expect(design).toMatchObject({ name: 'For A2', brandId: sibling.id })
    const copy = await designOf(design.id)
    expect(JSON.stringify(copy)).not.toContain(photo.id)
    const theirs = AssetSummary.array()
      .parse((await call('a', 'GET', `/brands/${sibling.id}/assets`)).json)
      .find((x) => x.sha256 === photo.sha256)
    expect(theirs?.id).toMatch(SHORT_ID)
    expect(JSON.stringify(copy)).toContain(theirs?.id)
    const original = parseDesign(content(photo.id))
    if (!original.success) throw new Error(original.errors.join('\n'))
    const [a, b] = await Promise.all([
      renderCover(db, storage, workspace.id, brand.id, original.design),
      renderCover(db, storage, workspace.id, sibling.id, copy),
    ])
    expect(Buffer.from(b.pixels).equals(Buffer.from(a.pixels))).toBe(true)
  })

  it("refuses a design that is not valid or names another brand's image", async () => {
    const theirs = (await uploadImage('a', sibling.id, png(8, 8, `${run}-not-mine`))).asset
    expect(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: 'Bad',
          scope: 'brand',
          content: content(theirs.id),
        })
      ).json,
    ).toEqual({ error: `The design is not valid: the image "${theirs.id}" is not an asset of this brand` })
    expect(
      (await call('a', 'POST', `/brands/${brand.id}/templates`, { name: 'Bad', scope: 'brand', content: { meta: {} } }))
        .status,
    ).toBe(400)
    const frameless = { meta: { designId: 'any', name: 'Empty' }, pages: { p1: { name: 'Page 1', order: 'a0' } } }
    expect(
      await call('a', 'POST', `/brands/${brand.id}/templates`, {
        name: 'Empty',
        scope: 'brand',
        content: { ...frameless, frames: {}, nodes: {} },
      }),
    ).toEqual({ status: 400, json: { error: 'The design is not valid: the design has no frame' } })
    expect(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: '',
          scope: 'brand',
          content: content(theirs.id),
        })
      ).status,
    ).toBe(400)
  })
})
