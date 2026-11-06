// What a drag shows over the stage while it runs: the marquee being dragged, and the snap guides
// and equal gaps of the move or resize in progress, as overlay elements.
import type { Point, Rect } from '@dazbee/schema'

import { type Camera, toScreen } from '../../canvas/camera.ts'
import type { Frame } from '../../canvas/frames.ts'
import { px } from '../../canvas/rulers.ts'
import type { Gap, Guide } from '../../layers/snap.ts'
import { round } from '../../layers/transform.ts'

/** What a drag in progress snapped to, in a frame: guides and equal gaps. */
export interface Snapped {
  frame: Frame
  guides: Guide[]
  gaps: Gap[]
}

/** The marquee being dragged, then the snap guides and equal gaps of the drag in progress. */
export function dragParts(
  marquee: { from: Point; to: Point } | null,
  snapped: Snapped | null,
  camera: Camera,
  placeBox: (el: HTMLElement, frame: Frame, box: Rect) => void,
) {
  const parts: HTMLElement[] = []
  if (marquee) {
    const el = document.createElement('div')
    el.className = 'marquee'
    const from = toScreen(camera, marquee.from)
    const to = toScreen(camera, marquee.to)
    Object.assign(el.style, {
      left: px(Math.min(from.x, to.x)),
      top: px(Math.min(from.y, to.y)),
      width: px(Math.abs(to.x - from.x)),
      height: px(Math.abs(to.y - from.y)),
    })
    parts.push(el)
  }
  if (snapped) parts.push(...snapParts(snapped, placeBox))
  return parts
}
/** Snap guides as lines across the frame, and equal gaps as marked spans with their size. */
function snapParts({ frame, guides, gaps }: Snapped, placeBox: (el: HTMLElement, frame: Frame, box: Rect) => void) {
  const parts: HTMLElement[] = []
  for (const g of guides) {
    const line = document.createElement('div')
    line.className = 'guide'
    line.dataset.axis = g.axis
    placeBox(
      line,
      frame,
      g.axis === 'x'
        ? { x: g.at, y: g.from, width: 0, height: g.to - g.from }
        : { x: g.from, y: g.at, width: g.to - g.from, height: 0 },
    )
    parts.push(line)
  }
  for (const g of gaps) {
    const span = document.createElement('div')
    span.className = 'gap'
    span.dataset.axis = g.axis
    placeBox(
      span,
      frame,
      g.axis === 'x'
        ? { x: g.from, y: g.at, width: g.to - g.from, height: 0 }
        : { x: g.at, y: g.from, width: 0, height: g.to - g.from },
    )
    const size = document.createElement('span')
    size.textContent = String(round(g.to - g.from, 0))
    span.append(size)
    parts.push(span)
  }
  return parts
}
