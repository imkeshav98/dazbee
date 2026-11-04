// The image routes, against Postgres from Docker Compose (`docker compose up -d --wait postgres`).
import { describe, expect, it } from 'vitest'

import {
  AssetInUse,
  AssetLink,
  AssetSummary,
  BrandKit,
  DesignSummary,
  SignedLink,
  TemplateSummary,
  UploadTicket,
} from '@dazbee/schema'

import { brand, call, run, sibling, uploadImage } from '../test-api.ts'
import { png, sha256 } from '../test-files.ts'
import { readImageHeader } from './images.ts'

// Recording an image makes its thumbnail with CanvasKit, which takes seconds to load on a busy CI runner.
describe('image uploads', { timeout: 30_000 }, () => {
  it('uploads, records and fetches an image by asset id', async () => {
    const bytes = png(3, 2, run)
    const { asset, uploaded } = await uploadImage('a', brand.id, bytes)
    expect(uploaded).toBe(true)
    expect(asset).toMatchObject({
      brandId: brand.id,
      sha256: sha256(bytes),
      contentType: 'image/png',
      byteSize: bytes.length,
      width: 3,
      height: 2,
    })
    const link = AssetLink.parse((await call('a', 'GET', `/brands/${brand.id}/assets/${asset.id}`)).json)
    expect(link.asset).toEqual(asset)
    expect(new Uint8Array(await (await fetch(link.url)).arrayBuffer())).toEqual(bytes)
    const listed = AssetSummary.array().parse((await call('a', 'GET', `/brands/${brand.id}/assets`)).json)
    expect(listed.map((a) => a.id)).toContain(asset.id)
  })

  it('stores the same file once: a second upload gets the asset without sending bytes', async () => {
    const bytes = png(4, 4, `${run}-twice`)
    const first = await uploadImage('a', brand.id, bytes)
    const second = await uploadImage('a', brand.id, bytes)
    expect(second).toEqual({ asset: first.asset, uploaded: false })
    // Another brand of the workspace gets its own asset over the same stored original.
    const sibling$ = await uploadImage('a', sibling.id, bytes)
    expect(sibling$.uploaded).toBe(false)
    expect(sibling$.asset.id).not.toBe(first.asset.id)
  })

  it('keeps assets to their workspace and brand', async () => {
    const { asset } = await uploadImage('a', brand.id, png(5, 5, `${run}-scoped`))
    expect((await call('b', 'GET', `/brands/${brand.id}/assets/${asset.id}`)).status).toBe(404)
    expect((await call('a', 'GET', `/brands/${sibling.id}/assets/${asset.id}`)).status).toBe(404)
    expect((await call('b', 'GET', `/brands/${brand.id}/assets`)).status).toBe(404)
    expect(
      (
        await call('b', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: asset.sha256,
          byteSize: 1,
          contentType: 'image/png',
        })
      ).status,
    ).toBe(404)
    expect((await call(null, 'GET', `/brands/${brand.id}/assets/${asset.id}`)).status).toBe(401)
  })

  it('refuses to record bytes that were never uploaded, do not match, or are not an image', async () => {
    const missing = await call('a', 'POST', `/brands/${brand.id}/assets`, { sha256: 'f'.repeat(64) })
    expect(missing).toEqual({ status: 400, json: { error: 'Nothing was uploaded for that SHA-256' } })

    const text = new TextEncoder().encode(`not an image ${run}`)
    const ticket = UploadTicket.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: sha256(text),
          byteSize: text.length,
          contentType: 'image/png',
        })
      ).json,
    )
    if (!ticket.upload) throw new Error('expected an upload URL')
    await fetch(ticket.upload.url, { method: 'PUT', body: text, headers: ticket.upload.headers })
    expect((await call('a', 'POST', `/brands/${brand.id}/assets`, { sha256: sha256(text) })).json).toEqual({
      error: 'The upload is not a PNG, JPEG or WebP image, or an SVG file we can read',
    })

    // Bytes put under someone else's hash.
    const real = png(2, 2, `${run}-real`)
    const claimed = sha256(png(2, 2, `${run}-claimed`))
    const lie = UploadTicket.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: claimed,
          byteSize: real.length,
          contentType: 'image/png',
        })
      ).json,
    )
    // (Same size as the claimed bytes, so storage takes it; the API's hash check is what refuses it.)
    if (!lie.upload) throw new Error('expected an upload URL')
    await fetch(lie.upload.url, { method: 'PUT', body: real, headers: lie.upload.headers })
    expect((await call('a', 'POST', `/brands/${brand.id}/assets`, { sha256: claimed })).json).toEqual({
      error: 'The uploaded bytes do not match their SHA-256',
    })
    // The bad bytes are gone, so the real owner of that hash can still upload it.
    const honest = await uploadImage('a', brand.id, png(2, 2, `${run}-claimed`))
    expect(honest).toMatchObject({ uploaded: true, asset: { sha256: claimed } })
  })

  it('names an asset as uploaded, renames and tags it, and finds it by either (#52)', async () => {
    const { asset } = await uploadImage('a', brand.id, png(7, 3, `${run}-named`), `Summer sale ${run}.png`)
    expect(asset).toMatchObject({ name: `Summer sale ${run}.png`, tags: [] })
    const tagged = await call('a', 'PATCH', `/brands/${brand.id}/assets/${asset.id}`, {
      tags: ['Beach ', 'hero', 'beach'],
    })
    expect(tagged.status).toBe(200)
    expect(AssetSummary.parse(tagged.json).tags).toEqual(['beach', 'hero'])
    const { asset: plain } = await uploadImage('a', brand.id, png(7, 4, `${run}-plain`), `Winter ${run}.png`)

    const search = async (q: string) =>
      AssetSummary.array()
        .parse((await call('a', 'GET', `/brands/${brand.id}/assets?q=${encodeURIComponent(q)}`)).json)
        .map((a) => a.id)
    // A word finds names that have it anywhere and tags that start with it, ignoring case.
    expect(await search(`SALE ${run}`)).toEqual([asset.id])
    expect(await search(`bea ${run}`)).toEqual([asset.id])
    expect(await search('each')).not.toContain(asset.id)
    // Every word has to match; newest first.
    expect(await search(`${run}.png`)).toEqual([plain.id, asset.id])
    expect(await search(`winter hero ${run}`)).toEqual([])
    // LIKE's wildcards are only letters here.
    expect(await search(`%${run}`)).toEqual([])

    const renamed = AssetSummary.parse(
      (await call('a', 'PATCH', `/brands/${brand.id}/assets/${plain.id}`, { name: `  Winter hero ${run} ` })).json,
    )
    expect(renamed.name).toBe(`Winter hero ${run}`)
    expect(await search(`winter hero ${run}`)).toEqual([plain.id])
  })

  it('keeps names, tags and search to the brand', async () => {
    const { asset } = await uploadImage('a', brand.id, png(8, 3, `${run}-walled`), `Walled ${run}`)
    await call('a', 'PATCH', `/brands/${brand.id}/assets/${asset.id}`, { tags: [`walled-${run}`] })
    // The sibling brand uploads the same bytes and gets its own, unnamed and untagged asset.
    const { asset: theirs } = await uploadImage('a', sibling.id, png(8, 3, `${run}-walled`))
    expect(theirs).toMatchObject({ name: '', tags: [] })
    expect((await call('a', 'GET', `/brands/${sibling.id}/assets?q=walled-${run}`)).json).toEqual([])
    expect((await call('a', 'PATCH', `/brands/${sibling.id}/assets/${asset.id}`, { name: 'Mine now' })).status).toBe(
      404,
    )
    expect((await call('b', 'PATCH', `/brands/${brand.id}/assets/${asset.id}`, { name: 'Mine now' })).status).toBe(404)
  })

  it('refuses an empty name, too many tags or nothing to change', async () => {
    const { asset } = await uploadImage('a', brand.id, png(9, 3, `${run}-refused`))
    expect((await call('a', 'PATCH', `/brands/${brand.id}/assets/${asset.id}`, { name: '   ' })).status).toBe(400)
    expect(
      (
        await call('a', 'PATCH', `/brands/${brand.id}/assets/${asset.id}`, {
          tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
        })
      ).status,
    ).toBe(400)
    expect((await call('a', 'PATCH', `/brands/${brand.id}/assets/${asset.id}`, {})).status).toBe(400)
    expect((await call('a', 'GET', `/brands/${brand.id}/assets?q=${'x'.repeat(201)}`)).status).toBe(400)
  })

  it('makes a thumbnail no larger than 320 pixels a side, for the brand only', async () => {
    const { asset } = await uploadImage('a', brand.id, png(960, 600, `${run}-big`))
    const link = SignedLink.parse((await call('a', 'GET', `/brands/${brand.id}/assets/${asset.id}/thumbnail`)).json)
    const thumbnail = new Uint8Array(await (await fetch(link.url)).arrayBuffer())
    expect(readImageHeader(thumbnail)).toEqual({ contentType: 'image/png', width: 320, height: 200 })
    const { asset: small } = await uploadImage('a', brand.id, png(40, 30, `${run}-small`))
    const smallLink = SignedLink.parse(
      (await call('a', 'GET', `/brands/${brand.id}/assets/${small.id}/thumbnail`)).json,
    )
    expect(readImageHeader(new Uint8Array(await (await fetch(smallLink.url)).arrayBuffer()))).toMatchObject({
      width: 40,
      height: 30,
    })
    expect((await call('a', 'GET', `/brands/${sibling.id}/assets/${asset.id}/thumbnail`)).status).toBe(404)
  })

  it('refuses uploads that are too big or not an image type', async () => {
    expect(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: 'a'.repeat(64),
          byteSize: 31 * 1024 * 1024,
          contentType: 'image/png',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: 'a'.repeat(64),
          byteSize: 10,
          contentType: 'image/gif',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: 'a'.repeat(64),
          byteSize: 6_000_000,
          contentType: 'image/svg+xml',
        })
      ).status,
    ).toBe(400)
  })

  it("records an SVG file at its own size, with its layers drawn as the thumbnail, and refuses one it can't read (#225)", async () => {
    const svg = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 60 40"><!-- ${run} --><rect width="60" height="40" fill="#E0204F"/></svg>`,
    )
    const { asset } = await uploadImage('a', brand.id, svg, 'Logo', 'image/svg+xml')
    expect(asset).toMatchObject({ contentType: 'image/svg+xml', width: 120, height: 80, name: 'Logo' })
    const thumbnail = SignedLink.parse(
      (await call('a', 'GET', `/brands/${brand.id}/assets/${asset.id}/thumbnail`)).json,
    )
    const drawn = new Uint8Array(await (await fetch(thumbnail.url)).arrayBuffer())
    expect(readImageHeader(drawn)).toMatchObject({ contentType: 'image/png', width: 320, height: 213 })

    // A page that calls itself SVG is refused, and its bytes are dropped.
    const page = new TextEncoder().encode(`<html><body><script>alert('${run}')</script></body></html>`)
    const ticket = UploadTicket.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: sha256(page),
          byteSize: page.length,
          contentType: 'image/svg+xml',
        })
      ).json,
    )
    if (!ticket.upload) throw new Error('expected an upload URL')
    await fetch(ticket.upload.url, { method: 'PUT', body: page, headers: ticket.upload.headers })
    expect((await call('a', 'POST', `/brands/${brand.id}/assets`, { sha256: sha256(page) })).json).toEqual({
      error: 'The upload is not a PNG, JPEG or WebP image, or an SVG file we can read',
    })
  })

  it('signs an upload URL for its key, content type and size only', async () => {
    const bytes = png(6, 6, `${run}-signed`)
    const ticket = UploadTicket.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/assets/uploads`, {
          sha256: sha256(bytes),
          byteSize: bytes.length,
          contentType: 'image/png',
        })
      ).json,
    )
    if (!ticket.upload) throw new Error('expected an upload URL')
    expect(
      (await fetch(ticket.upload.url, { method: 'PUT', body: bytes, headers: { 'content-type': 'image/jpeg' } }))
        .status,
    ).toBe(403)
    expect(
      (
        await fetch(ticket.upload.url, {
          method: 'PUT',
          body: new Uint8Array([...bytes, 0]),
          headers: ticket.upload.headers,
        })
      ).status,
    ).toBe(403)
    const elsewhere = new URL(ticket.upload.url)
    elsewhere.pathname = elsewhere.pathname.replace(/[^/]+$/, 'b'.repeat(64))
    expect((await fetch(elsewhere, { method: 'PUT', body: bytes, headers: ticket.upload.headers })).status).toBe(403)
  })
})

describe('deleting images', { timeout: 60_000 }, () => {
  const withPhoto = (assetId: string) => ({
    meta: { schemaVersion: 5, designId: 'any', name: 'Any', kind: 'single', primaryFormatId: 'sq' },
    formats: { sq: { name: 'Square', width: 400, height: 400, order: 'a0' } },
    pages: { p1: { name: 'Page 1', order: 'a0' } },
    nodes: {
      photo: {
        type: 'graphic',
        parentId: 'p1',
        index: 'a0',
        name: 'Photo',
        props: {
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          shape: { kind: 'rect' },
          fills: [{ type: 'image', assetId, fit: 'fill' }],
        },
      },
    },
    overrides: {},
  })

  const listedIds = async () =>
    AssetSummary.array()
      .parse((await call('a', 'GET', `/brands/${brand.id}/assets`)).json)
      .map((a) => a.id)

  it("deletes an image nothing uses from the library, and only the brand's own; a design that names it again still draws it", async () => {
    const bytes = png(10, 10, `${run}-unused`)
    const unused = (await uploadImage('a', brand.id, bytes)).asset
    expect((await call('a', 'GET', `/brands/${brand.id}/assets/${unused.id}/uses`)).json).toEqual([])
    expect((await call('b', 'DELETE', `/brands/${brand.id}/assets/${unused.id}`)).status).toBe(404)
    expect((await call('b', 'GET', `/brands/${brand.id}/assets/${unused.id}/uses`)).status).toBe(404)
    expect((await call('a', 'DELETE', `/brands/${sibling.id}/assets/${unused.id}`)).status).toBe(404)
    expect((await call('a', 'DELETE', `/brands/${brand.id}/assets/${unused.id}`)).status).toBe(204)
    expect(await listedIds()).not.toContain(unused.id)
    expect((await call('a', 'DELETE', `/brands/${brand.id}/assets/${unused.id}`)).status).toBe(404)
    expect((await call('a', 'GET', `/brands/${brand.id}/assets/${unused.id}/uses`)).status).toBe(404)
    // Undo, or a tab not yet saved, can bring a fill of it back: it still draws.
    expect((await call('a', 'GET', `/brands/${brand.id}/assets/${unused.id}`)).status).toBe(200)
    // Uploading the same bytes again brings it back to the library, the same asset.
    expect((await uploadImage('a', brand.id, bytes)).asset.id).toBe(unused.id)
    expect(await listedIds()).toContain(unused.id)
  })

  it('refuses to delete an image a design, a template or the logo shows, naming them; it goes once none does', async () => {
    const used = (await uploadImage('a', brand.id, png(11, 11, `${run}-used`))).asset
    const design = DesignSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/designs`, {
          name: `Shop window ${run}`,
          content: withPhoto(used.id),
        })
      ).json,
    )
    const template = TemplateSummary.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/templates`, {
          name: `Shop template ${run}`,
          scope: 'brand',
          content: withPhoto(used.id),
        })
      ).json,
    )
    const refused = await call('a', 'DELETE', `/brands/${brand.id}/assets/${used.id}`)
    expect(refused.status).toBe(409)
    expect((await call('a', 'GET', `/brands/${brand.id}/assets/${used.id}/uses`)).json).toEqual(
      AssetInUse.parse(refused.json).usedIn,
    )
    expect(AssetInUse.parse(refused.json).usedIn).toEqual([
      { kind: 'design', id: design.id, name: `Shop window ${run}` },
      { kind: 'template', id: template.id, name: `Shop template ${run}` },
    ])
    expect((await call('a', 'GET', `/brands/${brand.id}/assets/${used.id}`)).status).toBe(200)

    // Once the design and the template are gone, the logo still holds it.
    expect((await call('a', 'DELETE', `/brands/${brand.id}/designs/${design.id}`)).status).toBe(204)
    expect((await call('a', 'DELETE', `/brands/${brand.id}/templates/${template.id}`)).status).toBe(204)
    const kit = BrandKit.parse((await call('a', 'GET', `/brands/${brand.id}/kit`)).json)
    expect((await call('a', 'PUT', `/brands/${brand.id}/kit`, { ...kit, logoAssetId: used.id })).status).toBe(200)
    expect(AssetInUse.parse((await call('a', 'DELETE', `/brands/${brand.id}/assets/${used.id}`)).json).usedIn).toEqual([
      { kind: 'logo', id: brand.id, name: '' },
    ])
    expect((await call('a', 'PUT', `/brands/${brand.id}/kit`, { ...kit, logoAssetId: null })).status).toBe(200)
    expect((await call('a', 'DELETE', `/brands/${brand.id}/assets/${used.id}`)).status).toBe(204)
  })
})
