// The files the checks put into the app, and uploading images the way the browser does, for the
// checks that need an asset (#35, #48). The pictures are the pixel tests' fixtures.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect } from '@playwright/test'

import { ASSETS_DIR } from '@dazbee/pixels/pixels'
import { AssetSummary, UploadTicket } from '@dazbee/schema'

import { callApi, DEV_BRAND, type InBrand } from './seed.ts'

/** A file of the pixel tests' fixtures, by its path in their assets folder. */
function fixture(...path: string[]) {
  return new Uint8Array(readFileSync(join(ASSETS_DIR, ...path)))
}

/** A stand-in photo from the pixel fixtures, 1920 × 1200. */
export const photo = fixture('sneaker.jpg')
/** Three photos of cards, each a picture of its own, so each uploads as an asset of its own. */
export const card1 = fixture('card-1.jpg')
export const card2 = fixture('card-2.jpg')
export const card3 = fixture('card-3.jpg')
/** A small photo. */
export const tile = fixture('tile.jpg')
/** A badge as Figma exports it to SVG. */
export const figmaBadge = fixture('svg', 'figma-badge.svg')
/** The font the checks upload as a brand's own, from this suite's assets (assets/fonts/README.md). */
export const righteous = new Uint8Array(
  readFileSync(join(import.meta.dirname, '..', 'assets', 'fonts', 'Righteous-Regular.ttf')),
)

/** Calls a route of a brand: a GET, or a POST of `body`. */
export async function api(path: string, body?: unknown, { brandId = DEV_BRAND }: InBrand = {}) {
  return callApi(body === undefined ? 'GET' : 'POST', `/brands/${brandId}${path}`, body)
}

/** Uploads a JPEG or PNG into a brand's assets the way the browser will: ask, PUT to the signed URL, record. */
export async function upload(bytes: Uint8Array<ArrayBuffer>, { brandId = DEV_BRAND }: InBrand = {}) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const contentType = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg'
  const ticket = UploadTicket.parse(
    await api('/assets/uploads', { sha256, byteSize: bytes.length, contentType }, { brandId }),
  )
  if (ticket.asset) return ticket.asset
  const put = await fetch(ticket.upload.url, { method: 'PUT', body: bytes, headers: ticket.upload.headers })
  expect(put.status).toBe(200)
  return AssetSummary.parse(await api('/assets', { sha256 }, { brandId }))
}
