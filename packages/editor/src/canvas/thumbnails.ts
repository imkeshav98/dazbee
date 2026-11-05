// Small pictures of layers and pages for the panels, and of images for the crop: drawn on the CPU
// surface, never the stage's WebGL one (ADR-0005), and kept until what they show changes.
import type { CanvasKit, Image } from '@dazbee/canvaskit'
import { frameIdOf } from '@dazbee/doc'
import { drawFrame, type Resources, type Scene, type SceneLayer } from '@dazbee/renderer'
import { type Design, framesOf } from '@dazbee/schema'

import { boundsOf } from '../layers/transform.ts'
import type { EditorResources } from '../resources.ts'
import { type Frame, frameIn } from './frames.ts'
import { findLayer, type FrameScenes } from './scenes.ts'

export interface ThumbnailsDeps {
  ck: CanvasKit
  scenes: FrameScenes
  resources: EditorResources
  /** The design as the document holds it now. */
  current: () => Design
  /** The design as last drawn. */
  drawn: () => Design
}

export interface ThumbnailCache {
  /**
   * A small picture of one layer as its frame shows it, without its own effects (the tiles show
   * those): a PNG object URL, `size` pixels square. Text is "Aa" in its look, outlined with no
   * fill when asked. Null when the layer is in no frame or draws nothing there.
   */
  layer(id: string, size?: number, outlined?: boolean): string | null
  /**
   * A small picture of a page's first frame, as the stage draws it, `size` pixels on its longer
   * side, whether the page is shown or not. Null for a page with no frames.
   */
  page(pageId: string, size?: number): string | null
  /** An image as a URL, for the crop's faint whole image. */
  ghost(image: Image): string
  destroy(): void
}

