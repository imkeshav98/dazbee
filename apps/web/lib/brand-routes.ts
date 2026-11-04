// The browser's client for the app's own /brands/… route handlers: a route's path, and its answer
// read as JSON or as the error it gives.
import { ApiError } from '@dazbee/schema'

/** A route's refusal: its status, and the text of its `{ error }` body, or the status when it has none. */
export class RouteError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'RouteError'
    this.status = status
  }

  /** The error of an answer that isn't ok, from its status and its body read as JSON (null when it isn't JSON). */
  static fromBody(status: number, body: unknown) {
    return new RouteError(status, ApiError.safeParse(body).data?.error ?? String(status))
  }
}

/** The path of a brand's route, `/brands/<brand>/<segment>/…`, with the brand and each segment encoded. */
export function brandPath(brandId: string, ...segments: string[]): string {
  return ['', 'brands', brandId, ...segments].map((part) => encodeURIComponent(part)).join('/')
}

/** A route's answer read as JSON, null when it isn't JSON; a `RouteError` when the answer isn't ok. */
export async function readJson<T = unknown>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw RouteError.fromBody(response.status, body)
  return body as T
}
