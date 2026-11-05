// The layers panel's tree as rows, topmost first: what each row shows and where it sits.
import { childrenOf } from '@dazbee/doc'
import type { Design } from '@dazbee/schema'

type Layer = Design['nodes'][string]
export interface Row {
  id: string
  node: Layer
  depth: number
  parentId: string
  hasChildren: boolean
  position: number
  siblings: number
}

/** The frame's layers as rows, topmost first, with the children of expanded layers under them; none without a frame. */
export function rowsOf(design: Design, frameId: string | undefined, expanded: ReadonlySet<string>) {
  const rows: Row[] = []
  if (frameId === undefined) return rows
  const walk = (parentId: string, depth: number) => {
    const children = childrenOf(design, parentId).reverse()
    for (const [position, [id, node]] of children.entries()) {
      const hasChildren = childrenOf(design, id).length > 0
      rows.push({ id, node, depth, parentId, hasChildren, position: position + 1, siblings: children.length })
      if (hasChildren && expanded.has(id)) walk(id, depth + 1)
    }
  }
  walk(frameId, 0)
  return rows
}
