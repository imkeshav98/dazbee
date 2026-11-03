import { Hono } from 'hono'

import type { Db } from '@dazbee/db'
import { CompleteSignIn, type SignedIn, type SignedOut, type SignInLink } from '@dazbee/schema'

import { body, type Env, error } from '../http.ts'
import { bearerToken, readSessionToken } from './session.ts'
import { completeSignIn, type SignedInPerson, type SignInSettings } from './sign-in.ts'

export function authRoutes({ db, signIn }: { db: Db; signIn: SignInSettings | null }): Hono<Env> {
  const app = new Hono<Env>()

  // Sign-in (#58). The web app's /login asks for the link, its /callback hands back the code.
  app.get('/auth/sign-in-url', (c) => {
    if (!signIn) return c.json(error('Sign-in is not set up'), 404)
    const state = c.req.query('state') ?? ''
    if (!/^[\w-]{16,128}$/.test(state)) return c.json(error('state: 16–128 letters, digits, _ and -'), 400)
    return c.json({ url: signIn.provider.signInUrl(state) } satisfies SignInLink)
  })

  app.post('/auth/callback', async (c) => {
    if (!signIn) return c.json(error('Sign-in is not set up'), 404)
    const input = await body(c.req.raw, CompleteSignIn)
    if (input instanceof Response) return input
    let person: SignedInPerson
    try {
      person = await signIn.provider.authenticate(input.code)
    } catch {
      return c.json(error('That sign-in did not work; try again'), 400)
    }
    return c.json((await completeSignIn(db, signIn.provider, signIn.secret, person)) satisfies SignedIn)
  })

  // Signing out forgets the token in the web app; this says where to end the WorkOS session too.
  app.post('/auth/sign-out', (c) => {
    const token = bearerToken(c.req.raw)
    const payload = signIn && token ? readSessionToken(signIn.secret, token) : null
    const logoutUrl = payload?.workosSessionId ? (signIn?.provider.signOutUrl(payload.workosSessionId) ?? null) : null
    return c.json({ logoutUrl } satisfies SignedOut)
  })

  return app
}
