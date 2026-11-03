import type { DesignSummary } from '@dazbee/schema'

/** How long a signed upload or read URL works. */
export const SIGNED_URL_SECONDS = 5 * 60

export const originalKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/originals/${sha256}`
/** The asset library's small copy of an original, made once and shared like the original (#52). */
export const thumbnailKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/thumbnails/${sha256}`

export const designThumbnailKey = (workspaceId: string, design: DesignSummary) =>
  `workspaces/${workspaceId}/designs/${design.id}/thumbnail-${Date.parse(design.updatedAt)}.png`

export const templateThumbnailKey = (workspaceId: string, templateId: string) =>
  `workspaces/${workspaceId}/templates/${templateId}.png`

export const googleFontKey = (sha256: string) => `fonts/google/${sha256}`
export const uploadedFontKey = (workspaceId: string, sha256: string) => `workspaces/${workspaceId}/fonts/${sha256}`
/** Each file's preview sits next to it. */
export const previewKey = (fontKey: string) => `${fontKey}.preview.png`
