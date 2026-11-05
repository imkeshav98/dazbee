// Setting a style on layers: what Paste style and Copy to other frames ▸ Style write.
import type * as Y from 'yjs'
import { z } from 'zod'

import { LayerStyle, NodeId, restyle } from '@dazbee/schema'

import { lockProblem, missingLayer } from './checks.ts'
import { defineCommand } from './define.ts'

/**
 * Sets a style (fill, outline, effects, transparency, corners, the text's look and their brand
 * bindings) on layers, each in what it has; font size, place, size and turn stay. Layers that have
 * it already are left as they are. Their linked copies in other frames keep their own style.
 */
export const nodeStyle = defineCommand({
  name: 'node.style',
  input: z.object({ ids: NodeId.array().min(1), style: LayerStyle }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return missingLayer(design, [id])
      const locked = lockProblem(id, node, 'style')
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { ids, style }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      const ynode = r.nodes.get(id)
      const change = node && restyle(node, style)
      if (!change || !ynode) continue
      const props = ynode.get('props') as Y.Map<unknown>
      for (const [key, value] of Object.entries(change.patch)) {
        if (value === undefined) props.delete(key)
        else props.set(key, value)
      }
      if (JSON.stringify(change.bindings) === JSON.stringify(node.bindings ?? {})) continue
      if (Object.keys(change.bindings).length > 0) ynode.set('bindings', change.bindings)
      else ynode.delete('bindings')
    }
  },
})
