// Layers' outlines as CanvasKit paths: boxes, frames with their corners, shapes and booleans.
import type { CanvasKit, Path } from '@dazbee/canvaskit'
import { pathScale, type Rect } from '@dazbee/schema'

import type { SceneLayer } from '../scene.ts'

type GraphicLayer = Extract<SceneLayer, { type: 'graphic' }>
type BooleanLayer = Extract<SceneLayer, { type: 'boolean' }>

/** A clip wider than any page, so clipping to it changes nothing. */
export const EVERYWHERE = Float32Array.of(-1e6, -1e6, 1e6, 1e6)

export const rectPath = (ck: CanvasKit, box: Rect) =>
  new ck.PathBuilder().addRect(ck.XYWHRect(box.x, box.y, box.width, box.height)).detachAndDelete()

/**
 * A frame's outline, its fills and its clip: its box with its corners. Each corner's own radius is
 * scaled down with the others where two would overlap, as CSS does, and built from arcs rather than
 * as an RRect: Skia's SVG writer clips to an RRect as a <rect> with the first corner's radius.
 */
export function framePath(
  ck: CanvasKit,
  props: Rect & { cornerRadius: number | readonly [number, number, number, number] },
): Path {
  const { x, y, width, height, cornerRadius: corners } = props
  if (typeof corners === 'number') return evenRectPath(ck, props, corners)
  const sides = [
    [corners[0], corners[1], width],
    [corners[3], corners[2], width],
    [corners[0], corners[3], height],
    [corners[1], corners[2], height],
  ] as const
  const scale = Math.min(1, ...sides.map(([one, other, side]) => (one + other > 0 ? side / (one + other) : 1)))
  const [tl, tr, br, bl] = corners.map((r) => r * scale) as [number, number, number, number]
  const quarter = Math.SQRT1_2
  const builder = new ck.PathBuilder()
    .moveTo(x + tl, y)
    .lineTo(x + width - tr, y)
    .conicTo(x + width, y, x + width, y + tr, quarter)
    .lineTo(x + width, y + height - br)
    .conicTo(x + width, y + height, x + width - br, y + height, quarter)
    .lineTo(x + bl, y + height)
    .conicTo(x, y + height, x, y + height - bl, quarter)
    .lineTo(x, y + tl)
    .conicTo(x, y, x + tl, y, quarter)
  builder.close()
  return builder.detachAndDelete()
}

export function shapePath(ck: CanvasKit, layer: GraphicLayer): Path {
  const { x, y, width, height, shape } = layer.props
  switch (shape.kind) {
    case 'rect': {
      if (shape.corners) {
        // Skia scales radii down together when two corners would overlap, as CSS does.
        const [a, b, c, d] = shape.corners
        return new ck.PathBuilder()
          .addRRect(Float32Array.of(x, y, x + width, y + height, a, a, b, b, c, c, d, d))
          .detachAndDelete()
      }
      return evenRectPath(ck, { x, y, width, height }, shape.cornerRadius)
    }
    case 'ellipse':
      return new ck.PathBuilder().addOval(ck.XYWHRect(x, y, width, height)).detachAndDelete()
    case 'polygon':
      return roundedPolygon(
        ck,
        around(layer.props, shape.sides, () => 1),
        shape.cornerRadius,
      )
    case 'star':
      return roundedPolygon(
        ck,
        around(layer.props, shape.points * 2, (i) => (i % 2 === 0 ? 1 : shape.innerRadius)),
        shape.cornerRadius,
      )
    case 'line':
      return new ck.PathBuilder()
        .moveTo(x, y + height / 2)
        .lineTo(x + width, y + height / 2)
        .detachAndDelete()
    case 'path': {
      // Path data is placed at x and y, scaled from the box it was drawn in to this one.
      const parsed = ck.Path.MakeFromSVGString(shape.d)
      if (!parsed) throw new Error(`layer "${layer.id}" has path data CanvasKit can't read`)
      const builder = new ck.PathBuilder(parsed)
      parsed.delete()
      const { sx, sy } = pathScale(shape, width, height)
      return builder
        .transform(ck.Matrix.multiply(ck.Matrix.translated(x, y), ck.Matrix.scaled(sx, sy)))
        .setFillType(shape.fillRule === 'evenodd' ? ck.FillType.EvenOdd : ck.FillType.Winding)
        .detachAndDelete()
    }
  }
}

