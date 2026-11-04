// The API: every area's routes on one app. /workspace and every route below /brands need a session, and
// read and write only that session's workspace; a brand or design of another workspace is answered as if it
// didn't exist. Every route below /brands/:brandId reads its brand from `brandScope`, and an `Invalid*`
// error answers 400 here, whichever route throws it.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import type { Storage } from '@dazbee/storage'

import { InvalidUpload } from './assets/assets.ts'
import { assetRoutes } from './assets/routes.ts'
import { InvalidKit } from './brand-kits/brand-kits.ts'
import { brandKitRoutes } from './brand-kits/routes.ts'
import { InvalidFont } from './fonts/fonts.ts'
import { fontRoutes } from './fonts/routes.ts'
import { brandScope, type Env, error, requireSession } from './http.ts'
import { signInRoutes } from './sign-in/routes.ts'
import type { SessionOf } from './sign-in/session.ts'
import type { SignInSettings } from './sign-in/sign-in.ts'
import { templateRoutes } from './templates/routes.ts'
import { InvalidContent } from './workspace/designs.ts'
import { workspaceRoutes } from './workspace/routes.ts'

export function createApp({
  db,
  storage,
  sessionOf,
  syncSecret,
  signIn = null,
}: {
  db: Db
  storage: Storage
  sessionOf: SessionOf
  syncSecret: string
  signIn?: SignInSettings | null
}) {
  const app = new Hono<Env>()

  app.get('/health', (c) => c.json({ ok: true }))

  app.route('/', signInRoutes({ db, signIn }))

  const signedIn = requireSession(sessionOf)
  app.use('/workspace', signedIn)
  app.use('/brands', signedIn)
  app.use('/brands/*', signedIn)
  app.use('/brands/:brandId/*', brandScope(db))

  app.route('/', workspaceRoutes({ db, storage, syncSecret }))
  app.route('/', assetRoutes({ db, storage }))
  app.route('/', templateRoutes({ db, storage }))
  app.route('/', brandKitRoutes({ db }))
  app.route('/', fontRoutes({ db, storage }))

  // A refusal a route lets through answers 400 with its message; any other error is ours.
  app.onError((e, c) => {
    if (e instanceof InvalidContent) return c.json(error(`The design is not valid: ${e.message}`), 400)
    if (e instanceof InvalidUpload || e instanceof InvalidKit || e instanceof InvalidFont)
      return c.json(error(e.message), 400)
    console.error(e)
    return c.json(error('Something went wrong on our side'), 500)
  })

  return app
}
