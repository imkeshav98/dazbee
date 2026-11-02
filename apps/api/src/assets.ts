// Uploaded images. Originals are stored once per workspace by content hash; every brand that uploads
// the same bytes gets its own asset, so a brand never sees another brand's assets. Each brand names
// and tags its own, and finds them by those (#52).
import { createHash, randomUUID } from 'node:crypto'
import { assets, brandKits, designs, designStates, templates, type Db } from '@dazbee/db'
import { imageAssetIds, parseDesign, type AssetSummary, type AssetUse, type ImageType, type UpdateAsset, type UploadTicket } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { storedDesign } from './design-thumbnails.ts'
import { readImageHeader } from './images.ts'
import { makeThumbnail } from './thumbnails.ts'

/** How long a signed upload or read URL works. */
export const SIGNED_URL_SECONDS = 5 * 60

export const originalKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/originals/${sha256}`
/** The asset library's small copy of an original, made once and shared like the original (#52). */
export const thumbnailKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/thumbnails/${sha256}`

const summary = {
  id: assets.id, brandId: assets.brandId, sha256: assets.sha256, contentType: assets.contentType,
  byteSize: assets.byteSize, width: assets.width, height: assets.height, name: assets.name, tags: assets.tags, createdAt: assets.createdAt,
}
const toSummary = (row: Omit<AssetSummary, 'createdAt'> & { createdAt: Date }): AssetSummary => ({ ...row, createdAt: row.createdAt.toISOString() })

/** A LIKE pattern that matches `text` literally. */
const literal = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * One search word matches an asset whose name has it anywhere, or which has a tag that starts with
 * it, ignoring case: "sum" finds "Summer sale.jpg" and the tag "summer".
 */
function matches(word: string): SQL {
  const lower = word.toLowerCase()
  return sql`(${assets.name} ILIKE ${`%${literal(word)}%`} OR EXISTS (SELECT 1 FROM unnest(${assets.tags}) AS tag WHERE tag LIKE ${`${literal(lower)}%`}))`
}

/**
 * The brand's assets, newest first. With a query, only those that match every word of it, by name
 * or tag (#52).
 */
export async function listAssets(db: Db, workspaceId: string, brandId: string, query = ''): Promise<AssetSummary[]> {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const rows = await db.select(summary).from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), eq(assets.brandId, brandId), ...words.map(matches)))
    .orderBy(desc(assets.createdAt), desc(assets.id))
  return rows.map(toSummary)
}

/**
 * What of the brand shows the asset: its designs as they are stored, the templates saved from it
 * (whose images are its assets), and its logo. Only the brand's own, since an asset is one brand's.
 */
export async function assetUses(db: Db, workspaceId: string, brandId: string, id: string): Promise<AssetUse[]> {
  const uses: AssetUse[] = []
  // Only designs whose stored state holds the id's bytes can show it; each of those is read to be sure.
  const brandDesigns = await db.select({ id: designs.id, name: designs.name }).from(designs)
    .innerJoin(designStates, eq(designStates.designId, designs.id))
    .where(and(eq(designs.workspaceId, workspaceId), eq(designs.brandId, brandId), sql`position(${Buffer.from(id, 'utf8')} in ${designStates.state}) > 0`))
    .orderBy(designs.name, designs.id)
  for (const design of brandDesigns) {
    const content = await storedDesign(db, design.id)
    if (content && imageAssetIds(content).includes(id)) uses.push({ kind: 'design', id: design.id, name: design.name })
  }
  const saved = await db.select({ id: templates.id, name: templates.name, content: templates.content }).from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.fromBrandId, brandId)))
    .orderBy(templates.name, templates.id)
  for (const template of saved) {
    const parsed = parseDesign(template.content)
    if (parsed.success && imageAssetIds(parsed.design).includes(id)) uses.push({ kind: 'template', id: template.id, name: template.name })
  }
  const [kit] = await db.select({ logo: brandKits.logoAssetId }).from(brandKits)
    .where(and(eq(brandKits.workspaceId, workspaceId), eq(brandKits.brandId, brandId)))
  if (kit?.logo === id) uses.push({ kind: 'logo', id: brandId, name: '' })
  return uses
}

/**
 * Deletes the brand's asset unless something of the brand still shows it: then nothing is deleted
 * and the answer is what uses it. Null when the brand has no such asset. The original stays in
 * storage, since other brands of the workspace may have assets of the same bytes.
 */
export async function deleteAsset(db: Db, workspaceId: string, brandId: string, id: string): Promise<{ deleted: true } | { usedIn: AssetUse[] } | null> {
  const asset = await findAsset(db, workspaceId, brandId, { id })
  if (!asset) return null
  const usedIn = await assetUses(db, workspaceId, brandId, id)
  if (usedIn.length > 0) return { usedIn }
  await db.delete(assets).where(and(eq(assets.id, id), eq(assets.workspaceId, workspaceId), eq(assets.brandId, brandId)))
  return { deleted: true }
}

