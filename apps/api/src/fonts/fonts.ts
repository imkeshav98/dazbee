// The font catalog (#50): Google Fonts copied into our storage, shared by every workspace, and the
// fonts each brand uploads, its own. A brand's upload of a family Google also has is the one that
// brand sees. Every file is read back from our storage, by the editor and by Node renders alike.
import { and, eq, inArray, isNull, or } from 'drizzle-orm'

import { type Db, fontFaces, newId } from '@dazbee/db'
import {
  byCodeUnits,
  type FontFace,
  type FontFamily,
  type FontLink,
  type FontUploadTicket,
  type StartFontUpload,
} from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

import { checkUpload, googleFontKey, previewKey, signedLink, signedUpload, uploadedFontKey } from '../storage-keys.ts'
import { fontPreview, readFontInfo } from './font-file.ts'

export class InvalidFont extends Error {}

type Row = typeof fontFaces.$inferSelect

const keyOf = (row: Row) => (row.workspaceId ? uploadedFontKey(row.workspaceId, row.sha256) : googleFontKey(row.sha256))
const toFace = (row: Row): FontFace => ({
  id: row.id,
  family: row.family,
  weight: row.weight,
  style: row.style,
  source: row.source,
  byteSize: row.byteSize,
})
const byFace = (a: Row, b: Row) => (a.style === b.style ? a.weight - b.weight : a.style === 'normal' ? -1 : 1)

/** What a brand can use: every Google face and the brand's own uploads. */
const visibleTo = (workspaceId: string, brandId: string) =>
  or(eq(fontFaces.source, 'google'), and(eq(fontFaces.workspaceId, workspaceId), eq(fontFaces.brandId, brandId)))

/** The catalog a brand picks from, families by name. */
export async function listFonts(db: Db, workspaceId: string, brandId: string): Promise<FontFamily[]> {
  const rows = await db.select().from(fontFaces).where(visibleTo(workspaceId, brandId))
  return [...families(rows)]
    .sort(([a], [b]) => byCodeUnits(a, b))
    .map(([family, faces]) => ({
      family,
      source: faces[0]?.source ?? 'google',
      category: faces[0]?.category ?? null,
      faces: faces.map(toFace),
    }))
}

/** A face the brand can use and short-lived URLs to its file and preview, or null. */
export async function fontLink(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  faceId: string,
): Promise<FontLink | null> {
  const row = await visibleFace(db, workspaceId, brandId, faceId)
  if (!row) return null
  const key = keyOf(row)
  const [file, preview] = await Promise.all([signedLink(storage, key), signedLink(storage, previewKey(key))])
  return { face: toFace(row), url: file.url, previewUrl: preview.url, expiresAt: file.expiresAt }
}

/**
 * Every face of the named families as the brand sees them, with their bytes from our storage: what
 * a render in Node registers, the same files the editor loads (#50). Families the catalog doesn't
 * have are left out, and their text draws in the fallback fonts, as in the editor.
 */
export async function fontFiles(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  names: string[],
): Promise<{ family: string; bytes: Uint8Array }[]> {
  if (names.length === 0) return []
  const rows = await db
    .select()
    .from(fontFaces)
    .where(and(inArray(fontFaces.family, names), visibleTo(workspaceId, brandId)))
  const picked = [...families(rows).values()].flat()
  return Promise.all(
    picked.map(async (row) => {
      const bytes = await storage.get(keyOf(row))
      if (!bytes) throw new Error(`the file of ${row.family} ${row.weight} ${row.style} is missing from storage`)
      return { family: row.family, bytes }
    }),
  )
}

/** The brand's face for these bytes when it has one; otherwise a signed URL to upload them. */
export async function startFontUpload(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  upload: StartFontUpload,
): Promise<FontUploadTicket> {
  const [existing] = await db
    .select()
    .from(fontFaces)
    .where(
      and(eq(fontFaces.workspaceId, workspaceId), eq(fontFaces.brandId, brandId), eq(fontFaces.sha256, upload.sha256)),
    )
  if (existing) return { face: toFace(existing), upload: null }
  const { url, expiresAt } = await signedUpload(storage, uploadedFontKey(workspaceId, upload.sha256), {
    contentType: upload.contentType,
    size: upload.byteSize,
  })
  return { face: null, upload: { url, headers: { 'content-type': upload.contentType }, expiresAt } }
}

/**
 * Records the font file stored under `sha256` as the brand's, named by its own tables, after
 * checking the bytes hash to it and CanvasKit reads them. A face the brand already has in that
 * family, weight and style is replaced; recording the same bytes again gives back the same face.
 */
export async function recordFont(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  sha256: string,
): Promise<FontFace> {
  const key = uploadedFontKey(workspaceId, sha256)
  const bytes = await storage.get(key)
  if (!bytes) throw new InvalidFont('Nothing was uploaded for that SHA-256')
  const [existing] = await db
    .select()
    .from(fontFaces)
    .where(and(eq(fontFaces.workspaceId, workspaceId), eq(fontFaces.brandId, brandId), eq(fontFaces.sha256, sha256)))
  if (existing) return toFace(existing)
  const refuse = await checkUpload(storage, key, bytes, sha256, InvalidFont)
  const info = readFontInfo(bytes)
  if (!info) throw await refuse('The upload is not a TrueType or OpenType font')
  let preview: Uint8Array
  try {
    preview = await fontPreview(bytes, info)
  } catch {
    throw await refuse('The font could not be read')
  }
  await storage.put(previewKey(key), preview, 'image/png')
  const row = {
    id: newId(),
    workspaceId,
    brandId,
    source: 'upload',
    family: info.family,
    weight: info.weight,
    style: info.style,
    category: null,
    sha256,
    byteSize: bytes.length,
  } as const
  await replaceFace(db, row)
  return toFace({ ...row, createdAt: new Date() })
}

/** Puts a face in, taking the place of the one with the same family, weight and style in its scope. */
export async function replaceFace(db: Db, row: typeof fontFaces.$inferInsert) {
  await db.transaction(async (tx) => {
    await tx
      .delete(fontFaces)
      .where(
        and(
          row.workspaceId ? eq(fontFaces.workspaceId, row.workspaceId) : isNull(fontFaces.workspaceId),
          row.brandId ? eq(fontFaces.brandId, row.brandId) : isNull(fontFaces.brandId),
          eq(fontFaces.family, row.family),
          eq(fontFaces.weight, row.weight),
          eq(fontFaces.style, row.style),
        ),
      )
    await tx.insert(fontFaces).values(row)
  })
}

/** The faces of each family as the brand sees them: where it uploaded a family Google has, only its own. */
function families(rows: Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>()
  for (const row of rows) {
    const known = out.get(row.family)
    if (!known) out.set(row.family, [row])
    else if (known[0]?.source === row.source) known.push(row)
    else if (row.source === 'upload') out.set(row.family, [row])
  }
  for (const faces of out.values()) faces.sort(byFace)
  return out
}

async function visibleFace(db: Db, workspaceId: string, brandId: string, faceId: string) {
  const [row] = await db
    .select()
    .from(fontFaces)
    .where(and(eq(fontFaces.id, faceId), visibleTo(workspaceId, brandId)))
  return row ?? null
}
