// What the editor loads through the app's own routes: an asset's bytes, the brand's font files and
// its brand kit's values; and asking the offline worker to keep the page.
import { BrandKit, brandVariables, FontFamily, type Variables } from '@dazbee/schema'

export async function assetBytes(brandId: string, assetId: string) {
  const response = await fetch(`/brands/${encodeURIComponent(brandId)}/assets/${encodeURIComponent(assetId)}`)
  if (!response.ok) throw new Error(`asset ${assetId}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * The files of the families the editor asks for (#50), from the brand's catalog: fetched once, and
 * again when a family isn't in it yet, as after an upload.
 */
export function fontLoader(brandId: string) {
  const brand = `/brands/${encodeURIComponent(brandId)}/fonts`
  let catalog: Promise<FontFamily[]> | null = null
  const fetchCatalog = async () => {
    const response = await fetch(brand)
    if (!response.ok) throw new Error(`fonts: ${response.status}`)
    return FontFamily.array().parse(await response.json())
  }
  return async (families: string[]) => {
    let known = await (catalog ??= fetchCatalog()).catch((error: unknown) => {
      catalog = null
      throw error
    })
    if (families.some((family) => !known.some((f) => f.family === family))) known = await (catalog = fetchCatalog())
    const faces = known.filter((f) => families.includes(f.family)).flatMap((f) => f.faces)
    return Promise.all(
      faces.map(async (face) => {
        const response = await fetch(`${brand}/${encodeURIComponent(face.id)}`)
        if (!response.ok) throw new Error(`font ${face.family} ${face.weight}: ${response.status}`)
        return { family: face.family, bytes: new Uint8Array(await response.arrayBuffer()) }
      }),
    )
  }
}

/**
 * The values of the brand kit's tokens (#53), for layers bound to them. Without a connection the
 * editor starts without them, and bound layers keep the values they were bound with.
 */
export async function brandKitVariables(brandId: string): Promise<Variables | undefined> {
  const response = await fetch(`/brands/${encodeURIComponent(brandId)}/kit/data`).catch(() => null)
  if (!response?.ok) return undefined
  return brandVariables(BrandKit.parse(await response.json()))
}

/** Asks the offline worker to keep this page and everything it has loaded so far. */
export async function keepForOffline() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const urls = [location.href, ...performance.getEntriesByType('resource').map((entry) => entry.name)]
  registration.active?.postMessage({ type: 'keep', urls })
}
