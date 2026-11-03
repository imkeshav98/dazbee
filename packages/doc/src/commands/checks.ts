import { canHold, type Design, type Layer as LayerT, LayerLock } from '@dazbee/schema'

import type { CommandContext } from './define.ts'

/** Ids of deleted layers stay taken: their tombstones still hold the data an undo brings back. */
export const idProblem = ({ r }: CommandContext, id: string | undefined) =>
  id && (r.nodes.has(id) || r.pages.has(id) || r.formats.has(id)) ? `id "${id}" is taken` : undefined

export const parentProblem = (design: Design, parentId: string, type: string) => {
  const parent = design.nodes[parentId]
  if (!design.pages[parentId] && !parent) return `parent "${parentId}" is neither a page nor a layer`
  if (parent && !canHold(parent.type, type)) {
    return parent.type === 'boolean'
      ? `parent "${parentId}" is a boolean, which holds only shapes and booleans`
      : `parent "${parentId}" is a ${parent.type}, which can't hold layers`
  }
  return undefined
}

/** The lock flag a change to a property needs clear: position, size and rotation, content or style. */
export function lockFor(path: string): keyof LayerLock | null {
  if (path === 'x' || path === 'y') return 'move'
  if (path === 'width' || path === 'height' || path === 'rotation') return 'resize'
  if (path === 'visible') return null
  if (path === 'text' || path === 'runs') return 'content'
  return 'style'
}

export const lockProblem = (id: string, node: LayerT, flag: keyof LayerLock | null) =>
  flag && node.lock?.[flag] ? `"${id}" is locked (${flag})` : undefined
