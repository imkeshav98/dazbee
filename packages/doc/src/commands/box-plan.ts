import type * as Y from 'yjs'

import type { Design } from '@dazbee/schema'

import { type Box, round } from '../geometry.ts'
import type { CommandContext } from './define.ts'

/** Where a layer is, and whether it shows. */
export type Placed = Box & { visible: boolean }
type Path = keyof Placed

const same = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : a === b

/**
 * Layers' boxes and visibility as a command plans them: read from the design, changed in the
 * plan, written once, rounded, only where they changed. Commands that keep layers where they are
 * on screen (move, group, ungroup, hug) plan from what the layers show now.
 */
export function boxPlan(design: Design) {
  const want = new Map<string, Partial<Placed>>()

  /** What the layer's props hold now. */
  const stored = (id: string): Placed => {
    const p = (design.nodes[id]?.props ?? {}) as Partial<Placed>
    return {
      x: p.x ?? 0,
      y: p.y ?? 0,
      width: p.width ?? 0,
      height: p.height ?? 0,
      rotation: p.rotation ?? 0,
      visible: p.visible ?? true,
    }
  }

  /** A layer with what has been planned for it so far over its props. */
  function get(id: string): Placed {
    return { ...stored(id), ...want.get(id) }
  }

  /** Plans a change, its numbers rounded as the document keeps them. */
  function set(id: string, patch: Partial<Placed>) {
    const rounded = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v]))
    want.set(id, { ...want.get(id), ...rounded })
  }

  /** Writes each planned value that differs from the layer's props. */
  function write(r: CommandContext['r']) {
    for (const [id, patch] of want) {
      const props = r.nodes.get(id)?.get('props') as Y.Map<unknown> | undefined
      const was = stored(id)
      for (const [path, value] of Object.entries(patch)) if (!same(was[path as Path], value)) props?.set(path, value)
    }
  }

  return { get, set, write }
}
