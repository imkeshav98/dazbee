// How the selection spans frames: the selection split by frame, what Shift and a click make of it,
// and the linked copies Ctrl+Alt+A adds to it in every frame of their page (ADR-0014).
import { copiesOf } from '@dazbee/doc'
import { type Design, frameIdOf } from '@dazbee/schema'

import { type Picked, samePick, type Selection } from './selection.ts'

/** The selection split by frame, each frame with its layers in the order they were picked, frames by their first layer. */
export function byFrame(selection: Selection | null): { frameId: string; ids: string[] }[] {
  const parts = new Map<string, string[]>()
  for (const { id, frameId } of selection ?? []) parts.set(frameId, [...(parts.get(frameId) ?? []), id])
  return [...parts].map(([frameId, ids]) => ({ frameId, ids }))
}

/**
 * The selection once Shift and a click pick a layer: a selected one is taken out; a layer of a frame
 * that holds a selected layer, or a linked copy of a selected layer, is added; any other layer is
 * selected alone.
 */
export function toggled(selection: Selection | null, layer: Picked, design: Design): Picked[] {
  const now = selection ?? []
  if (now.some((p) => samePick(p, layer))) return now.filter((p) => !samePick(p, layer))
  const link = design.nodes[layer.id]?.link
  const joins = now.some(
    (p) => p.frameId === layer.frameId || (link !== undefined && design.nodes[p.id]?.link === link),
  )
  return joins ? [...now, layer] : [layer]
}

/**
 * The selection with the linked copies of its layers in every frame of their page added after it
 * (Ctrl+Alt+A), hidden ones too. Copies locked against any change are left out, as select all
 * leaves locked layers out: with one selected, the top bar offers only to unlock.
 */
export function withCopies(selection: Selection | null, design: Design): Picked[] {
  const now = [...(selection ?? [])]
  for (const { id } of selection ?? []) {
    for (const copy of copiesOf(design, id)) {
      const frameId = frameIdOf(design, copy)
      const locked = Object.values(design.nodes[copy]?.lock ?? {}).some(Boolean)
      if (frameId === undefined || locked || now.some((p) => p.id === copy)) continue
      now.push({ id: copy, frameId })
    }
  }
  return now
}
