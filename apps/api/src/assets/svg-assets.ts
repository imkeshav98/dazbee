// SVG files in the asset library. They are never decoded as images: the bytes are read as
// layers by @dazbee/svg, which refuses what it can't read or what would run away, and the
// thumbnail is those layers drawn by the renderer, as the editor will draw them once placed.
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { loadFontFiles } from '@dazbee/fonts/node'
import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { MAX_SVG_BYTES, SCHEMA_VERSION } from '@dazbee/schema'
import { SVG_TYPE, SvgError, svgMarkup, svgToLayers } from '@dazbee/svg'

import type { ImageHeader } from './images.ts'

/** The bytes as SVG markup: UTF-8 text whose first element is <svg>. Null for anything else. */
function svgText(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_SVG_BYTES) return null
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  return svgMarkup(text)
}

/** An SVG file's type and size, its sides rounded up to whole pixels; null when it isn't one we can read as layers. */
export async function readSvgHeader(bytes: Uint8Array): Promise<ImageHeader | null> {
  const text = svgText(bytes)
  if (!text) return null
  try {
    const { width, height } = svgToLayers(await loadCanvasKit(), text)
    return { contentType: SVG_TYPE, width: Math.max(1, Math.ceil(width)), height: Math.max(1, Math.ceil(height)) }
  } catch (error) {
    if (error instanceof SvgError) return null
    throw error
  }
}

/** The file's layers drawn on a see-through page, `size` pixels on the longer side, as a PNG. */
export async function svgThumbnail(bytes: Uint8Array, size: number): Promise<Uint8Array> {
  const text = svgText(bytes)
  if (!text) throw new Error('not an SVG file')
  const ck = await loadCanvasKit()
  const { tree, root, width, height } = svgToLayers(ck, text, { fit: size })
  const nodes = Object.fromEntries(
    Object.entries(tree.nodes).map(([id, node]) => [
      id,
      id === root ? { ...node, parentId: 'page', index: 'a0' } : node,
    ]),
  )
  const design = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      designId: 'thumbnail',
      name: 'Thumbnail',
      kind: 'single',
      primaryFormatId: 'f',
    },
    formats: {
      f: {
        name: 'Thumbnail',
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        order: 'a0',
      },
    },
    pages: { page: { name: 'Page', order: 'a0' } },
    nodes,
  }
  return renderDesign(ck, design, 'page', 'f', {
    fonts: loadFontFiles(),
    fallbackFamilies: [...FALLBACK_FAMILIES],
    images: {},
  }).png
}
