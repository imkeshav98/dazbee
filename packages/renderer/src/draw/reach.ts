// How far a layer draws past its box (its strokes, text, children, shadows and blur), so the
// offscreen layer it is drawn into need be no bigger.
import type { CanvasKit } from '@dazbee/canvaskit'
import type { Effect, Rect, TextProps } from '@dazbee/schema'

import type { Resources } from '../resources.ts'
import type { SceneLayer } from '../scene.ts'
import { laidOut } from '../text/layout.ts'
import { booleanPath, shapePath } from './paths.ts'
import { strokeReach } from './strokes.ts'

/** Blur radii in the schema are twice the Gaussian sigma, as in CSS box-shadow and design tools. */
export const sigma = (radius: number) => radius / 2

export const outset = (box: Rect, by: number): Rect => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + 2 * by,
  height: box.height + 2 * by,
})

/** A Gaussian blur's visible reach, in sigmas. */
const BLUR_REACH = 3

/** Everything a layer draws, shadows and blur included, in its parent's coordinates. */
export function layerReach(ck: CanvasKit, layer: SceneLayer, resources: Resources): Rect {
  return rotated(unturnedReach(ck, layer, resources), layer.props, layer.props.rotation)
}

/** Everything a layer draws, shadows and blur included, in its own unturned coordinates. */
export function unturnedReach(ck: CanvasKit, layer: SceneLayer, resources: Resources): Rect {
  return withEffects(drawnBounds(ck, layer, resources), layer.props.effects)
}

/** The box after turning it about its own centre, as the axis-aligned box around the result. */
function rotated(box: Rect, about: Rect, degrees: number): Rect {
  if (degrees === 0) return box
  const a = (degrees * Math.PI) / 180
  const cx = about.x + about.width / 2
  const cy = about.y + about.height / 2
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([px = 0, py = 0]) => [
    cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a),
    cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a),
  ])
  const xs = corners.map(([x = 0]) => x)
  const ys = corners.map(([, y = 0]) => y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

/** Grows a layer's drawn bounds by how far its shadows and blur reach. */
function withEffects(box: Rect, effects: readonly Effect[]): Rect {
  let reach = box
  for (const effect of effects) {
    if (effect.type === 'dropShadow' || effect.type === 'glow') {
      const shadow = outset(box, BLUR_REACH * sigma(effect.blur) + Math.max(0, effect.spread))
      const { x = 0, y = 0 } = effect.type === 'dropShadow' ? effect : {}
      reach = union(reach, { ...shadow, x: shadow.x + x, y: shadow.y + y })
    } else if (effect.type === 'innerShadow') {
      // Drawn only inside the layer, but made from what lies around it: the offscreen holds that
      // much of the outside, so the edges of the offscreen never show as edges of the layer.
      reach = union(
        reach,
        outset(box, Math.max(Math.abs(effect.x), Math.abs(effect.y)) + BLUR_REACH * sigma(effect.blur) + effect.spread),
      )
    } else if (effect.type === 'layerBlur') {
      reach = outset(reach, BLUR_REACH * sigma(effect.radius))
    }
  }
  return reach
}

/** What a layer's content can touch, in its own unrotated coordinates. */
function drawnBounds(ck: CanvasKit, layer: SceneLayer, resources: Resources): Rect {
  switch (layer.type) {
    case 'graphic':
    case 'boolean': {
      const path = layer.type === 'graphic' ? shapePath(ck, layer) : booleanPath(ck, layer)
      const [left = 0, top = 0, right = 0, bottom = 0] = path.computeTightBounds()
      path.delete()
      const line = layer.type === 'graphic' && layer.props.shape.kind === 'line'
      return outset(
        { x: left, y: top, width: right - left, height: bottom - top },
        strokeReach(layer.props.strokes, line),
      )
    }
    case 'text':
      return textBounds(ck, layer.props, resources)
    case 'box': {
      const own = outset(layer.props, strokeReach(layer.props.strokes, false))
      return layer.props.clip ? own : childrenBounds(ck, layer, resources, own)
    }
    case 'group':
      return childrenBounds(ck, layer, resources, { x: layer.props.x, y: layer.props.y, width: 0, height: 0 })
  }
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/**
 * Where a text layer's lines sit, from the same paragraph drawing lays out, which can be outside
 * its box: a fixed box overflows, an auto width box grows. Glyphs can reach past their line's
 * ascent, descent and advance (marks, swashes, wide letters), so each side gets half the largest
 * font size more.
 */
function textBounds(ck: CanvasKit, props: TextProps, resources: Resources): Rect {
  const { blocks, dy, scale, done } = laidOut(ck, props, resources)
  let box: Rect = props
  for (const b of blocks) {
    for (const line of b.paragraph.getLineMetrics()) {
      box = union(box, {
        x: props.x + b.x + line.left,
        y: props.y + dy + b.y + line.baseline - line.ascent,
        width: line.width,
        height: line.ascent + line.descent,
      })
    }
    if (b.marker)
      box = union(box, {
        x: props.x + b.markerX,
        y: props.y + dy + b.y + b.markerY,
        width: b.marker.getMaxIntrinsicWidth(),
        height: b.marker.getHeight(),
      })
  }
  done()
  // Outlines reach half their width past the glyphs.
  const outline =
    Math.max(props.style.outline?.width ?? 0, ...props.runs.map((r) => r.style.outline?.width ?? 0)) * scale
  const largest = Math.max(props.style.fontSize, ...props.runs.map((r) => r.style.fontSize ?? 0)) * Math.max(1, scale)
  return outset(box, largest / 2 + outline / 2)
}

/** A container's own box grown by everything its children draw, each turned as it is drawn. */
function childrenBounds(ck: CanvasKit, layer: SceneLayer, resources: Resources, own: Rect): Rect {
  let box = own
  for (const child of layer.children) {
    box = union(box, layerReach(ck, child, resources))
  }
  return box
}
