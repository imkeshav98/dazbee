// Scenes and pictures by frame. A frame is recorded again only when a layer it shows, an override
// in its format, its page or its format changed: dragging in one format leaves the other formats'
// pictures as they are, and panning records nothing.
import type { CanvasKit, SkPicture } from '@dazbee/canvaskit'
import { childrenOf } from '@dazbee/doc'
import {
  drawPage,
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
import { type Frame, scope } from './grid.ts'

export interface ScenesDeps {
  ck: CanvasKit
  resources: EditorResources
  /** The design as last drawn, which the scenes show. */
  drawn: () => Design
}

export interface FrameScenes {
  /** A frame's scene, made again only when what it shows changed. */
  scene(frame: Frame): Scene
  /** Measures text with the fonts the screen draws with, as auto layout does (#46). */
  measure(): MeasureText
  /** Text laid out as drawn, from the screen's cache, which owns it. */
  layout(props: Parameters<ParagraphCache['layout']>[1]): TextLayout
  /**
   * The pictures of the frames in view for a redraw, `all` being every frame of the grid: each one
   * recorded again where it changed, and how many were.
   */
  pictures(
    all: Frame[],
    drawn: Frame[],
    screen: Resources,
  ): { pictures: { frame: Frame; picture: SkPicture }[]; recorded: number }
  destroy(): void
}

/** The layer with an id in a scene's layers, at any depth. */
export const find = (layers: SceneLayer[], id: string): SceneLayer | undefined => {
  for (const l of layers) {
    if (l.id === id) return l
    const inner = find(l.children, id)
    if (inner) return inner
  }
  return undefined
}

/** A frame's scene and its recorded drawing, kept until the layers it shows change. */
interface FrameCache {
  deps: unknown[]
  scene: Scene
  picture: SkPicture | null
}

const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function frameScenes({ ck, resources: loaded, drawn }: ScenesDeps): FrameScenes {
  const frames = new Map<string, FrameCache>()
  let picturesFor: Resources | null = null
  // Text laid out and layers recorded once and kept: recording a frame again records only the
  // layers that changed, and lays out only the text that did.
  const paragraphs = paragraphCache()
  const scenes = sceneMemo()
  const layers = layerPictures()
  let recordingWith: { for: Resources; resources: Resources } | null = null
  // Auto layout measures text with the fonts the screen draws with (#46); a new font set measures anew.
  let measuring: { for: Resources; measure: MeasureText } | null = null

  const withParagraphs = (screen: Resources) => {
    if (recordingWith?.for !== screen) recordingWith = { for: screen, resources: { ...screen, paragraphs, layers } }
    return recordingWith.resources
  }

  function depsOf(frame: Frame) {
    const design = drawn()
    const overrides = design.overrides[scope(frame)]
    // The brand kit's values too (#53): a change rebuilds the scene, reusing every unbound layer.
    const deps: unknown[] = [design.pages[frame.pageId], design.formats[frame.formatId], loaded.bytes().variables]
    const walk = (parentId: string) => {
      for (const [id, node] of childrenOf(design, parentId)) {
        deps.push(id, node, overrides?.[id])
        walk(id)
      }
    }
    walk(frame.pageId)
    return deps
  }

  const measureText = () => {
    const resources = loaded.resources()
    if (measuring?.for !== resources) measuring = { for: resources, measure: textMeasure(ck, resources) }
    return measuring.measure
  }

  function cached(frame: Frame): FrameCache {
    const deps = depsOf(frame)
    const entry = frames.get(frame.key)
    if (entry && sameDeps(entry.deps, deps)) return entry
    entry?.picture?.delete()
    const fresh = {
      deps,
      scene: render(drawn(), frame.pageId, frame.formatId, scenes, measureText(), loaded.bytes().variables),
      picture: null,
    }
    frames.set(frame.key, fresh)
    return fresh
  }

  function record(scene: Scene, with_: Resources) {
    const recorder = new ck.PictureRecorder()
    try {
      drawPage(ck, recorder.beginRecording(ck.XYWHRect(0, 0, scene.width, scene.height)), scene, with_)
      return recorder.finishRecordingAsPicture()
    } finally {
      recorder.delete()
    }
  }

  function pictures(all: Frame[], drawnFrames: Frame[], screen: Resources) {
    if (screen !== picturesFor) {
      for (const entry of frames.values()) {
        entry.picture?.delete()
        entry.picture = null
      }
      picturesFor = screen
    }
    const kept = new Set(all.map((f) => f.key))
    for (const [key, entry] of frames) {
      if (kept.has(key)) continue
      entry.picture?.delete()
      frames.delete(key)
    }

    let recorded = 0
    const shown: { frame: Frame; picture: SkPicture }[] = []
    for (const frame of drawnFrames) {
      const entry = cached(frame)
      if (!entry.picture) {
        entry.picture = record(entry.scene, withParagraphs(screen))
        recorded++
      }
      shown.push({ frame, picture: entry.picture })
    }
    return { pictures: shown, recorded }
  }

  // Auto layout measures text in its font, so every frame's scene is made again, not only its picture.
  const stopArriving = loaded.onArrive((fonts) => {
    if (!fonts) return
    for (const entry of frames.values()) entry.picture?.delete()
    frames.clear()
  })

  return {
    scene: (frame: Frame) => cached(frame).scene,
    measure: measureText,
    layout: (props) => paragraphs.layout(ck, props, loaded.resources()),
    pictures,
    destroy: () => {
      stopArriving()
      for (const entry of frames.values()) entry.picture?.delete()
      frames.clear()
      paragraphs.delete()
      layers.delete()
    },
  }
}
