// Where layers, pages and formats go in their order, and copies of layers with fresh ids.
import { generateKeyBetween } from 'fractional-indexing'
import { nanoid } from 'nanoid'

import { type Design } from '@dazbee/schema'

import { ancestorsOf, childrenOf, descendants } from '../children.ts'
import { overrideKey, toYNode } from '../design-doc.ts'
import type { CommandContext } from './define.ts'

/**
 * A fractional index between two neighbours that never throws. Neighbours can tie (two tabs
 * inserting at once) or use keys the library rejects (hand-written fixtures such as `a000`);
 * then it falls back to the nearest key it can make, and id order settles any remaining tie.
 */
export function indexBetween(before: string | null, after: string | null): string {
  const attempts: [string | null, string | null][] = [
    [before, after],
    [before, null],
    [null, after],
    [null, null],
  ]
  for (const [a, b] of attempts) {
    try {
      return generateKeyBetween(a, b)
    } catch {
      // try the next, looser pair
    }
  }
  return 'a0'
}

export const topIndex = (design: Design, parentId: string) =>
  indexBetween(childrenOf(design, parentId).at(-1)?.[1].index ?? null, null)

/**
 * Copies layers with fresh ids, each with every layer under it and their overrides in every
 * format; `place` says where each copied root goes. Returns the old id to new id map.
 */
export function copyLayers(
  r: CommandContext['r'],
  design: Design,
  roots: string[],
  place: (root: string) => { parentId: string; index: string },
) {
  const ids = new Map<string, string>()
  for (const root of roots) for (const old of [root, ...descendants(design, root)]) ids.set(old, nanoid())
  for (const [old, fresh] of ids) {
    const node = design.nodes[old]
    if (!node) continue
    const placed = roots.includes(old)
      ? place(old)
      : { parentId: ids.get(node.parentId) ?? node.parentId, index: node.index }
    r.nodes.set(fresh, toYNode({ ...node, ...placed }))
    for (const [scope, byNode] of Object.entries(design.overrides)) {
      for (const [path, value] of Object.entries(byNode[old] ?? {}))
        r.overrides.set(overrideKey(scope, fresh, path), value)
    }
  }
  return ids
}

export const depthOf = (design: Design, id: string) => ancestorsOf(design, design.nodes[id]?.parentId ?? '').length

export const lastOrder = (entries: { order: string }[]) =>
  entries
    .map((e) => e.order)
    .sort()
    .at(-1) ?? null
