// What of the brand shows an image, so the asset library can say before deleting it.
import { ApiFailure, assetUses } from '../../../../../../lib/api.ts'

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string; assetId: string }> }) {
  const { brandId, assetId } = await params
  try {
    return Response.json(await assetUses(brandId, assetId))
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) return Response.json({ error: e.message }, { status: 404 })
    throw e
  }
}
