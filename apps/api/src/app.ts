// The API: every area's routes on one app. /workspace and every route below /brands need a session, and
// read and write only that session's workspace; a brand or design of another workspace is answered as if it
// didn't exist.
import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import type { Storage } from '@dazbee/storage'

import { assetRoutes } from './assets/routes.ts'
import { brandKitRoutes } from './brand-kits/routes.ts'
import { fontRoutes } from './fonts/routes.ts'
import { type Env, error, requireSession } from './http.ts'
import { signInRoutes } from './sign-in/routes.ts'
import type { SessionOf } from './sign-in/session.ts'
import type { SignInSettings } from './sign-in/sign-in.ts'
import { templateRoutes } from './templates/routes.ts'
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

  app.route('/', workspaceRoutes({ db, storage, syncSecret }))
  app.route('/', assetRoutes({ db, storage }))
  app.route('/', templateRoutes({ db, storage }))
  app.route('/', brandKitRoutes({ db }))
  app.route('/', fontRoutes({ db, storage }))

  app.onError((e, c) => {
    console.error(e)
    return c.json(error('Something went wrong on our side'), 500)
  })

  return app
}
