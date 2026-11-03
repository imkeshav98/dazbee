// The routes of the templates a brand can see: saving, renaming and deleting one, its thumbnail, and
// starting a design from it.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import { Rename, SaveTemplate, type SignedLink, StartFromTemplate } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

import { body, type Env, error } from '../http.ts'
import { signedLink, templateThumbnailKey } from '../storage-keys.ts'
import { InvalidContent } from '../workspace/designs.ts'
import { findBrand } from '../workspace/workspace.ts'
import {
  deleteTemplate,
  findTemplate,
  listTemplates,
  renameTemplate,
  saveTemplate,
  startFromTemplate,
} from './templates.ts'

export function templateRoutes({ db, storage }: { db: Db; storage: Storage }): Hono<Env> {
  const app = new Hono<Env>()

  // Templates (#54): the workspace's and the brand's, a design saved to start others from.
  app.get('/brands/:brandId/templates', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    return c.json(await listTemplates(db, workspaceId, brand.id))
  })

  app.post('/brands/:brandId/templates', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const input = await body(c.req.raw, SaveTemplate)
    if (input instanceof Response) return input
    try {
      return c.json(await saveTemplate(db, storage, workspaceId, brand.id, input), 201)
    } catch (e) {
      if (e instanceof InvalidContent) return c.json(error(`The design is not valid: ${e.message}`), 400)
      throw e
    }
  })

  app.patch('/brands/:brandId/templates/:templateId', async (c) => {
    const input = await body(c.req.raw, Rename)
    if (input instanceof Response) return input
    const template = await renameTemplate(
      db,
      c.var.session.workspaceId,
      c.req.param('brandId'),
      c.req.param('templateId'),
      input.name,
    )
    return template ? c.json(template) : c.json(error('No such template'), 404)
  })

  app.delete('/brands/:brandId/templates/:templateId', async (c) => {
    const deleted = await deleteTemplate(
      db,
      storage,
      c.var.session.workspaceId,
      c.req.param('brandId'),
      c.req.param('templateId'),
    )
    return deleted ? c.body(null, 204) : c.json(error('No such template'), 404)
  })

  app.get('/brands/:brandId/templates/:templateId/thumbnail', async (c) => {
    const { workspaceId } = c.var.session
    const template = await findTemplate(db, workspaceId, c.req.param('brandId'), c.req.param('templateId'))
    if (!template) return c.json(error('No such template'), 404)
    return c.json((await signedLink(storage, templateThumbnailKey(workspaceId, template.id))) satisfies SignedLink)
  })

  app.post('/brands/:brandId/templates/:templateId/designs', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const input = await body(c.req.raw, StartFromTemplate)
    if (input instanceof Response) return input
    const design = await startFromTemplate(db, workspaceId, brand.id, c.req.param('templateId'), input.name)
    return design ? c.json(design, 201) : c.json(error('No such template'), 404)
  })

  return app
}
