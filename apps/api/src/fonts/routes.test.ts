// The API seam, against Postgres from Docker Compose (`docker compose up -d --wait postgres`).
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { fontFaces } from '@dazbee/db'
import { FontFace, FontFamily, FontLink, FontUploadTicket } from '@dazbee/schema'

import { brand, call, db, otherBrand, run, sibling, storage, workspace } from '../test-api.ts'
import { fontFile, sha256 } from '../test-files.ts'
import { fontFiles } from './fonts.ts'
import { importGoogleFamily } from './google.ts'

// Recording a font draws its preview with CanvasKit, which takes seconds on a busy two-core CI runner.
describe('fonts', { timeout: 30_000 }, () => {
  /** A stand-in Google family, served by a fake Google from the Noto files, removed after the run. */
  const googleFamily = {
    family: `Test Sans ${run}`,
    category: 'sans-serif',
    weights: [400, 700],
    italic: false,
  } as const
  const regular = fontFile('NotoSans-Regular.ttf')
  const bold = fontFile('NotoSans-Bold.ttf')

  /** Google Fonts as the importer sees it: a stylesheet naming two TrueType files, and the files. */
  const fakeGoogle = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.startsWith('https://fonts.googleapis.com/css2?family=Test+Sans+')) {
      const face = (weight: number) =>
        `@font-face {\n  font-family: '${googleFamily.family}';\n  font-style: normal;\n  font-weight: ${weight};\n  src: url(https://fonts.gstatic.com/s/test/v1/w${weight}.ttf) format('truetype');\n}\n`
      return new Response(face(400) + face(700))
    }
    if (url === 'https://fonts.gstatic.com/s/test/v1/w400.ttf') return new Response(regular)
    if (url === 'https://fonts.gstatic.com/s/test/v1/w700.ttf') return new Response(bold)
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  afterAll(async () => {
    await db.delete(fontFaces).where(eq(fontFaces.family, googleFamily.family))
  })

  async function upload(as: string, brandId: string, bytes: Uint8Array) {
    const ticket = FontUploadTicket.parse(
      (
        await call(as, 'POST', `/brands/${brandId}/fonts/uploads`, {
          sha256: sha256(bytes),
          byteSize: bytes.length,
          contentType: 'font/ttf',
        })
      ).json,
    )
    if (ticket.face) return { face: ticket.face, uploaded: false }
    expect(
      (await fetch(ticket.upload.url, { method: 'PUT', body: bytes, headers: ticket.upload.headers })).status,
    ).toBe(200)
    const recorded = await call(as, 'POST', `/brands/${brandId}/fonts`, { sha256: sha256(bytes) })
    expect(recorded.status).toBe(201)
    return { face: FontFace.parse(recorded.json), uploaded: true }
  }

  it('copies a Google family into our storage once, and every brand lists it', async () => {
    expect(await importGoogleFamily(db, storage, googleFamily, fakeGoogle)).toBe(2)
    expect(await importGoogleFamily(db, storage, googleFamily, fakeGoogle)).toBe(0)
    for (const [as, brandId] of [
      ['a', brand.id],
      ['b', otherBrand.id],
    ] as const) {
      const catalog = FontFamily.array().parse((await call(as, 'GET', `/brands/${brandId}/fonts`)).json)
      expect(catalog.find((f) => f.family === googleFamily.family)).toMatchObject({
        source: 'google',
        category: 'sans-serif',
        faces: [
          { weight: 400, style: 'normal', source: 'google', byteSize: regular.length },
          { weight: 700, style: 'normal', source: 'google', byteSize: bold.length },
        ],
      })
    }
  })

  it('uploads a font for a brand, named by its own tables, with a preview, and keeps it to that brand', async () => {
    const { face, uploaded } = await upload('a', brand.id, bold)
    expect(uploaded).toBe(true)
    expect(face).toMatchObject({
      family: 'Noto Sans',
      weight: 700,
      style: 'normal',
      source: 'upload',
      byteSize: bold.length,
    })
    expect(await upload('a', brand.id, bold)).toEqual({ face, uploaded: false })

    const link = FontLink.parse((await call('a', 'GET', `/brands/${brand.id}/fonts/faces/${face.id}`)).json)
    expect(new Uint8Array(await (await fetch(link.url)).arrayBuffer())).toEqual(bold)
    const preview = new Uint8Array(await (await fetch(link.previewUrl)).arrayBuffer())
    expect([...preview.subarray(1, 4)]).toEqual([...new TextEncoder().encode('PNG')])

    const mine = FontFamily.array().parse((await call('a', 'GET', `/brands/${brand.id}/fonts`)).json)
    expect(mine.find((f) => f.family === 'Noto Sans')?.faces.map((f) => f.id)).toEqual([face.id])
    const theirs = FontFamily.array().parse((await call('a', 'GET', `/brands/${sibling.id}/fonts`)).json)
    expect(theirs.find((f) => f.family === 'Noto Sans')).toBeUndefined()
    expect((await call('a', 'GET', `/brands/${sibling.id}/fonts/faces/${face.id}`)).status).toBe(404)
    expect((await call('b', 'GET', `/brands/${brand.id}/fonts`)).status).toBe(404)
    expect((await call(null, 'GET', `/brands/${brand.id}/fonts`)).status).toBe(401)
  })

  it('gives Node the same bytes for the families a design names, uploads and Google alike', async () => {
    await upload('a', brand.id, bold)
    const files = await fontFiles(db, storage, workspace.id, brand.id, ['Noto Sans', googleFamily.family, 'Not A Font'])
    const byFamily = (family: string) =>
      files
        .filter((f) => f.family === family)
        .map((f) => sha256(f.bytes))
        .sort()
    expect(byFamily('Noto Sans')).toEqual([sha256(bold)])
    expect(byFamily(googleFamily.family)).toEqual([sha256(regular), sha256(bold)].sort())
    expect(files).toHaveLength(3)
    // Another brand has no upload of that family.
    expect(await fontFiles(db, storage, workspace.id, sibling.id, ['Noto Sans'])).toEqual([])
  })

  it('refuses a file that is not a font, and an upload of the wrong type', async () => {
    const text = new TextEncoder().encode(`not a font ${run}`)
    const ticket = FontUploadTicket.parse(
      (
        await call('a', 'POST', `/brands/${brand.id}/fonts/uploads`, {
          sha256: sha256(text),
          byteSize: text.length,
          contentType: 'font/ttf',
        })
      ).json,
    )
    if (!ticket.upload) throw new Error('expected an upload URL')
    await fetch(ticket.upload.url, { method: 'PUT', body: text, headers: ticket.upload.headers })
    expect((await call('a', 'POST', `/brands/${brand.id}/fonts`, { sha256: sha256(text) })).json).toEqual({
      error: 'The upload is not a TrueType or OpenType font',
    })
    expect((await call('a', 'POST', `/brands/${brand.id}/fonts`, { sha256: 'e'.repeat(64) })).json).toEqual({
      error: 'Nothing was uploaded for that SHA-256',
    })
    expect(
      (
        await call('a', 'POST', `/brands/${brand.id}/fonts/uploads`, {
          sha256: 'a'.repeat(64),
          byteSize: 10,
          contentType: 'font/woff2',
        })
      ).status,
    ).toBe(400)
  })
})
