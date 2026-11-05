// Copy to other frames ▸ Layer: linked copies of layers put into the linked frames that lack them.
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { canHold, frameIdOf, type Layer as LayerT, NodeId } from '@dazbee/schema'

import { ancestorsOf, childrenOf } from '../children.ts'
import { toYNode } from '../design-doc.ts'
import { round } from '../geometry.ts'
import { copyIn, framesWithout, linkedFrames } from '../links.ts'
import { missingLayer } from './checks.ts'
import { type CommandContext, defineCommand } from './define.ts'
import { fitted } from './fit.ts'
import { indexBetween } from './tree.ts'

type Area = { x: number; y: number; width: number; height: number }

/** Where a copied layer goes in a frame: its parent there, whether that stands for its own parent, and the areas it fits from and to. */
interface Target {
  parentId: string
  sameParent: boolean
  from: Area
  to: Area
}

/**
 * Copies layers into every linked frame of their page that holds no copy of them, each copy
 * keeping its link id and laid out to fit (fit.ts). A copy goes inside the copy of its parent where
 * that frame has one, laid out to fit that copy, under the copy of the nearest layer above it
 * there, else on top; otherwise on top of the frame, laid out to fit the frame. A container copied
 * in takes in the frame's own copies of the layers inside it, as they are, and copies the rest.
 * Layers go in from the outermost in, so one inside another copied goes where that one went.
 * Returns the copies' ids, by layer and then by frame order.
 */
export const nodeCopyToFrames = defineCommand({
  name: 'node.copyToFrames',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => {
    const missing = missingLayer(design, ids)
    if (missing) return missing
    if (ids.every((id) => framesWithout(design, id).length === 0)) return 'no linked frame lacks a copy of these layers'
    return undefined
  },
  apply: (ctx, { ids }) => copyToFrames(ctx, ids),
})

function copyToFrames({ r, design }: CommandContext, ids: string[]): string[] {
  /** Layers this command wrote or moved, as they now are; read before the design's own. */
  const placed = new Map<string, LayerT>()
  /** The link ids each frame has taken in this command, with the layer holding each. */
  const taken = new Map<string, Map<string, string>>()
  const nodeOf = (id: string) => placed.get(id) ?? design.nodes[id]
  const holderIn = (frameId: string, link: string) => taken.get(frameId)?.get(link) ?? copyIn(design, frameId, link)
  const hold = (frameId: string, link: string, id: string) => {
    const links = taken.get(frameId) ?? new Map<string, string>()
    taken.set(frameId, links)
    links.set(link, id)
  }
  /** What a frame or layer holds now, back to front. */
  const childrenNow = (parentId: string) =>
    [...new Set([...childrenOf(design, parentId).map(([id]) => id), ...placed.keys()])]
      .filter((id) => nodeOf(id)?.parentId === parentId)
      .sort((a, b) => {
        const [x, y] = [nodeOf(a)?.index ?? '', nodeOf(b)?.index ?? '']
        return x < y ? -1 : x > y ? 1 : a < b ? -1 : 1
      })
  /** Whether `id` is `outer` or sits inside it, as placed now. */
  const within = (id: string, outer: string) => {
    for (let up: string | undefined = id; up; up = nodeOf(up)?.parentId) if (up === outer) return true
    return false
  }

  /** Where a layer goes in a frame (see the command). */
  function targetIn(id: string, frameId: string): Target {
    const node = design.nodes[id] as LayerT
    const from = design.frames[frameIdOf(design, id) as string] as Area
    const to = design.frames[frameId] as Area
    const frameFit = {
      from: { x: 0, y: 0, width: from.width, height: from.height },
      to: { x: 0, y: 0, width: to.width, height: to.height },
    }
    const parent = design.nodes[node.parentId]
    if (!parent) return { parentId: frameId, sameParent: true, ...frameFit }
    const copy = holderIn(frameId, parent.link)
    const held = copy === undefined ? undefined : nodeOf(copy)
    if (copy === undefined || !held || !canHold(held.type, node.type))
      return { parentId: frameId, sameParent: false, ...frameFit }
    return { parentId: copy, sameParent: true, from: areaOf(parent), to: areaOf(held) }
  }

  /** The index under the copy of the nearest layer above it in its parent, when its target stands for that parent; else on top. */
  function indexIn(id: string, frameId: string, target: Target) {
    const now = childrenNow(target.parentId)
    const top = indexBetween(nodeOf(now.at(-1) ?? '')?.index ?? null, null)
    if (!target.sameParent) return top
    const own = childrenOf(design, design.nodes[id]?.parentId ?? '').map(([sibling]) => sibling)
    for (const above of own.slice(own.indexOf(id) + 1)) {
      const copy = holderIn(frameId, design.nodes[above]?.link ?? '')
      if (copy === undefined || nodeOf(copy)?.parentId !== target.parentId) continue
      const below = now[now.indexOf(copy) - 1]
      return indexBetween(below ? (nodeOf(below)?.index ?? null) : null, nodeOf(copy)?.index ?? null)
    }
    return top
  }

  /** Writes a copy of a layer, laid out to fit from the root's area, and what it holds; returns its id. */
  function write(old: string, at: { parentId: string; index: string }, root: LayerT, target: Target, frameId: string) {
    const id = nanoid()
    const node = design.nodes[old] as LayerT
    const copy = { ...node, ...at, props: fittedIn(node.props, root.props, target) } as LayerT
    r.nodes.set(id, toYNode(copy))
    placed.set(id, copy)
    hold(frameId, node.link, id)
    for (const [child, inner] of childrenOf(design, old)) {
      const own = holderIn(frameId, inner.link)
      const held = own === undefined ? undefined : nodeOf(own)
      if (own === undefined || !held) {
        write(child, { parentId: id, index: inner.index }, root, target, frameId)
        continue
      }
      // The frame's own copy comes in as it is, unless the copy is going inside it.
      if (within(id, own) || !canHold(node.type, held.type)) continue
      r.nodes.get(own)?.set('parentId', id)
      r.nodes.get(own)?.set('index', inner.index)
      placed.set(own, { ...held, parentId: id, index: inner.index })
    }
    return id
  }

  const depth = (id: string) => ancestorsOf(design, design.nodes[id]?.parentId ?? '').length
  const roots = [...new Set(ids)].sort((a, b) => depth(a) - depth(b))
  const copies: string[] = []
  for (const root of roots) {
    const node = design.nodes[root] as LayerT
    for (const frameId of linkedFrames(design, frameIdOf(design, root) as string)) {
      if (holderIn(frameId, node.link) !== undefined) continue
      const target = targetIn(root, frameId)
      const at = { parentId: target.parentId, index: indexIn(root, frameId, target) }
      copies.push(write(root, at, node, target, frameId))
    }
  }
  return copies
}

function areaOf(node: LayerT): Area {
  return { x: node.props.x, y: node.props.y, width: node.props.width, height: node.props.height }
}

/** A layer's props laid out to fit from one area to another, as fit.ts fits a frame to a frame. */
function fittedIn<P extends LayerT['props']>(props: P, root: LayerT['props'], { from, to }: Target): P {
  const shift = <B extends { x: number; y: number }>(box: B, dx: number, dy: number): B => ({
    ...box,
    x: box.x + dx,
    y: box.y + dy,
  })
  const fit = fitted(shift(props, -from.x, -from.y), shift(root, -from.x, -from.y), { from, to })
  return { ...fit, x: round(fit.x + to.x), y: round(fit.y + to.y) }
}
