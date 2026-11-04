// Drawing a design in Node (#54): the same render seam the editor's exports use, with every byte it
// needs read from our storage as the editor reads it: the fonts we ship, the brand's catalog
// families, the originals of its images, and its brand kit's values.
import type { Db } from '@dazbee/db'
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { loadFontFiles } from '@dazbee/fonts/node'
import { renderDesign, type Rendered, type ResourceBytes } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { brandVariables, coverFrame, type Design, fontFamilies, imageAssetIds } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

import { findAsset } from '../assets/assets.ts'
import { getBrandKit } from '../brand-kits/brand-kits.ts'
import { fontFiles } from '../fonts/fonts.ts'
import { originalKey } from '../storage-keys.ts'

/**
 * What drawing the design for this brand needs beyond the fonts we ship: the brand's catalog
 * families, the originals of its images and its brand kit's values. An image the brand has no
 * asset for is left out. A drawing worker that holds the shipped fonts itself needs only this.
 */
export async function brandResourcesFor(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  design: Design,
): Promise<ResourceBytes> {
  const variables = brandVariables(await getBrandKit(db, workspaceId, brandId))
  const [fonts, images] = await Promise.all([
    fontFiles(db, storage, workspaceId, brandId, fontFamilies(design, variables)),
    Promise.all(
      imageAssetIds(design).map(async (id) => {
        const asset = await findAsset(db, workspaceId, brandId, { id })
        const bytes = asset && (await storage.get(originalKey(workspaceId, asset.sha256)))
        return bytes ? [[id, bytes] as const] : []
      }),
    ),
  ])
  return { fonts, fallbackFamilies: [...FALLBACK_FAMILIES], images: Object.fromEntries(images.flat()), variables }
}

/** The design's cover frame (see `coverFrame`), as an export draws it. */
export async function renderCover(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  design: Design,
): Promise<Rendered> {
  const ck = await loadCanvasKit()
  const cover = coverFrame(design)
  if (!cover) throw new Error('the design has no frame')
  return renderDesign(ck, design, cover[0], await resourcesFor(db, storage, workspaceId, brandId, design))
}

/** What drawing the design for this brand needs, the shipped fonts included. */
async function resourcesFor(
  db: Db,
  storage: Storage,
  workspaceId: string,
  brandId: string,
  design: Design,
): Promise<ResourceBytes> {
  const resources = await brandResourcesFor(db, storage, workspaceId, brandId, design)
  return { ...resources, fonts: [...loadFontFiles(), ...resources.fonts] }
}
