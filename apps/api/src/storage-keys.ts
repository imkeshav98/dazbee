// Where each object the API stores sits in storage, the short-lived URLs that read and upload them, and
// the check an uploaded object passes before it is recorded.
import { createHash } from 'node:crypto'

import type { DesignSummary, SignedLink } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

export const originalKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/originals/${sha256}`
/** The asset library's small copy of an original, made once and shared like the original (#52). */
export const assetThumbnailKey = (workspaceId: string, sha256: string) =>
  `workspaces/${workspaceId}/thumbnails/${sha256}`

export const designThumbnailKey = (workspaceId: string, design: DesignSummary) =>
  `workspaces/${workspaceId}/designs/${design.id}/thumbnail-${Date.parse(design.updatedAt)}.png`

export const templateThumbnailKey = (workspaceId: string, templateId: string) =>
  `workspaces/${workspaceId}/templates/${templateId}.png`

export const googleFontKey = (sha256: string) => `fonts/google/${sha256}`
export const uploadedFontKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/fonts/${sha256}`
/** Each file's preview sits next to it. */
export const previewKey = (fontKey: string) => `${fontKey}.preview.png`

/** How long a signed upload or read URL works. */
const SIGNED_URL_SECONDS = 5 * 60

/** A URL that reads the object at `key`, and when it stops working. */
export async function signedLink(storage: Storage, key: string): Promise<SignedLink> {
  const url = await storage.signedGet(key, SIGNED_URL_SECONDS)
  return { url, expiresAt: expiry() }
}

/** A URL that uploads `size` bytes of `contentType` to `key`, and when it stops working. */
export async function signedUpload(
  storage: Storage,
  key: string,
  { contentType, size }: { contentType: string; size: number },
): Promise<SignedLink> {
  const url = await storage.signedPut(key, contentType, size, SIGNED_URL_SECONDS)
  return { url, expiresAt: expiry() }
}

/**
 * Refuses the bytes uploaded to `key` unless they hash to `sha256`, and gives back `refuse` for the
 * caller's own checks. Refusing deletes the bytes, so they never block a real upload of the same
 * hash, and gives the `Refusal` to throw.
 */
export async function checkUpload<E extends Error>(
  storage: Storage,
  key: string,
  bytes: Uint8Array,
  sha256: string,
  Refusal: new (message: string) => E,
): Promise<(message: string) => Promise<E>> {
  const refuse = async (message: string) => {
    await storage.delete(key)
    return new Refusal(message)
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw await refuse('The uploaded bytes do not match their SHA-256')
  return refuse
}

/** When a URL signed now stops working. */
function expiry(): string {
  return new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString()
}
