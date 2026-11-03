// An image asset's original bytes, for the editor (#35). The API checks workspace and brand and hands
// back a short-lived signed URL; the bytes pass through here, so the browser needs no storage
// address or credentials. PATCH renames it or sets its tags; DELETE deletes it unless something
// still uses it, and then answers 409 with what does.
import { isVectorAsset, UpdateAsset } from '@dazbee/schema'

import { ApiFailure, assetLink, deleteAsset, updateAsset } from '@/lib/api.ts'

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string; assetId: string }> }) {
  const { brandId, assetId } = await params
  const link = await assetLink(brandId, assetId)
  if (!link) return new Response('No such asset', { status: 404 })
  const stored = await fetch(link.url, { cache: 'no-store' })
  if (!stored.ok) return new Response('Storage did not answer', { status: 502 })
  // An SVG file is sent as text, never as a page or image the browser runs or decodes: the editor
  // reads it as layers.
  const svg = isVectorAsset(link.asset)
  return new Response(stored.body, {
    headers: {
      'content-type': svg ? 'text/plain; charset=utf-8' : link.asset.contentType,
      ...(svg
        ? {
            'content-security-policy': "default-src 'none'; sandbox",
            'x-content-type-options': 'nosniff',
            'content-disposition': 'attachment',
          }
        : {}),
      // An asset's bytes never change, but whether this viewer may see them can.
      'cache-control': 'private, max-age=3600',
    },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string; assetId: string }> }) {
  const { brandId, assetId } = await params
  const update = UpdateAsset.safeParse(await request.json().catch(() => null))
  if (!update.success)
    return Response.json({ error: update.error.issues.map((i) => i.message).join('; ') }, { status: 400 })
  try {
    return Response.json(await updateAsset(brandId, assetId, update.data))
  } catch (e) {
    if (e instanceof ApiFailure && (e.status === 400 || e.status === 404))
      return Response.json({ error: e.message }, { status: e.status })
    throw e
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ brandId: string; assetId: string }> }) {
  const { brandId, assetId } = await params
  try {
    const used = await deleteAsset(brandId, assetId)
    return used ? Response.json(used, { status: 409 }) : new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) return Response.json({ error: e.message }, { status: 404 })
    throw e
  }
}
