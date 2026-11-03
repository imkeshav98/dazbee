import type { MiddlewareHandler } from 'hono'
import type { z } from 'zod'

import type { ApiError } from '@dazbee/schema'

import type { Session, SessionOf } from './session.ts'

export type Env = { Variables: { session: Session } }

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

export function requireSession(sessionOf: SessionOf): MiddlewareHandler<Env> {
  return async (c, next) => {
    const session = await sessionOf(c.req.raw)
    if (!session) return c.json(error('Sign in first'), 401)
    c.set('session', session)
    await next()
  }
}
