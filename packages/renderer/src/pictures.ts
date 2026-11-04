import type { Canvas, CanvasKit, SkPicture as Picture } from '@dazbee/canvaskit'

import { lru } from './lru.ts'
import type { Resources } from './resources.ts'
import type { SceneLayer } from './scene.ts'

export type LayerPictures = ReturnType<typeof layerPictures>

/** Wide enough for any layer in any frame: playback never clips to it, the frame clip does. */
const ANYWHERE = 1e6

/**
 * Each top-level layer recorded once and kept, for the editor's screen (#36): recording a frame
 * again replays the layers that didn't change, so typing in one layer costs one layer, not the
 * frame. A layer is known by its object, which `render` with a `SceneMemo` keeps while nothing it
 * draws changes; the whole cache goes when the fonts or images it was drawn with do. The oldest
 * pictures go past `limit`.
 */
export function layerPictures(limit = 4000) {
  // The recorded pictures by layer, least recently used first.
  const entries = lru<SceneLayer, Picture>(limit, (picture) => picture.delete())
  // The fonts, images and fallback families the kept pictures were drawn with.
  let drawnWith: Pick<Resources, 'fonts' | 'images' | 'fallbackFamilies'> | null = null

  function picture(ck: CanvasKit, layer: SceneLayer, resources: Resources, draw: (canvas: Canvas) => void): Picture {
    if (
      drawnWith?.fonts !== resources.fonts ||
      drawnWith.images !== resources.images ||
      drawnWith.fallbackFamilies !== resources.fallbackFamilies
    ) {
      entries.clear()
      drawnWith = resources
    }
    return entries.get(layer, () => record(ck, draw))
  }

  return { picture, delete: entries.clear }
}

/** What `draw` draws, recorded as a picture. */
function record(ck: CanvasKit, draw: (canvas: Canvas) => void): Picture {
  const recorder = new ck.PictureRecorder()
  try {
    draw(recorder.beginRecording(ck.XYWHRect(-ANYWHERE, -ANYWHERE, 2 * ANYWHERE, 2 * ANYWHERE)))
    return recorder.finishRecordingAsPicture()
  } finally {
    recorder.delete()
  }
}
