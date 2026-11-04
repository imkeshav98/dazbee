import type { Session } from '@dazbee/doc'

import { runQuietly } from '../run-quietly.ts'

/** Groups fit what they hold again after a change inside them, in the same undo step (#41). */
export function hug(session: Session, ids: string[]) {
  const now = session.design()
  const live = ids.filter((id) => now.nodes[id])
  if (live.length > 0) runQuietly(() => session.run('node.hug', { ids: live }))
}
