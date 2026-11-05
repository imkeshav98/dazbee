// Scenes and pictures by frame. A frame is recorded again only when a layer it shows or the frame
// itself changed: dragging in one frame leaves the other frames' pictures as they are, and panning
// records nothing.
import type { CanvasKit, SkPicture } from '@dazbee/canvaskit'
import { childrenOf } from '@dazbee/doc'
import {
  drawFrame,
  drawLayers,
  layerPictures,
  type MeasureText,
  type ParagraphCache,
  paragraphCache,
  render,
  type Resources,
  type Scene,
  type SceneLayer,
  sceneMemo,
  type TextLayout,
  textMeasure,
} from '@dazbee/renderer'
import type { Design } from '@dazbee/schema'

import type { EditorResources } from '../resources.ts'
import type { Frame } from './frames.ts'

export interface ScenesDeps {
  ck: CanvasKit
  resources: EditorResources
  /** The design as last drawn, which the scenes show. */
  drawn: () => Design
}

export interface FrameScenes {
  /** A frame's scene, made again only when what it shows changed. */
  scene(frame: Frame): Scene
  /** Measures text with the fonts the screen draws with, as auto layout does. */
  measure(): MeasureText
  /** Text laid out as drawn, from the screen's cache, which owns it. */
  layout(props: Parameters<ParagraphCache['layout']>[1]): TextLayout
  /**
   * The pictures of the frames in view for a redraw, `all` being every frame of the shown page: each
   * one recorded again where it changed, and how many were. A frame off the shown page lets go of its
   * picture and keeps its scene until the design has no such frame.
   */
  pictures(
    all: Frame[],
    inView: Frame[],
    screen: Resources,
  ): { pictures: { frame: Frame; picture: SkPicture }[]; recorded: number }
  /**
   * A picture of some of a frame's layers, each with what it holds, in the frame's design pixels and
   * not cut to the frame: what a drag carries past the frame's edge. Kept until asked for another.
   */
  ghost(frame: Frame, ids: readonly string[], screen: Resources): SkPicture
  destroy(): void
}

/** A frame's scene and its recorded drawing, kept until the layers it shows change. */
interface FrameCache {
  deps: unknown[]
  scene: Scene
  picture: SkPicture | null
}

const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function frameScenes({ ck, resources, drawn }: ScenesDeps): FrameScenes {
  /** Each frame's scene and picture, by frame id. */
  const frames = new Map<string, FrameCache>()
  /** The resources the pictures were recorded with; others record them all again. */
  let picturesFor: Resources | null = null
  /** The resources pictures are recorded with, the text and layer caches added, for `picturesFor`. */
  let recordingWith: { for: Resources; resources: Resources } | null = null
  // Auto layout measures text with the fonts the screen draws with (#46); a new font set measures anew.
  let measuring: { for: Resources; measure: MeasureText } | null = null
  /** The last ghost asked for, by the scene and layers it shows. */
  let ghosted: { scene: Scene; ids: string; picture: SkPicture } | null = null

  // Text laid out and layers recorded once and kept: recording a frame again records only the
  // layers that changed, and lays out only the text that did.
  const paragraphs = paragraphCache()
  const scenes = sceneMemo()
  const layers = layerPictures()

  function scene(frame: Frame) {
    return cached(frame).scene
  }
  function measure() {
    const now = resources.resources()
    if (measuring?.for !== now) measuring = { for: now, measure: textMeasure(ck, now) }
    return measuring.measure
  }
  function layout(props: Parameters<ParagraphCache['layout']>[1]) {
    return paragraphs.layout(ck, props, resources.resources())
  }

  function pictures(all: Frame[], inView: Frame[], screen: Resources) {
    if (screen !== picturesFor) {
      for (const entry of frames.values()) {
        entry.picture?.delete()
        entry.picture = null
      }
      picturesFor = screen
    }
    const kept = new Set(all.map((f) => f.id))
    const design = drawn()
    for (const [key, entry] of frames) {
      if (kept.has(key)) continue
      entry.picture?.delete()
      entry.picture = null
      if (Object.hasOwn(design.frames, key)) continue
      frames.delete(key)
      scenes.delete(key)
    }

    let recorded = 0
    const shown: { frame: Frame; picture: SkPicture }[] = []
    for (const frame of inView) {
      const entry = cached(frame)
      if (!entry.picture) {
        entry.picture = record(entry.scene, withParagraphs(screen))
        recorded++
      }
      shown.push({ frame, picture: entry.picture })
    }
    return { pictures: shown, recorded }
  }
  function ghost(frame: Frame, ids: readonly string[], screen: Resources) {
    const { scene } = cached(frame)
    const key = ids.join(' ')
    if (ghosted?.scene === scene && ghosted.ids === key) return ghosted.picture
    const layers = ids.flatMap((id) => findLayer(scene.layers, id) ?? [])
    const recorder = new ck.PictureRecorder()
    try {
      drawLayers(ck, recorder.beginRecording(ck.LTRBRect(-1e6, -1e6, 1e6, 1e6)), layers, withParagraphs(screen))
      ghosted?.picture.delete()
      ghosted = { scene, ids: key, picture: recorder.finishRecordingAsPicture() }
      return ghosted.picture
    } finally {
      recorder.delete()
    }
  }
  /** Lets go of every frame's scene and picture. */
  function forget() {
    for (const entry of frames.values()) entry.picture?.delete()
    frames.clear()
  }

  function cached(frame: Frame): FrameCache {
    const deps = depsOf(frame)
    const entry = frames.get(frame.id)
    if (entry && sameDeps(entry.deps, deps)) return entry
    entry?.picture?.delete()
    const fresh = {
      deps,
      scene: render(drawn(), frame.id, scenes, measure(), resources.bytes().variables),
      picture: null,
    }
    frames.set(frame.id, fresh)
    return fresh
  }
  function depsOf(frame: Frame) {
    const design = drawn()
    // The brand kit's values too (#53): a change rebuilds the scene, reusing every unbound layer.
    const deps: unknown[] = [design.frames[frame.id], resources.bytes().variables]
    const walk = (parentId: string) => {
      for (const [id, node] of childrenOf(design, parentId)) {
        deps.push(id, node)
        walk(id)
      }
    }
    walk(frame.id)
    return deps
  }
  function record(scene: Scene, with_: Resources) {
    const recorder = new ck.PictureRecorder()
    try {
      drawFrame(ck, recorder.beginRecording(ck.XYWHRect(0, 0, scene.width, scene.height)), scene, with_)
      return recorder.finishRecordingAsPicture()
    } finally {
      recorder.delete()
    }
  }
  function withParagraphs(screen: Resources) {
    if (recordingWith?.for !== screen) recordingWith = { for: screen, resources: { ...screen, paragraphs, layers } }
    return recordingWith.resources
  }

  // Auto layout measures text in its font, so arriving fonts make every frame's scene again, not only its picture.
  const stopArriving = resources.onArrive((fonts) => {
    if (fonts) forget()
  })

  function destroy() {
    stopArriving()
    ghosted?.picture.delete()
    forget()
    layers.delete()
    paragraphs.delete()
  }

  return {
    scene,
    measure,
    layout,
    pictures,
    ghost,
    destroy,
  }
}

/** The layer with an id in a scene's layers, at any depth. */
export function findLayer(layers: SceneLayer[], id: string): SceneLayer | undefined {
  for (const l of layers) {
    if (l.id === id) return l
    const inner = findLayer(l.children, id)
    if (inner) return inner
  }
  return undefined
}
