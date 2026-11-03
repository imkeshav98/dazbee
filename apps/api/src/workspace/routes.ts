import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import {
  CreateBrand,
  CreateDesign,
  type DesignCover,
  type DesignThumbnail,
  DuplicateDesign,
  Rename,
  type SyncToken,
  UpdateWorkspace,
} from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'
import { signSyncToken } from '@dazbee/sync-token'

import { designCover, ensureDesignThumbnail } from '../drawing/design-thumbnails.ts'
import { body, type Env, error } from '../http.ts'
import { signedLink } from '../storage-keys.ts'
import {
  createDesign,
  deleteDesign,
  findDesign,
  InvalidContent,
  listDesigns,
  renameDesign,
  storedDesign,
} from './designs.ts'
import { createBrand, findBrand, findWorkspace, listBrands, updateWorkspace } from './workspace.ts'

export function workspaceRoutes({
  db,
  storage,
  syncSecret,
}: {
  db: Db
  storage: Storage
  syncSecret: string
}): Hono<Env> {
  const app = new Hono<Env>()

  app.get('/workspace', async (c) => {
    const workspace = await findWorkspace(db, c.var.session.workspaceId)
    return workspace ? c.json(workspace) : c.json(error('No such workspace'), 404)
  })

  // Onboarding asks who Dazbee is for; the answer only changes defaults and words (ADR-0011).
  // Settings also renames the workspace.
  app.patch('/workspace', async (c) => {
    const input = await body(c.req.raw, UpdateWorkspace)
    if (input instanceof Response) return input
    const workspace = await updateWorkspace(db, c.var.session.workspaceId, input)
    return workspace ? c.json(workspace) : c.json(error('No such workspace'), 404)
  })

  app.get('/brands', async (c) => c.json(await listBrands(db, c.var.session.workspaceId)))

  app.post('/brands', async (c) => {
    const input = await body(c.req.raw, CreateBrand)
    if (input instanceof Response) return input
    return c.json(await createBrand(db, c.var.session.workspaceId, input.name, input.website), 201)
  })

  app.get('/brands/:brandId/designs', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    return c.json(await listDesigns(db, workspaceId, brand.id))
  })

  app.post('/brands/:brandId/designs', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const input = await body(c.req.raw, CreateDesign)
    if (input instanceof Response) return input
    try {
      return c.json(await createDesign(db, workspaceId, brand.id, input.name, input.content), 201)
    } catch (e) {
      if (e instanceof InvalidContent) return c.json(error(`The design is not valid: ${e.message}`), 400)
      throw e
    }
  })

  app.get('/brands/:brandId/designs/:designId', async (c) => {
    const design = await findDesign(db, c.var.session.workspaceId, c.req.param('brandId'), c.req.param('designId'))
    return design ? c.json(design) : c.json(error('No such design'), 404)
  })

  // A design's name in the library and the editor; its content is the sync server's.
  app.patch('/brands/:brandId/designs/:designId', async (c) => {
    const input = await body(c.req.raw, Rename)
    if (input instanceof Response) return input
    const design = await renameDesign(
      db,
      c.var.session.workspaceId,
      c.req.param('brandId'),
      c.req.param('designId'),
      input.name,
    )
    return design ? c.json(design) : c.json(error('No such design'), 404)
  })

  // A copy of the design as it is stored now, in the same brand.
  app.post('/brands/:brandId/designs/:designId/duplicate', async (c) => {
    const { workspaceId } = c.var.session
    const original = await findDesign(db, workspaceId, c.req.param('brandId'), c.req.param('designId'))
    if (!original) return c.json(error('No such design'), 404)
    const input = await body(c.req.raw, DuplicateDesign)
    if (input instanceof Response) return input
    const content = await storedDesign(db, original.id)
    if (!content) return c.json(error('This design has nothing stored to copy yet'), 409)
    return c.json(
      await createDesign(
        db,
        workspaceId,
        original.brandId,
        input.name ?? `${original.name} copy`.slice(0, 120),
        content,
      ),
      201,
    )
  })

  app.delete('/brands/:brandId/designs/:designId', async (c) => {
    const deleted = await deleteDesign(db, c.var.session.workspaceId, c.req.param('brandId'), c.req.param('designId'))
    return deleted ? c.body(null, 204) : c.json(error('No such design'), 404)
  })

  // A token for the sync server, only after the same workspace and brand checks as opening the design.
  // The primary format's size alone, read without drawing, for the home to lay out its bento (#84).
  app.get('/brands/:brandId/designs/:designId/cover', async (c) => {
    const design = await findDesign(db, c.var.session.workspaceId, c.req.param('brandId'), c.req.param('designId'))
    if (!design) return c.json(error('No such design'), 404)
    const cover = await designCover(db, design)
    return cover ? c.json(cover satisfies DesignCover) : c.json(error('This design has nothing to show yet'), 404)
  })

  app.get('/brands/:brandId/designs/:designId/thumbnail', async (c) => {
    const { workspaceId } = c.var.session
    const design = await findDesign(db, workspaceId, c.req.param('brandId'), c.req.param('designId'))
    if (!design) return c.json(error('No such design'), 404)
    const cover = await ensureDesignThumbnail(db, storage, workspaceId, design)
    if (!cover) return c.json(error('This design has nothing to show yet'), 404)
    const { url, expiresAt } = await signedLink(storage, cover.key)
    return c.json({ url, width: cover.width, height: cover.height, expiresAt } satisfies DesignThumbnail)
  })

  app.post('/brands/:brandId/designs/:designId/sync-token', async (c) => {
    const { workspaceId, userId } = c.var.session
    const design = await findDesign(db, workspaceId, c.req.param('brandId'), c.req.param('designId'))
    if (!design) return c.json(error('No such design'), 404)
    const { token, expiresAt } = signSyncToken(syncSecret, { designId: design.id, workspaceId, userId })
    return c.json({ token, expiresAt: new Date(expiresAt).toISOString() } satisfies SyncToken)
  })

  return app
}
