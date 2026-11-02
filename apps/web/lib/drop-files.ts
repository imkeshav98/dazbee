// Image files dropped from the computer on the stage: each uploads once into the brand's asset
// library, as the library's own upload sends it, then goes on the design where it was dropped,
// the way an asset dragged from the library does. An SVG file is placed from its own bytes, read
// as text by the editor, never by the browser's image decoder.
import type { Editor, Point } from '@dazbee/editor'
import { isVectorAsset, type AssetSummary } from '@dazbee/schema'
import { IMAGE_ACCEPT, sendAsset } from './upload-asset.ts'

/** The image types a fill takes. */
const FILL_TYPES = IMAGE_ACCEPT.split(',')
/** How far apart, in screen pixels, the images of one drop are laid: each lower and to the right of the one before. */
const CASCADE = 24

/** Whether a drag carries files from the computer. */
export const carriesFiles = (transfer: DataTransfer) => transfer.types.includes('Files')

/** Whether a file is one the asset library takes: a PNG, JPEG or WebP image, or an SVG file. */
export const isAssetFile = (file: { name: string; type: string }) =>
  FILL_TYPES.includes(file.type) || file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

/** Whether a drag of files carries one image that can fill a shape, so the shape under it lights up. */
export function oneFillImage(transfer: DataTransfer) {
  const [item, ...more] = Array.from(transfer.items)
  return !!item && more.length === 0 && item.kind === 'file' && FILL_TYPES.includes(item.type)
}

export interface DropResult {
  /** The files that didn't upload, and why. */
  failed: { name: string; reason: string }[]
  /** How many images uploaded but weren't placed, having been dropped on no page. */
  unplaced: number
}

/**
 * Uploads the files and places what uploaded at `client`, in client coordinates: one image dropped
 * on a layer that takes an image fills it, otherwise each goes on as a new layer, the first centred
 * on the drop point and the rest cascading from it. Every layer placed is one undo step together,
 * and selected.
 */
export async function placeDroppedFiles(editor: Editor, brandId: string, files: File[], client: Point): Promise<DropResult> {
  const sent = await Promise.allSettled(files.map(async (file) => {
    const asset = await sendAsset(brandId, file, () => undefined)
    return { asset, svg: isVectorAsset(asset) ? await file.text() : null }
  }))
  const failed: DropResult['failed'] = []
  const done: { asset: AssetSummary; svg: string | null }[] = []
  sent.forEach((result, i) => {
    if (result.status === 'fulfilled') done.push(result.value)
    else failed.push({ name: files[i]?.name ?? '', reason: result.reason instanceof Error ? result.reason.message : String(result.reason) })
  })

  const [only] = done
  if (only && done.length === 1 && !only.svg) {
    const into = editor.imageTarget(client)
    editor.imageTarget(null)
    if (into && editor.fillWithImage(into, only.asset)) return { failed, unplaced: 0 }
  }

  const ids: string[] = []
  let unplaced = 0
  const end = editor.beginGesture()
  try {
    done.forEach(({ asset, svg }, i) => {
      const at = { x: client.x + i * CASCADE, y: client.y + i * CASCADE }
      const id = svg !== null
        ? editor.placeSvg(svg, asset.name || 'SVG', at)
        : editor.placeImage(asset, at) ?? (i > 0 ? editor.placeImage(asset, client) : null)
      if (id) ids.push(id)
      else if (svg === null) unplaced++
    })
  } finally {
    end()
  }
  const frame = editor.selectedFrame()
  if (ids.length > 1 && frame) {
    const [pageId, formatId] = frame.split('/')
    editor.select(ids, pageId, formatId)
  }
  return { failed, unplaced }
}
