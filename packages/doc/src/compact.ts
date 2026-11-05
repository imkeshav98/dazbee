import { DELETED, type DesignDoc, root, snapshot } from './design-doc.ts'
import { repair } from './repair.ts'

/** The origin of compaction's transaction, so a server can tell it from an edit. */
export const COMPACTION = 'compaction'

/**
 * Drops what only an undo could still need (#57): the maps deleted layers keep (see DELETED), and
 * those of live layers that repair drops, such as a layer added to a frame another tab deleted.
 * A layer repair only moves stays. Undo is per session, so this is safe only with nobody
 * connected. With the doc's garbage collection on, what is dropped shrinks to a few ranges.
 * Returns how many layers went.
 */
export function compact(doc: DesignDoc): { layers: number } {
  const r = root(doc)
  const deleted = [...r.nodes.entries()].filter(([, node]) => node.get(DELETED) === true).map(([id]) => id)
  const live = snapshot(doc)
  const kept = repair(live).snapshot.nodes
  const unread = Object.keys(live.nodes).filter((id) => !Object.hasOwn(kept, id))
  const gone = [...deleted, ...unread]
  if (gone.length > 0) {
    doc.transact(() => {
      for (const id of gone) r.nodes.delete(id)
    }, COMPACTION)
  }
  return { layers: gone.length }
}
