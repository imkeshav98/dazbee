// The routes of a brand's kit: reading it and saving it whole.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import { BrandKit } from '@dazbee/schema'

import { body, type Env, error } from '../http.ts'
import { findBrand } from '../workspace/workspace.ts'
import { getBrandKit, InvalidKit, saveBrandKit } from './brand-kits.ts'

export function brandKitRoutes({ db }: { db: Db }): Hono<Env> {
  const app = new Hono<Env>()

  // Brand kits (#53): the colours and fonts designs bind to, the logo and the tone of voice.
  app.get('/brands/:brandId/kit', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    return c.json(await getBrandKit(db, workspaceId, brand.id))
  })

  app.put('/brands/:brandId/kit', async (c) => {
    const { workspaceId } = c.var.session
    const brand = await findBrand(db, workspaceId, c.req.param('brandId'))
    if (!brand) return c.json(error('No such brand'), 404)
    const input = await body(c.req.raw, BrandKit)
    if (input instanceof Response) return input
    try {
      return c.json(await saveBrandKit(db, workspaceId, brand.id, input))
    } catch (e) {
      if (e instanceof InvalidKit) return c.json(error(e.message), 400)
      throw e
    }
  })

  return app
}
