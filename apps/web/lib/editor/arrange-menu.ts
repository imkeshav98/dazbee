// The rows of the top bar's Arrange ⋯ for the selected layers: how they sit. Each row shows only
// where it applies to the selection, and Line up is greyed out, with the reason, while it has
// nothing to do. And where the layers sit in their stacks, for the Order moves that have nothing to
// do: to the front at the front, to the back at the back.
import { childrenOf } from '@dazbee/doc'
import type { Design } from '@dazbee/schema'

/** Why a row of the Arrange ⋯ is greyed out. */
export type ArrangeWhy = 'placedByLayout'

/** One row of the Arrange ⋯, and why it is greyed out when it is. */
export type ArrangeRow = { row: 'order' | 'lineUp' | 'rotation' | 'textDirection'; off?: ArrangeWhy }

/** What the rows depend on: the facts the top bar reads of the selected layers, and their lock. */
export interface ArrangeOf {
  /** More than one layer is selected. */
  several: boolean
  /** None of the layers is a group or a boolean, which turn with what they hold. */
  sized: boolean
  /** Every layer is text. */
  texts: boolean
  /** Every layer is placed by its auto layout box: in the box's flow, and not set to keep where it is. */
  placed: boolean
  /** Some of the layers are locked. */
  locked: boolean
}

/**
 * The rows for a selection, in order: Order ▸ always; Line up ▸ for one layer, as several have the
 * bar's own Line up; the rotation field unless a group or boolean is selected; Text direction ▸ when
 * every layer is text. A locked layer keeps only Order, the one row its lock doesn't refuse.
 */
export function arrangeRows({ several, sized, texts, placed, locked }: ArrangeOf): ArrangeRow[] {
  const rows: ArrangeRow[] = [{ row: 'order' }]
  if (locked) return rows
  if (!several) rows.push(placed ? { row: 'lineUp', off: 'placedByLayout' } : { row: 'lineUp' })
  if (sized) rows.push({ row: 'rotation' })
  if (texts) rows.push({ row: 'textDirection' })
  return rows
}

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
