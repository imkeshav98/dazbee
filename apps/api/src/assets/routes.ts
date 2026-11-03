// The routes of a brand's images: uploading and recording them, the library's search, names and tags,
// thumbnails, and deleting one nothing shows.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import { type AssetInUse, type AssetLink, RecordAsset, type SignedLink, StartUpload, UpdateAsset } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

import { body, type Env, error } from '../http.ts'
import { originalKey, signedLink } from '../storage-keys.ts'
import { findBrand } from '../workspace/workspace.ts'
import {
  deleteAsset,
  ensureThumbnail,
  findAsset,
  InvalidUpload,
  listAssets,
  listedAssetUses,
  recordAsset,
  startUpload,
  updateAsset,
} from './assets.ts'

export function assetRoutes({ db, storage }: { db: Db; storage: Storage }): Hono<Env> {
  const app = new Hono<Env>()

  // Images: uploads go straight to storage through a signed URL, then are recorded here (#35).
  // The asset library (#52) finds them by name and tag: ?q=summer sale.
  app.get('/brands/:brandId/assets', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const query = c.req.query('q') ?? ''
    if (query.length > 200) return c.json(error('A search is at most 200 characters'), 400)
    return c.json(await listAssets(db, workspaceId, brand.id, query))
  })

  app.post('/brands/:brandId/assets/uploads', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const input = await body(c.req.raw, StartUpload)
    if (input instanceof Response) return input
    return c.json(await startUpload(db, storage, workspaceId, brand.id, input))
  })

  app.post('/brands/:brandId/assets', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const input = await body(c.req.raw, RecordAsset)
    if (input instanceof Response) return input
    try {
      return c.json(await recordAsset(db, storage, workspaceId, brand.id, input.sha256, input.name), 201)
    } catch (e) {
      if (e instanceof InvalidUpload) return c.json(error(e.message), 400)
      throw e
    }
  })

  app.get('/brands/:brandId/assets/:assetId', async (c) => {
    const { workspaceId } = c.var.session
    const asset = await findAsset(db, workspaceId, c.req.param('brandId'), { id: c.req.param('assetId') })
    if (!asset) return c.json(error('No such asset'), 404)
    const { url, expiresAt } = await signedLink(storage, originalKey(workspaceId, asset.sha256))
    return c.json({ asset, url, expiresAt } satisfies AssetLink)
  })

  app.patch('/brands/:brandId/assets/:assetId', async (c) => {
    const { workspaceId } = c.var.session
    const input = await body(c.req.raw, UpdateAsset)
    if (input instanceof Response) return input
    const asset = await updateAsset(db, workspaceId, c.req.param('brandId'), c.req.param('assetId'), input)
    if (!asset) return c.json(error('No such asset'), 404)
    return c.json(asset)
  })

  // What shows an image, asked before deleting it; deleting one a design, a template or the logo
  // still shows is refused, saying which.
  app.get('/brands/:brandId/assets/:assetId/uses', async (c) => {
    const { workspaceId } = c.var.session
    const uses = await listedAssetUses(db, workspaceId, c.req.param('brandId'), c.req.param('assetId'))
    if (!uses) return c.json(error('No such asset'), 404)
    return c.json(uses)
  })

  app.delete('/brands/:brandId/assets/:assetId', async (c) => {
    const { workspaceId } = c.var.session
    const result = await deleteAsset(db, workspaceId, c.req.param('brandId'), c.req.param('assetId'))
    if (!result) return c.json(error('No such asset'), 404)
    if ('usedIn' in result)
      return c.json({ ...error('The image is in use'), usedIn: result.usedIn } satisfies AssetInUse, 409)
    return c.body(null, 204)
  })

  app.get('/brands/:brandId/assets/:assetId/thumbnail', async (c) => {
    const { workspaceId } = c.var.session
    const asset = await findAsset(db, workspaceId, c.req.param('brandId'), { id: c.req.param('assetId') })
    if (!asset) return c.json(error('No such asset'), 404)
    return c.json((await signedLink(storage, await ensureThumbnail(storage, workspaceId, asset))) satisfies SignedLink)
  })

  return app
}