/**
 * A boolean's outline: its shapes' outlines, each turned as it is drawn, combined in order. Lines
 * enclose nothing, so they add nothing.
 */
export function booleanPath(ck: CanvasKit, layer: BooleanLayer): Path {
  const op = {
    union: ck.PathOp.Union,
    subtract: ck.PathOp.Difference,
    intersect: ck.PathOp.Intersect,
    exclude: ck.PathOp.XOR,
  }[layer.props.op]
  let result: Path | null = null
  for (const child of layer.children) {
    if (child.type === 'graphic' && child.props.shape.kind === 'line') continue
    if (child.type !== 'graphic' && child.type !== 'boolean') continue
    const own = child.type === 'graphic' ? shapePath(ck, child) : booleanPath(ck, child)
    const { x, y, width, height, rotation } = child.props
    const builder = new ck.PathBuilder(own)
    own.delete()
    const outline = builder
      .transform(ck.Matrix.rotated((rotation * Math.PI) / 180, x + width / 2, y + height / 2))
      .detachAndDelete()
    if (!result) {
      result = outline
      continue
    }
    // Path.makeCombined is typed but not bound in this build; the factory is.
    const combined: Path | null = ck.Path.MakeFromOp(result, outline, op)
    outline.delete()
    if (combined) {
      result.delete()
      result = combined
    }
  }
  return result ?? new ck.PathBuilder().detachAndDelete()
}

/** The outline a background blur fills: a shape's own path, otherwise the layer's box. */
export function outlineOf(ck: CanvasKit, layer: SceneLayer): Path {
  if (layer.type === 'graphic') return shapePath(ck, layer)
  if (layer.type === 'boolean') return booleanPath(ck, layer)
  if (layer.type === 'frame') return framePath(ck, layer.props)
  return rectPath(ck, layer.props)
}

/** A box with one radius on every corner, no more than half its shorter side. */
function evenRectPath(ck: CanvasKit, { x, y, width, height }: Rect, radius: number): Path {
  const r = Math.min(radius, width / 2, height / 2)
  return new ck.PathBuilder().addRRect(ck.RRectXY(ck.XYWHRect(x, y, width, height), r, r)).detachAndDelete()
}

/**
 * `count` corners evenly round a circle, the first at the top, each at `scale(i)` of the way out
 * from the centre (a regular polygon, or a star's outer and inner corners), then stretched so
 * they fill the box: a triangle's base sits on the box's bottom edge, as in other design tools.
 */
function around(box: Rect, count: number, scale: (i: number) => number): [number, number][] {
  const unit = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count
    return [scale(i) * Math.cos(a), scale(i) * Math.sin(a)] as const
  })
  const xs = unit.map(([x]) => x)
  const ys = unit.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const sx = box.width / (Math.max(...xs) - left || 1)
  const sy = box.height / (Math.max(...ys) - top || 1)
  return unit.map(([x, y]) => [box.x + (x - left) * sx, box.y + (y - top) * sy])
}

/**
 * A closed outline through `points` with each corner rounded by `radius`, as far as the corner
 * allows: an arc never runs past half of either edge it meets.
 */
function roundedPolygon(ck: CanvasKit, points: [number, number][], radius: number): Path {
  const builder = new ck.PathBuilder()
  const at = (i: number) => points[(i + points.length) % points.length] as [number, number]
  if (radius <= 0) return builder.addPolygon(points.flat(), true).detachAndDelete()
  const [lx, ly] = at(-1)
  const [fx, fy] = at(0)
  builder.moveTo((lx + fx) / 2, (ly + fy) / 2)
  for (let i = 0; i < points.length; i++) {
    const [px, py] = at(i - 1)
    const [vx, vy] = at(i)
    const [nx, ny] = at(i + 1)
    const a = Math.hypot(px - vx, py - vy)
    const b = Math.hypot(nx - vx, ny - vy)
    const angle = Math.acos(Math.max(-1, Math.min(1, ((px - vx) * (nx - vx) + (py - vy) * (ny - vy)) / (a * b || 1))))
    const r = Math.min(radius, (Math.min(a, b) / 2) * Math.tan(angle / 2))
    builder.arcToTangent(vx, vy, (vx + nx) / 2, (vy + ny) / 2, r)
  }
  builder.close()
  return builder.detachAndDelete()
}
