// The routes of the fonts a brand can use: the catalog, uploading a font, and a face's file and preview.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import { RecordFont, StartFontUpload } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

import { body, type Env, error } from '../http.ts'
import { fontLink, listFonts, recordFont, startFontUpload } from './fonts.ts'

export function fontRoutes({ db, storage }: { db: Db; storage: Storage }): Hono<Env> {
  const app = new Hono<Env>()

  // Fonts (#50): Google Fonts copied into our storage and the brand's uploads, read back from there.
  app.get('/brands/:brandId/fonts', async (c) => {
    const { workspaceId } = c.var.session
    return c.json(await listFonts(db, workspaceId, c.var.brand.id))
  })

  app.post('/brands/:brandId/fonts/uploads', async (c) => {
    const { workspaceId } = c.var.session
    const input = await body(c.req.raw, StartFontUpload)
    if (input instanceof Response) return input
    return c.json(await startFontUpload(db, storage, workspaceId, c.var.brand.id, input))
  })

  app.post('/brands/:brandId/fonts', async (c) => {
    const { workspaceId } = c.var.session
    const input = await body(c.req.raw, RecordFont)
    if (input instanceof Response) return input
    return c.json(await recordFont(db, storage, workspaceId, c.var.brand.id, input.sha256), 201)
  })

  app.get('/brands/:brandId/fonts/faces/:faceId', async (c) => {
    const { workspaceId } = c.var.session
    const link = await fontLink(db, storage, workspaceId, c.var.brand.id, c.req.param('faceId'))
    return link ? c.json(link) : c.json(error('No such font'), 404)
  })

  return app
}
