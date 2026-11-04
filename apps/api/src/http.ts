// What every area's routes share: the context they run in, the error body, reading a request's body,
// the check that a request has a session, and the brand a brand route is for.
import type { MiddlewareHandler } from 'hono'
import type { z } from 'zod'

import type { Db } from '@dazbee/db'
import type { ApiError, BrandSummary } from '@dazbee/schema'

import type { Session, SessionOf } from './sign-in/session.ts'
import { findBrand } from './workspace/workspace.ts'

/**
 * A route's context: the session `requireSession` found and, on every `/brands/:brandId/*` route, the
 * brand `brandScope` found in that session's workspace.
 */
export type Env = { Variables: { session: Session; brand: BrandSummary } }

/** The body of every error answer. */
export const error = (message: string): ApiError => ({ error: message })

/** The body parsed with `schema`, or a 400 response saying what's wrong with it. */
export async function body<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json(error('The body is not JSON'), { status: 400 })
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success)
    return Response.json(
      error(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')),
      { status: 400 },
    )
  return parsed.data
}

/** Answers 401 to a request `sessionOf` finds no session for; otherwise puts its session on the context. */
export function requireSession(sessionOf: SessionOf): MiddlewareHandler<Env> {
  return async (c, next) => {
    const session = await sessionOf(c.req.raw)
    if (!session) return c.json(error('Sign in first'), 401)
    c.set('session', session)
    await next()
  }
}

/**
 * Answers 404 "No such brand" when the route's `:brandId` is not a brand of the session's workspace;
 * otherwise puts the brand on the context. It runs after `requireSession`.
 */
export function brandScope(db: Db): MiddlewareHandler<Env> {
  return async (c, next) => {
    const brand = await findBrand(db, c.var.session.workspaceId, c.req.param('brandId') ?? '')
    if (!brand) return c.json(error('No such brand'), 404)
    c.set('brand', brand)
    await next()
  }
}
