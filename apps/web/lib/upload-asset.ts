// Sends an image to the brand's asset library (#52) through the web app, which uploads it to
// storage and records it, telling how much has gone. Used by the editor's library and the brief.
import { AssetSummary } from '@dazbee/schema'

import { brandPath, RouteError } from '@/lib/brand-routes.ts'

/** The image types a fill takes; the web app checks the bytes again. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
/** What the library takes: those images and SVG files, which are placed as layers. */
export const ASSET_ACCEPT = `${IMAGE_ACCEPT},image/svg+xml,.svg`

/** Sends one file to the web app, which uploads it to storage and records it, telling how much has gone. */
export function sendAsset(brandId: string, file: File, onProgress: (share: number) => void): Promise<AssetSummary> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', brandPath(brandId, 'assets'))
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    request.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(request.responseText)
      } catch {
        // Not JSON: the status says what went wrong.
      }
      if (request.status === 201) return resolve(AssetSummary.parse(body))
      reject(RouteError.fromBody(request.status, body))
    }
    request.onerror = () => reject(new Error('no connection'))
    const form = new FormData()
    form.append('file', file)
    request.send(form)
  })
}
