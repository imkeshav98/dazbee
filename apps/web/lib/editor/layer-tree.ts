// The layers panel's tree as rows, topmost first: the page's frames by order as top-level rows, an
// open frame with its layers inside it and an open layer with its children.
import { childrenOf, descendants } from '@dazbee/doc'
import { type Design, framesOf } from '@dazbee/schema'

type Layer = Design['nodes'][string]
type Frame = Design['frames'][string]

/** A frame's row: depth 0, its parent the page. */
export interface FrameTreeRow {
  kind: 'frame'
  id: string
  frame: Frame
  depth: 0
  parentId: string
  /** The frame the row is in: its own. */
  frameId: string
  hasChildren: boolean
  position: number
  siblings: number
}
/** A layer's row: depth 1 for a top-level layer of its frame, one more for each group it is in. */
export interface LayerTreeRow {
  kind: 'layer'
  id: string
  node: Layer
  depth: number
  parentId: string
  frameId: string
  hasChildren: boolean
  position: number
  siblings: number
  /** Its frame is linked to another on the page, and no other frame there holds a copy of it. */
  onlyHere: boolean
}
export type Row = FrameTreeRow | LayerTreeRow

/** The page's frames as rows, by order, each open one followed by its layers and theirs, topmost first. */
export function treeRows(design: Design, pageId: string, open: ReadonlySet<string>): Row[] {
  const rows: Row[] = []
  const frames = framesOf(design, pageId)
  const holders = linkHolders(
    design,
    frames.map(([id]) => id),
  )
  // The frames that share a link with another frame of the page.
  const linked = new Set<string>()
  for (const held of holders.values()) if (held.size > 1) for (const id of held) linked.add(id)
  const walk = (frameId: string, parentId: string, depth: number) => {
    const children = childrenOf(design, parentId).reverse()
    for (const [position, [id, node]] of children.entries()) {
      const hasChildren = childrenOf(design, id).length > 0
      rows.push({
        kind: 'layer',
        id,
        node,
        depth,
        parentId,
        frameId,
        hasChildren,
        position: position + 1,
        siblings: children.length,
        onlyHere: linked.has(frameId) && holders.get(node.link)?.size === 1,
      })
      if (hasChildren && open.has(id)) walk(frameId, id, depth + 1)
    }
  }
  for (const [position, [id, frame]] of frames.entries()) {
    const hasChildren = childrenOf(design, id).length > 0
    rows.push({
      kind: 'frame',
      id,
      frame,
      depth: 0,
      parentId: pageId,
      frameId: id,
      hasChildren,
      position: position + 1,
      siblings: frames.length,
    })
    if (hasChildren && open.has(id)) walk(id, id, 1)
  }
  return rows
}

/**
 * The rows to open so the selection and a picked frame show in the tree: each selected layer's
 * frame and the groups it is in, and the picked frame.
 */
export function opensFor(design: Design, ids: readonly string[], picked: string | null): string[] {
  const open = new Set<string>()
  for (const id of ids) {
    const node = design.nodes[id]
    if (!node) continue
    for (
      let up: string | undefined = node.parentId;
      up !== undefined && !open.has(up);
      up = design.nodes[up]?.parentId
    ) {
      if (Object.hasOwn(design.frames, up)) open.add(up)
      else if (design.nodes[up]) open.add(up)
      else break
    }
  }
  if (picked !== null && Object.hasOwn(design.frames, picked)) open.add(picked)
  return [...open]
}

/**
 * Where an arrow key, Home or End takes the focus from row `i`: to another row, or a frame or
 * layer opened or closed in place. Inward (right, or left in a right-to-left language) opens a
 * closed row, then goes to its first child; outward closes an open row, else goes to its parent's
 * row. Null when the key goes nowhere.
 */
export function arrowStep(
  rows: readonly Row[],
  i: number,
  key: string,
  open: ReadonlySet<string>,
  rtl: boolean,
): { go: Row } | { toggle: string; open: boolean } | null {
  const row = rows[i]
  if (!row) return null
  const go = (to: Row | undefined) => (to ? { go: to } : null)
  if (key === 'ArrowDown') return go(rows[i + 1])
  if (key === 'ArrowUp') return go(rows[i - 1])
  if (key === 'Home') return go(rows[0])
  if (key === 'End') return go(rows.at(-1))
  const inward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const outward = rtl ? 'ArrowRight' : 'ArrowLeft'
  if (key === inward) {
    if (!row.hasChildren) return null
    return open.has(row.id) ? go(rows[i + 1]) : { toggle: row.id, open: true }
  }
  if (key === outward) {
    if (row.hasChildren && open.has(row.id)) return { toggle: row.id, open: false }
    return go(rows.find((r) => r.id === row.parentId))
  }
  return null
}

/** Each link id among the layers of the frames given, however deep, with the frames that hold it. */
function linkHolders(design: Design, frameIds: readonly string[]) {
  const holders = new Map<string, Set<string>>()
  for (const frameId of frameIds) {
    for (const id of descendants(design, frameId)) {
      const link = design.nodes[id]?.link
      if (link === undefined) continue
      const held = holders.get(link)
      if (held) held.add(frameId)
      else holders.set(link, new Set([frameId]))
    }
  }
  return holders
}