export function thumbnailCache({ ck, scenes, resources, current, drawn }: ThumbnailsDeps): ThumbnailCache {
  /**
   * Each layer's preview for the effect tiles, with what it was drawn from: its scene layer and the
   * fonts and images there were then, so one that arrives later draws it again.
   */
  const thumbnails = new Map<string, { id: string; layer: SceneLayer; resources: Resources; url: string }>()
  const pageThumbnails = new Map<string, { pageId: string; scene: Scene; resources: Resources; url: string }>()
  /** Each image as a URL for the crop's faint whole image, made once from the decoded image. */
  const ghosts = new WeakMap<Image, string>()

  /**
   * Text's preview: "Aa" in the layer's font, weight and colour, as wide as it is; `outlined` draws
   * its outline in its colour with no fill, as the Outline tile shows it.
   */
  function textSample(layer: Extract<SceneLayer, { type: 'text' }>, outlined: boolean): SceneLayer {
    const { style } = layer.props
    const sample = {
      ...layer.props,
      x: 0,
      y: 0,
      rotation: 0,
      text: 'Aa',
      runs: [],
      boxMode: 'autoWidth' as const,
      align: 'start' as const,
      verticalAlign: 'top' as const,
      list: undefined,
      maxLines: undefined,
      shrinkToFit: undefined,
      effects: [],
      style: {
        ...style,
        fontSize: 96,
        outline: outlined ? { width: 4, color: style.color } : undefined,
        color: outlined ? '#00000000' : style.color,
      },
    }
    const size = scenes.measure()(sample, null)
    return { ...layer, props: { ...sample, width: size.width, height: size.height } }
  }
  /**
   * A small picture of one layer as a frame shows it, without its own effects (the tiles show
   * those), drawn by the renderer on the CPU surface and kept until the layer, or the fonts and
   * images it is drawn with, change: a PNG as an object URL, `size` pixels square, the layer fitted
   * inside with a margin. Text is "Aa" in its look. Null when the layer isn't in the frame or draws
   * nothing there.
   */
  function layerThumbnail(frame: Frame, id: string, size: number, outlined: boolean): string | null {
    const found = findLayer(scenes.scene(frame).layers, id)
    if (!found || found.props.mask) return null
    const key = `${frame.id}/${id}${outlined ? '/outlined' : ''}@${size}`
    const kept = thumbnails.get(key)
    // Drawn with what the stage draws with: an image whose bytes are still coming is a placeholder.
    const drawWith = resources.screen(current())
    if (kept?.layer === found && kept.resources === drawWith) return kept.url
    const layer = found.type === 'text' ? textSample(found, outlined) : found
    const bounds = boundsOf([layer.props])
    if (bounds.width <= 0 && bounds.height <= 0) return null
    const margin = size * 0.12
    const scale = (size - 2 * margin) / Math.max(bounds.width, bounds.height, 1)
    const surface = ck.MakeSurface(size, size)
    if (!surface) return null
    try {
      const canvas = surface.getCanvas()
      canvas.clear(ck.TRANSPARENT)
      canvas.translate(
        size / 2 - (bounds.x + bounds.width / 2) * scale,
        size / 2 - (bounds.y + bounds.height / 2) * scale,
      )
      canvas.scale(scale, scale)
      const alone = { ...layer, props: { ...layer.props, effects: [] } } as SceneLayer
      drawFrame(
        ck,
        canvas,
        { frameId: frame.id, width: frame.width, height: frame.height, fills: [], layers: [alone] },
        drawWith,
      )
      const image = surface.makeImageSnapshot()
      const url = pngUrl(image)
      image.delete()
      if (!url) return null
      if (kept) URL.revokeObjectURL(kept.url)
      thumbnails.set(key, { id, layer: found, resources: drawWith, url })
      // Deleted layers' pictures go, once there are more pictures than the design could show.
      if (thumbnails.size > 4 * Object.keys(drawn().nodes).length + 16) {
        for (const [other, { id: was, url: old }] of thumbnails) {
          if (drawn().nodes[was]) continue
          URL.revokeObjectURL(old)
          thumbnails.delete(other)
        }
      }
      return url
    } finally {
      surface.delete()
    }
  }

  /**
   * A small picture of a page by its first frame, as the stage draws it, `size` pixels on its longer
   * side: a PNG as an object URL, drawn on the CPU surface and kept until the frame or what it is
   * drawn with changes.
   */
  function pageThumbnail(frame: Frame, size: number): string | null {
    const scene = scenes.scene(frame)
    const drawWith = resources.screen(current())
    const key = `${frame.pageId}@${size}`
    const kept = pageThumbnails.get(key)
    if (kept?.scene === scene && kept.resources === drawWith) return kept.url
    const scale = size / Math.max(frame.width, frame.height, 1)
    const surface = ck.MakeSurface(
      Math.max(1, Math.round(frame.width * scale)),
      Math.max(1, Math.round(frame.height * scale)),
    )
    if (!surface) return null
    try {
      const canvas = surface.getCanvas()
      canvas.clear(ck.TRANSPARENT)
      canvas.scale(scale, scale)
      drawFrame(ck, canvas, scene, drawWith)
      const image = surface.makeImageSnapshot()
      const url = pngUrl(image)
      image.delete()
      if (!url) return null
      if (kept) URL.revokeObjectURL(kept.url)
      pageThumbnails.set(key, { pageId: frame.pageId, scene, resources: drawWith, url })
      // A deleted page's pictures go with it.
      for (const [other, { pageId, url: old }] of pageThumbnails) {
        if (drawn().pages[pageId]) continue
        URL.revokeObjectURL(old)
        pageThumbnails.delete(other)
      }
      return url
    } finally {
      surface.delete()
    }
  }

  function ghostOf(image: Image) {
    let url = ghosts.get(image)
    if (url === undefined) {
      url = pngUrl(image) ?? ''
      ghosts.set(image, url)
    }
    return url
  }

  function pageOf(pageId: string, size = 72): string | null {
    const design = drawn()
    const first = framesOf(design, pageId)[0]
    const frame = first && frameIn(design, first[0])
    return frame ? pageThumbnail(frame, size) : null
  }
  function layerIn(id: string, size = 96, outlined = false): string | null {
    const design = drawn()
    const frameId = frameIdOf(design, id)
    const frame = frameId === undefined ? undefined : frameIn(design, frameId)
    return frame ? layerThumbnail(frame, id, size, outlined) : null
  }

  function destroy() {
    for (const { url } of pageThumbnails.values()) URL.revokeObjectURL(url)
    pageThumbnails.clear()
    for (const { url } of thumbnails.values()) URL.revokeObjectURL(url)
    thumbnails.clear()
  }

  return {
    layer: layerIn,
    page: pageOf,
    ghost: ghostOf,
    destroy,
  }
}

/** An image as a PNG object URL, or null when it doesn't encode. */
function pngUrl(image: Image): string | null {
  const png = image.encodeToBytes()
  return png ? URL.createObjectURL(new Blob([png.slice()], { type: 'image/png' })) : null
}
