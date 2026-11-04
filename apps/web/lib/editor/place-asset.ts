// Puts an asset from the library on the stage: an image as a graphic filled with it (#52), an SVG
// file as the layers it draws. An SVG's bytes come through the web app as text and are read
// by the editor, never by the browser's image decoder.
import type { Editor, Point } from '@dazbee/editor'
import { type AssetSummary, isVectorAsset } from '@dazbee/schema'

import { brandPath } from '@/lib/brand-routes.ts'

export type Placeable = Pick<AssetSummary, 'id' | 'name' | 'width' | 'height' | 'contentType'>

/** Places the asset centred at `client`, or in the middle of the frame in view. */
export function placeAsset(editor: Editor, brandId: string, asset: Placeable, client?: Point) {
  if (!isVectorAsset(asset)) {
    editor.placeImage(asset, client)
    return
  }
  // Offline, nothing is placed; the library shows the asset is there to try again.
  svgOf(brandId, asset.id).then(
    (text) => editor.placeSvg(text, asset.name || 'SVG', client),
    () => undefined,
  )
}

/** An SVG asset's markup. */
async function svgOf(brandId: string, assetId: string): Promise<string> {
  const response = await fetch(brandPath(brandId, 'assets', assetId))
  if (!response.ok) throw new Error(`the SVG didn't load (${response.status})`)
  return response.text()
}
