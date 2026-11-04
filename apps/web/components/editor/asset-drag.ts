// What a drag of an asset from the library carries: the asset, written as the drag starts and read
// back on the stage when it is dropped.
import type { DragEvent } from 'react'

import { AssetSummary, isVectorAsset } from '@dazbee/schema'

import type { Placeable } from '@/lib/editor/place-asset.ts'

/** What an asset dragged from the library carries, for the stage to place it. */
export const ASSET_DRAG_TYPE = 'application/x-dazbee-asset'
/** Also on a drag of an SVG asset, so the stage knows before the drop, when only the types can be read. */
export const VECTOR_DRAG_TYPE = 'application/x-dazbee-vector'

/** Puts the asset on a drag from the library, with the SVG mark when it is one. */
export function carryAsset(e: DragEvent, asset: Placeable) {
  e.dataTransfer.setData(
    ASSET_DRAG_TYPE,
    JSON.stringify({
      id: asset.id,
      name: asset.name,
      width: asset.width,
      height: asset.height,
      contentType: asset.contentType,
    }),
  )
  if (isVectorAsset(asset)) e.dataTransfer.setData(VECTOR_DRAG_TYPE, '1')
}

/** The asset a drag from the library carries, or null when it carries none. */
export function draggedAsset(e: DragEvent): Placeable | null {
  const data = e.dataTransfer.getData(ASSET_DRAG_TYPE)
  if (!data) return null
  const parsed = AssetSummary.pick({ id: true, name: true, width: true, height: true, contentType: true }).safeParse(
    JSON.parse(data),
  )
  return parsed.success ? parsed.data : null
}
