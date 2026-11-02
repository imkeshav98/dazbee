// Image files dropped from the computer on the stage: each uploads once into the brand's asset
// library, as the library's own upload sends it, then goes on the design where it was dropped,
// the way an asset dragged from the library does. An SVG file is placed from its own bytes, read
// as text by the editor, never by the browser's image decoder.
import type { Editor, Point, Spot } from '@dazbee/editor'
import { isVectorAsset, type AssetSummary } from '@dazbee/schema'
import { IMAGE_ACCEPT, sendAsset } from './upload-asset.ts'

/** The image types a fill takes. */
const FILL_TYPES = IMAGE_ACCEPT.split(',')
const SVG_TYPE = 'image/svg+xml'
/** How far apart, in screen pixels at the drop, the images of one drop are laid: each lower and to the right of the one before. */
const CASCADE = 24
/** How often placing checks again whether a drag, scrub, pen path or typing has ended. */
const IDLE_CHECK_MS = 50
/** How long placing waits for them before it ends a pen path and steps around a drag or scrub. */
const IDLE_LIMIT_MS = 3000

/** Whether a drag carries files from the computer. */
export const carriesFiles = (transfer: DataTransfer) => transfer.types.includes('Files')

/** Whether a file is one the asset library takes: a PNG, JPEG or WebP image, or an SVG file. */
export const isAssetFile = (file: { name: string; type: string }) =>
  FILL_TYPES.includes(file.type) || file.type === SVG_TYPE || /\.svg$/i.test(file.name)

/**
 * Whether files of these types, all a drop holds, fill the shape under them: one is an image a fill
 * takes and no other may be one the library takes. A file without a type may be an SVG file, known
 * by its name only once dropped, so it counts as one that may. Read from the types alone, the same
 * while dragging, when only they can be read, and on the drop.
 */
const fillsByTypes = (types: string[]) => {
  const maybe = types.filter((type) => type === '' || isAssetFile({ name: '', type }))
  return maybe.length === 1 && FILL_TYPES.includes(maybe[0] ?? '')
}

/** Whether a drag of files would fill the shape under it, so the shape lights up. */
export const dragFills = (transfer: DataTransfer) => fillsByTypes(Array.from(transfer.items).filter((item) => item.kind === 'file').map((item) => item.type))

/** Where a drop goes, read when it lands, so a pan or zoom while the files upload doesn't move it. */
export interface Drop {
  /** The point on the design it was dropped on; null off every frame. */
  spot: Spot | null
  /** The layer the one image fills, lit while it was dragged over it; null for new layers. */
  into: string | null
  /** How far apart the new layers go, in design pixels. */
  step: number
}

/** Reads where `files`, every file dropped at `client`, go, and clears the lit shape. */
export function dropAt(editor: Editor, client: Point, files: File[]): Drop {
  const into = fillsByTypes(files.map((file) => file.type)) ? editor.imageTarget(client) : null
  editor.imageTarget(null)
  return { spot: editor.spotAt(client), into, step: CASCADE / editor.camera().zoom }
}

export interface DropResult {
  /** The files that didn't upload, and why. */
  failed: { name: string; reason: string }[]
  /** How many uploaded but weren't placed, having been dropped on no page or one gone since. */
  unplaced: number
}

/**
 * Resolves once no drag, scrub, pen path or typing is open on the editor, ending any typing. After
 * IDLE_LIMIT_MS it ends a pen path, as Enter does, and resolves even with a drag or scrub still
 * open. False once the editor is destroyed.
 */
async function settled(editor: Editor): Promise<boolean> {
  const until = Date.now() + IDLE_LIMIT_MS
  for (;;) {
    if (editor.destroyed()) return false
    editor.stopEditing()
    if (!editor.gesturing()) return true
    if (Date.now() >= until) {
      editor.settle()
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, IDLE_CHECK_MS))
  }
}

/**
 * Uploads the files and places what uploaded where `drop` says: one image dropped on a layer that
 * takes an image fills it, otherwise each goes on as a new layer, the first centred on the drop
 * point and the rest cascading from it. Placing waits a little for what is open on the editor to
 * end, and ends typing, so everything placed is one undo step of its own, and selected.
 */
export async function placeDroppedFiles(editor: Editor, brandId: string, files: File[], drop: Drop): Promise<DropResult> {
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
  const { spot, into, step } = drop
  if (!spot || done.length === 0) return { failed, unplaced: done.length }

  if (!(await settled(editor))) return { failed, unplaced: 0 }
  // The page or format dropped on may have gone while the files uploaded.
  const frame = editor.frames().find((f) => f.key === spot.frame)
  if (!frame) return { failed, unplaced: done.length }
  const ids: string[] = []
  let unplaced = 0
  const [only] = done
  const filled = editor.apart(() => {
    if (into && only && done.length === 1 && !only.svg && editor.fillWithImage(into, only.asset, spot.frame)) return true
    done.forEach(({ asset, svg }, i) => {
      const next = { frame: spot.frame, x: spot.x + i * step, y: spot.y + i * step }
      const at = next.x <= frame.width && next.y <= frame.height ? next : spot
      const id = svg !== null ? editor.placeSvg(svg, asset.name || 'SVG', at) : editor.placeImage(asset, at)
      // An SVG file that can't be read is noticed by the editor.
      if (id) ids.push(id)
      else if (svg === null) unplaced++
    })
    return false
  })
  const [pageId, formatId] = spot.frame.split('/')
  if (!filled && ids.length > 1) editor.select(ids, pageId, formatId)
  return { failed, unplaced }
}
