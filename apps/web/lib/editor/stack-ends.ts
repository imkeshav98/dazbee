// Where the selected layers sit in their stacks, for the Order moves that have nothing to do: to
// the front at the front, to the back at the back.
import { childrenOf } from '@dazbee/doc'
import type { Design } from '@dazbee/schema'

/**
 * Whether the layers are at the front of their stacks, so moving them forward or to the front does
 * nothing, and whether they are at the back. Each stack is a parent's children: the layers in it
 * are at the front when they are its top ones, in any order, as the order moves keep a block of
 * them together.
 */
export function stackEnds(design: Design, ids: readonly string[]): { front: boolean; back: boolean } {
  const picked = new Set(ids)
  const parents = new Set(ids.map((id) => design.nodes[id]?.parentId ?? ''))
  let front = true
  let back = true
  for (const parent of parents) {
    const stack = childrenOf(design, parent).map(([id]) => id)
    const mine = stack.filter((id) => picked.has(id)).length
    front &&= stack.slice(stack.length - mine).every((id) => picked.has(id))
    back &&= stack.slice(0, mine).every((id) => picked.has(id))
  }
  return { front, back }
}
