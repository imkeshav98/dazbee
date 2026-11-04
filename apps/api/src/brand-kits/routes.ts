// The routes of a brand's kit: reading it and saving it whole.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import { BrandKit } from '@dazbee/schema'

import { body, type Env } from '../http.ts'
import { getBrandKit, saveBrandKit } from './brand-kits.ts'

export function brandKitRoutes({ db }: { db: Db }): Hono<Env> {
  const app = new Hono<Env>()

  // Brand kits (#53): the colours and fonts designs bind to, the logo and the tone of voice.
  app.get('/brands/:brandId/kit', async (c) => {
    const { workspaceId } = c.var.session
    return c.json(await getBrandKit(db, workspaceId, c.var.brand.id))
  })

  app.put('/brands/:brandId/kit', async (c) => {
    const { workspaceId } = c.var.session
    const input = await body(c.req.raw, BrandKit)
    if (input instanceof Response) return input
    return c.json(await saveBrandKit(db, workspaceId, c.var.brand.id, input))
  })

  return app
}