/** Renames the brand's asset or sets its tags; null when the brand has no such asset. */
export async function updateAsset(db: Db, workspaceId: string, brandId: string, id: string, update: UpdateAsset): Promise<AssetSummary | null> {
  const [row] = await db.update(assets)
    .set({ ...(update.name === undefined ? {} : { name: update.name }), ...(update.tags === undefined ? {} : { tags: update.tags }) })
    .where(and(eq(assets.id, id), eq(assets.workspaceId, workspaceId), eq(assets.brandId, brandId)))
    .returning(summary)
  return row ? toSummary(row) : null
}

/**
 * The key of the asset's thumbnail, made from the original and stored first if it isn't yet: an
 * asset recorded before thumbnails existed gets one the first time the library shows it.
 */
export async function ensureThumbnail(storage: Storage, workspaceId: string, asset: AssetSummary): Promise<string> {
  const key = thumbnailKey(workspaceId, asset.sha256)
  if (await storage.exists(key)) return key
  const original = await storage.get(originalKey(workspaceId, asset.sha256))
  if (!original) throw new Error(`the original of asset ${asset.id} is missing from storage`)
  const thumbnail = await makeThumbnail(original, asset.contentType)
  await storage.put(key, thumbnail.bytes, thumbnail.contentType)
  return key
}

export async function findAsset(db: Db, workspaceId: string, brandId: string, by: { id: string } | { sha256: string }): Promise<AssetSummary | null> {
  const match = 'id' in by ? eq(assets.id, by.id) : eq(assets.sha256, by.sha256)
  const [row] = await db.select(summary).from(assets).where(and(match, eq(assets.workspaceId, workspaceId), eq(assets.brandId, brandId)))
  return row ? toSummary(row) : null
}

export class InvalidUpload extends Error {}

/**
 * Records the original stored under `sha256` as an asset of the brand, named `name`, after checking
 * the bytes hash to it, are an image and CanvasKit decodes them, and makes its thumbnail. Recording
 * the same bytes again gives back the same asset, under the name it has.
 */
export async function recordAsset(db: Db, storage: Storage, workspaceId: string, brandId: string, sha256: string, name = ''): Promise<AssetSummary> {
  const existing = await findAsset(db, workspaceId, brandId, { sha256 })
  if (existing) return existing
  const key = originalKey(workspaceId, sha256)
  const bytes = await storage.get(key)
  if (!bytes) throw new InvalidUpload('Nothing was uploaded for that SHA-256')
  // Bad bytes are deleted, so they never block a real upload of the same hash.
  const refuse = async (message: string) => {
    await storage.delete(key)
    return new InvalidUpload(message)
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw await refuse('The uploaded bytes do not match their SHA-256')
  const header = readImageHeader(bytes)
  if (!header) throw await refuse('The upload is not a PNG, JPEG or WebP image')
  const thumbnail = thumbnailKey(workspaceId, sha256)
  if (!(await storage.exists(thumbnail))) {
    let made: Awaited<ReturnType<typeof makeThumbnail>>
    try {
      made = await makeThumbnail(bytes, header.contentType)
    } catch {
      throw await refuse('The image could not be decoded')
    }
    await storage.put(thumbnail, made.bytes, made.contentType)
  }
  await db.insert(assets).values({ id: randomUUID(), workspaceId, brandId, sha256, byteSize: bytes.length, name, ...header }).onConflictDoNothing()
  const recorded = await findAsset(db, workspaceId, brandId, { sha256 })
  if (!recorded) throw new Error('asset vanished after insert')
  return recorded
}

/** The asset when these bytes are already stored for the workspace; otherwise a signed URL to upload them. */
export async function startUpload(db: Db, storage: Storage, workspaceId: string, brandId: string, upload: { sha256: string; byteSize: number; contentType: ImageType; name?: string | undefined }): Promise<UploadTicket> {
  const existing = await findAsset(db, workspaceId, brandId, { sha256: upload.sha256 })
  if (existing) return { asset: existing, upload: null }
  const key = originalKey(workspaceId, upload.sha256)
  if (await storage.exists(key)) {
    try {
      return { asset: await recordAsset(db, storage, workspaceId, brandId, upload.sha256, upload.name), upload: null }
    } catch (e) {
      if (!(e instanceof InvalidUpload)) throw e
    }
  }
  const expiresAt = new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString()
  const url = await storage.signedPut(key, upload.contentType, upload.byteSize, SIGNED_URL_SECONDS)
  // Browsers set content-length from the body themselves; it is signed, so it must match byteSize.
  return { asset: null, upload: { url, headers: { 'content-type': upload.contentType }, expiresAt } }
}
