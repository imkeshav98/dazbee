// Where layers, pages and frames go in their order, and copies of layers with fresh ids and the
// link ids they take.
import { generateKeyBetween } from 'fractional-indexing'
import { nanoid } from 'nanoid'

import { type Design, type Layer as LayerT } from '@dazbee/schema'

import { ancestorsOf, childrenOf, descendants } from '../children.ts'
import { toYNode } from '../design-doc.ts'
import type { CommandContext } from './define.ts'
import { fitted, type Size } from './fit.ts'

/**
 * The link ids copies take: 'new', a new one each; 'keep', each its original's; a Map, one new link
 * per old link, filled as it goes, so copies made together stay linked to each other; `{ held }`,
 * the link ids the frame they go into holds: each keeps its original's where the frame doesn't hold
 * it yet, and then holds it, else a new one.
 */
export type LinkRule = 'new' | 'keep' | Map<string, string> | { held: Set<string> }

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

/** The link id each copy takes, from its original's, by the rule. */
export function linkMaker(rule: LinkRule): (old: string) => string {
  if (rule === 'new') return () => nanoid()
  if (rule === 'keep') return (old) => old
  if (rule instanceof Map)
    return (old) => {
      const fresh = rule.get(old) ?? nanoid()
      rule.set(old, fresh)
      return fresh
    }
  return (old) => {
    if (rule.held.has(old)) return nanoid()
    rule.held.add(old)
    return old
  }
}

/**
 * Copies layers with fresh ids, each with every layer under it; `place` says where each copied
 * root goes. Returns the old id to new id map.
 */
export function copyLayers(
  r: CommandContext['r'],
  design: Design,
  roots: string[],
  place: (root: string) => { parentId: string; index: string },
  options: {
    /** The link ids the copies take ('new' by default). */
    links?: LinkRule
    /** Lays the copies out to fit (fit.ts) from a frame of `from` to one of `to`. */
    fit?: { from: Size; to: Size }
  } = {},
) {
  const { links = 'new', fit } = options
  const linkOf = linkMaker(links)
  const ids = new Map<string, string>()
  /** The copied root each copied layer is under, itself for a root. */
  const rootOf = new Map<string, string>()
  for (const root of roots) {
    for (const old of [root, ...descendants(design, root)]) {
      ids.set(old, nanoid())
      rootOf.set(old, root)
    }
  }
  for (const [old, fresh] of ids) {
    const node = design.nodes[old]
    if (!node) continue
    const placed = roots.includes(old)
      ? place(old)
      : { parentId: ids.get(node.parentId) ?? node.parentId, index: node.index }
    const root = design.nodes[rootOf.get(old) as string] as LayerT
    const props = fit ? fitted(node.props, root.props, fit) : node.props
    r.nodes.set(fresh, toYNode({ ...node, ...placed, link: linkOf(node.link), props } as LayerT))
  }
  return ids
}

/**
 * Copies every layer of a frame into another frame, each top layer at the index it had, with
 * everything under it. Returns the old id to new id map.
 */
export function copyFrameLayers(
  r: CommandContext['r'],
  design: Design,
  from: string,
  to: string,
  options: Parameters<typeof copyLayers>[4] = {},
) {
  const roots = childrenOf(design, from).map(([id]) => id)
  return copyLayers(
    r,
    design,
    roots,
    (root) => ({ parentId: to, index: (design.nodes[root] as LayerT).index }),
    options,
  )
}

export const depthOf = (design: Design, id: string) => ancestorsOf(design, design.nodes[id]?.parentId ?? '').length

export const lastOrder = (entries: { order: string }[]) =>
  entries
    .map((e) => e.order)
    .sort()
    .at(-1) ?? null
