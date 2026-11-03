// Google Fonts families copied into our storage, shared by every workspace.
import { createHash, randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { type Db, fontFaces } from '@dazbee/db'
import { googleCssUrl, googleFaces, type GoogleFamily } from '@dazbee/fonts'
import type { Storage } from '@dazbee/storage'

import { fontPreview } from './font-file.ts'
import { replaceFace } from './fonts.ts'
import { googleFontKey, previewKey } from './storage-keys.ts'

/**
 * Copies one Google Fonts family into our storage: every weight and style the catalog lists,
 * named as the catalog names it. Faces already copied with the same bytes are left as they are.
 * Returns how many faces were copied anew.
 */
export async function importGoogleFamily(
  db: Db,
  storage: Storage,
  entry: GoogleFamily,
  get: typeof fetch = fetch,
): Promise<number> {
  const css = await get(googleCssUrl(entry))
  if (!css.ok) throw new Error(`Google Fonts answered ${css.status} for ${entry.family}`)
  const faces = googleFaces(await css.text())
  if (faces.length === 0) throw new Error(`Google Fonts named no TrueType files for ${entry.family}`)
  const have = await db
    .select()
    .from(fontFaces)
    .where(and(eq(fontFaces.source, 'google'), eq(fontFaces.family, entry.family)))
  let copied = 0
  for (const face of faces) {
    const file = await get(face.url)
    if (!file.ok)
      throw new Error(`Google Fonts answered ${file.status} for ${entry.family} ${face.weight} ${face.style}`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (have.some((row) => row.weight === face.weight && row.style === face.style && row.sha256 === sha256)) continue
    const key = googleFontKey(sha256)
    const preview = await fontPreview(bytes, { family: entry.family, ...face })
    await storage.put(key, bytes, 'font/ttf')
    await storage.put(previewKey(key), preview, 'image/png')
    await replaceFace(db, {
      id: randomUUID(),
      workspaceId: null,
      brandId: null,
      source: 'google',
      family: entry.family,
      weight: face.weight,
      style: face.style,
      category: entry.category,
      sha256,
      byteSize: bytes.length,
    })
    copied++
  }
  return copied
}
