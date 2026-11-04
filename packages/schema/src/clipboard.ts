import { z } from 'zod'

import { canHold, Layer } from './layers.ts'
import { FrameId, NodeId, PageId } from './primitives.ts'

/**
 * Layers to place in a design: a flat tree like a design's nodes, each layer with its link id and
 * its props as its frame has them. `roots` are the top layers, bottom to top; their own `parentId`
 * and `index` are replaced where they are placed. Every other layer's parent is in the tree and can
 * hold it, so the tree is whole on its own.
 */
export const LayerTree = z
  .object({
    nodes: z.record(NodeId, Layer),
    roots: NodeId.array().min(1),
  })
  .superRefine(({ nodes, roots }, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (new Set(roots).size !== roots.length) issue('a root is listed twice')
    for (const root of roots) if (!nodes[root]) issue(`root "${root}" is not in the tree`)
    for (const [id, node] of Object.entries(nodes)) {
      if (roots.includes(id)) continue
      const parent = nodes[node.parentId]
      if (!parent) {
        issue(`"${id}" is neither a root nor inside one`)
        continue
      }
      if (!canHold(parent.type, node.type))
        issue(`"${node.parentId}" is a ${parent.type}, which can't hold "${id}", a ${node.type}`)
      // Up through the tree it reaches a root, or it is in a loop.
      const seen = new Set<string>()
      for (let up: string | undefined = id; up && !roots.includes(up); up = nodes[up]?.parentId) {
        if (seen.has(up)) {
          issue(`"${id}" is inside itself`)
          break
        }
        seen.add(up)
      }
    }
  })
export type LayerTree = z.infer<typeof LayerTree>

/** The clipboard's custom type: layers copied in the editor, pasted into the same design or another. */
export const LAYER_CLIPBOARD_TYPE = 'application/x-dazbee-layers'

/** What a copy puts on the clipboard: layers from a client's design. */
export const LayerClipboard = z.object({
  kind: z.literal('dazbee.layers'),
  /** The design they were copied from. */
  designId: z.string(),
  /** The page and frame the layers were copied from: a paste onto another frame of that page may keep their link ids. */
  pageId: PageId,
  frameId: FrameId,
  tree: LayerTree,
})
export type LayerClipboard = z.infer<typeof LayerClipboard>
