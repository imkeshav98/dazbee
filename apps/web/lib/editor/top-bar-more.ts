// The rows of the top bar's ⋯ for the selected layers: how they sit. Each row shows only where it
// applies to the selection, and Line up is greyed out, with the reason, while it has nothing to do.
import type { LayerType } from '@dazbee/schema'

/** One row of the top bar's ⋯, and why it is greyed out when it is. */
export type TopBarMoreRow = { row: 'order' | 'rotation' | 'textDirection' } | { row: 'lineUp'; off?: 'placedByLayout' }

/** What the rows depend on: the selected layers' types, and whether they are locked or placed by an auto layout. */
export interface TopBarMoreOf {
  types: readonly LayerType[]
  /** Some of the layers are locked. */
  locked: boolean
  /** Every layer is in an auto layout box's flow, so the box places it. */
  placed: boolean
}

/**
 * The rows for a selection, in order: Order ▸ always; Line up ▸ for one layer, as several have the
 * bar's own Line up; the rotation field unless a group or boolean is selected, which turn with what
 * they hold; Text direction ▸ when every layer is text. A locked layer keeps only Order, the one
 * row its lock doesn't refuse.
 */
export function topBarMoreRows({ types, locked, placed }: TopBarMoreOf): TopBarMoreRow[] {
  if (types.length === 0) return []
  const rows: TopBarMoreRow[] = [{ row: 'order' }]
  if (locked) return rows
  if (types.length === 1) rows.push(placed ? { row: 'lineUp', off: 'placedByLayout' } : { row: 'lineUp' })
  if (types.every((type) => type !== 'group' && type !== 'boolean')) rows.push({ row: 'rotation' })
  if (types.every((type) => type === 'text')) rows.push({ row: 'textDirection' })
  return rows
}
