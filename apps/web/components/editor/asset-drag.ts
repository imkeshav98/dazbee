import type { DragEvent } from 'react'

import { AssetSummary } from '@dazbee/schema'

/** What an asset dragged from the library carries, for the stage to place it. */
export const ASSET_DRAG_TYPE = 'application/x-dazbee-asset'
/** Also on a drag of an SVG asset, so the stage knows before the drop, when only the types can be read. */
export const VECTOR_DRAG_TYPE = 'application/x-dazbee-vector'

export type DraggedAsset = Pick<AssetSummary, 'id' | 'name' | 'width' | 'height' | 'contentType'>

/** The asset a drag from the library carries, or null when it carries none. */
export function draggedAsset(e: DragEvent): DraggedAsset | null {
  const data = e.dataTransfer.getData(ASSET_DRAG_TYPE)
  if (!data) return null
  const parsed = AssetSummary.pick({ id: true, name: true, width: true, height: true, contentType: true }).safeParse(
    JSON.parse(data),
  )
  return parsed.success ? parsed.data : null
}
