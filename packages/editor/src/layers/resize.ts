// What a resize of layers changes: their boxes and those of the layers under them, the text a
// corner scales, and the sizing of the axes it drags, which stop following their content.
import { childrenOf, descendants, mergedProps, type Session } from '@dazbee/doc'
import type { ScaledText } from '@dazbee/renderer'
import type { Design, Layer } from '@dazbee/schema'

import { type Frame, scope } from '../canvas/grid.ts'
import { runQuietly } from '../run-quietly.ts'
import { inFlow, layoutIn, propIn } from './auto-layout.ts'
import { type Box, carry, type Handle, isCorner, keptOnScreen, scaleWithin } from './transform.ts'

/** A layer's sizing, as the schema has it. */
type SizingOf = NonNullable<Layer['props']['sizing']>

/**
 * The boxes a resize from `from` to `to` gives `roots` and the layers under them, from their
 * `boxes` as the resize began: one root takes `to`, several scale within it.
 */
export function resizedBoxes(
  now: Design,
  frame: Frame,
  roots: string[],
  boxes: Map<string, Box>,
  from: Box,
  to: Box,
): Map<string, Box> {
  const next = new Map<string, Box>()
  for (const root of roots) {
    const was = boxes.get(root)
    if (!was) continue
    const box = roots.length === 1 ? to : scaleWithin(was, from, to)
    // Auto layout places a layer in its flow: a resize gives it a size, never a place.
    next.set(root, inFlow(frame, root, now) ? { ...box, x: was.x, y: was.y, rotation: was.rotation } : box)
    const type = now.nodes[root]?.type
    if (type === 'group' || type === 'boolean') {
      // Layers inside a group or boolean keep their place in it, scaled with it.
      for (const id of descendants(now, root)) {
        const inner = boxes.get(id)
        if (inner) next.set(id, carry(inner, was, box))
      }
    } else if (type === 'frame') {
      // A frame changes its own size only: what it holds stays as it is, where it is on screen;
      // with several layers it moves along with its frame.
      const shift = roots.length === 1 ? keptOnScreen(was, box) : { x: box.x - was.x, y: box.y - was.y }
      for (const id of descendants(now, root)) {
        const inner = boxes.get(id)
        if (inner) next.set(id, { ...inner, x: inner.x + shift.x, y: inner.y + shift.y })
      }
    }
  }
  return next
}

/**
 * The text a corner drag on `roots` scales, with its sizes in the frame now: each text whose box
 * scales with the drag, selected itself or in a group, not one in a frame, whose text keeps its
 * size. A text whose style is locked isn't scaled.
 */
export function scalingTexts(now: Design, frame: Frame, roots: string[], handle: Handle): Map<string, ScaledText> {
  const texts = new Map<string, ScaledText>()
  if (!isCorner(handle)) return texts
  const add = (id: string) => {
    const node = now.nodes[id]
    if (node?.type !== 'text' || node.lock?.style) return
    const props = mergedProps(now, scope(frame), id) as typeof node.props
    texts.set(id, {
      style: props.style,
      runs: props.runs,
      ...(props.paragraphSpacing === undefined ? {} : { paragraphSpacing: props.paragraphSpacing }),
      ...(props.shrinkToFit ? { shrinkToFit: props.shrinkToFit } : {}),
    })
  }
  const walk = (id: string) => {
    const type = now.nodes[id]?.type
    if (type === 'text') add(id)
    else if (type === 'group' || type === 'boolean') for (const [child] of childrenOf(now, id)) walk(child)
  }
  for (const id of roots) walk(id)
  return texts
}

/**
 * At the start of a resize, the axes it drags stop following their content, as in Figma: an auto
 * layout frame or a layer in a flow becomes fixed there (from hug or fill), and text that grows
 * with its words gets a fixed box there, wrapping inside a width given to it, unless a corner
 * scales it.
 */
export function switchSizing(
  session: Session,
  frame: Frame,
  ids: string[],
  handle: Handle,
  from: Design,
  scaled: ReadonlyMap<string, unknown>,
) {
  const across = handle.includes('e') || handle.includes('w')
  const down = handle.includes('n') || handle.includes('s')
  for (const id of ids) {
    const node = from.nodes[id]
    if (!node) continue
    const patch: Record<string, unknown> = {}
    const boxMode = propIn(frame, id, 'boxMode', from)
    // Text a corner scales keeps its box mode: it grows with its words still.
    if (node.type === 'text' && boxMode !== 'fixed' && !scaled.has(id)) {
      const next = down ? 'fixed' : boxMode === 'autoWidth' && across ? 'autoHeight' : boxMode
      if (next !== boxMode) patch.boxMode = next
    }
    const sizing = propIn(frame, id, 'sizing', from) as SizingOf | undefined
    // Text without sizing of its own follows its box mode, changed above; with its own, the
    // axes its new box mode fixes are fixed too.
    if ((inFlow(frame, id, from) || layoutIn(frame, id, from)) && (sizing || node.type !== 'text')) {
      const was: SizingOf = sizing ?? { width: 'fixed', height: 'fixed' }
      const mode = patch.boxMode ?? boxMode
      const fixedW = across || (node.type === 'text' && mode !== 'autoWidth')
      const fixedH = down || (node.type === 'text' && mode === 'fixed')
      const next: SizingOf = { width: fixedW ? 'fixed' : was.width, height: fixedH ? 'fixed' : was.height }
      if (next.width !== was.width || next.height !== was.height) patch.sizing = next
    }
    if (Object.keys(patch).length > 0)
      runQuietly(() => session.run('node.update', { ids: [id], scope: scope(frame), patch }))
  }
}
