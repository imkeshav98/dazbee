// Uploading images the way the browser does, for the checks that need an asset (#35, #48).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect } from '@playwright/test'

import { AssetSummary, UploadTicket } from '@dazbee/schema'

import { callApi, DEV_BRAND, type InBrand } from './seed.ts'

/** A stand-in photo from the pixel fixtures, 1920 × 1200. */
export const photo = new Uint8Array(
  readFileSync(join(import.meta.dirname, '..', '..', 'pixels', 'assets', 'sneaker.jpg')),
)

/** Calls a route of a brand: a GET, or a POST of `body`. */
export async function api(path: string, body?: unknown, { brandId = DEV_BRAND }: InBrand = {}) {
  return callApi(body === undefined ? 'GET' : 'POST', `/brands/${brandId}${path}`, body)
}

/** Uploads into a brand's assets the way the browser will: ask, PUT to the signed URL, record. */
export async function upload(bytes: Uint8Array<ArrayBuffer>, { brandId = DEV_BRAND }: InBrand = {}) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const ticket = UploadTicket.parse(
    await api('/assets/uploads', { sha256, byteSize: bytes.length, contentType: 'image/jpeg' }, { brandId }),
  )
  if (ticket.asset) return ticket.asset
  const put = await fetch(ticket.upload.url, { method: 'PUT', body: bytes, headers: ticket.upload.headers })
  expect(put.status).toBe(200)
  return AssetSummary.parse(await api('/assets', { sha256 }, { brandId }))
}

export const righteous = new Uint8Array(
  readFileSync(join(import.meta.dirname, '..', 'assets', 'fonts', 'Righteous-Regular.ttf')),
)
