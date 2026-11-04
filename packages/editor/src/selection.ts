// What is selected, the group gone into, the picked page, a crop or path edit, and the layer under
// the pointer, with the rules that keep them in step and the listeners that follow them.
import type { Design } from '@dazbee/schema'

import type { Frame } from './canvas/frames.ts'
import type { AnchorRef } from './gestures/path.ts'

/** A layer as one frame shows it: selection, dragging and typing all happen in one frame. */
export interface Picked {
  id: string
  frame: string
}
/** The selected layers, all in one frame, in the order they were picked. */
export interface Selection {
  ids: string[]
  frame: string
}
/** The path layer whose points are being edited (#45), and which of its anchors are selected. */
export interface PathEditing extends Picked {
  selected: AnchorRef[]
}

export interface SelectionDeps {
  /** The design as last drawn. */
  drawn: () => Design
  /** The frames of the grid as last drawn. */
  frames: () => readonly Frame[]
  /** Shows that the selection changed: draws the overlay. */
  changed: () => void
}

export interface EditorSelection {
  current(): Selection | null
  /** The group or box double-clicked into: a click then picks what is directly inside it (#41). */
  entered(): string | null
  /**
   * The page a click on its background picked: outlined dashed in every size, its labels lit. No
   * layer is selected meanwhile, so the layers' keys do nothing to it.
   */
  pickedPage(): string | null
  /** The layer whose image fill is being cropped on the stage (#48). */
  cropping(): Picked | null
  /** The path layer whose points are being edited (#45), and which of its anchors are selected. */
  pathEditing(): Readonly<PathEditing> | null
  /** The layer under the pointer, outlined while nothing is being dragged. */
  hovered(): Picked | null
  /** Selects layers in one frame, or none; a crop or path edit stays only on that one layer there. Shows it. */
  select(ids: string[], frame: string): void
  /** Sets the selection and shows nothing: a crop or path edit stays while a layer is selected, and ends with none. */
  selectKeepingModes(next: Selection | null): void
  /**
   * Drops selected layers that are gone, and the selection once none are left or its frame is;
   * with nothing selected, a crop or path edit ends.
   */
  keep(): void
  /** Lets the selection go when its frame is no longer in the grid, with a crop or path edit. */
  dropOffGrid(): void
  /** Picks a page that has a frame, or none, letting the selection go; shows it and tells the page listeners. */
  pickPage(pageId: string | null): void
  /** Goes into a group or box, or out of every one with null. */
  enter(id: string | null): void
  /** Starts cropping a layer's image fill, or ends the crop with null. */
  crop(target: Picked | null): void
  /** Goes into a path's points with no anchor selected, or leaves them with null. */
  editPath(target: Picked | null): void
  /** Selects anchors of the path being edited. */
  pickAnchors(refs: AnchorRef[]): void
  /** Sets the layer under the pointer; returns whether it changed. */
  hover(next: Picked | null): boolean
  /**
   * Lets the picked page go once a layer is selected or the page's frames are gone (a page
   * deleted, a size shown alone); returns whether it did. The overlay calls it as it starts to draw.
   */
  dropGonePage(): boolean
  /**
   * Tells the selection listeners when the selection differs from the one they last heard of,
   * then the page listeners when the page went. The overlay calls it once drawn.
   */
  tellListeners(pageGone: boolean): void
  /** Told when the selection changes, so panels can follow it. */
  onSelection(listener: (ids: string[]) => void): () => boolean
  /** Told when the picked page changes. */
  onPagePick(listener: (pageId: string | null) => void): () => boolean
  destroy(): void
}

export const isPath = (from: Design, id: string) => {
  const node = from.nodes[id]
  return node?.type === 'graphic' && node.props.shape.kind === 'path'
}

export function editorSelection({ drawn, frames, changed }: SelectionDeps): EditorSelection {
  /** The selected layers, or null. */
  let selection: Selection | null = null
  /** The page a click on its background picked; a layer selected, Esc, or a click or drag elsewhere lets it go. */
  let pickedPage: string | null = null
  /** The group or box double-clicked into. */
  let entered: string | null = null
  /** The selection the selection listeners last heard of, as `<frame>|<ids>`. */
  let lastSelection = ''
  /** The layer under the pointer. */
  let hovered: Picked | null = null
  /** The path layer whose points are being edited, and its selected anchors. */
  let pathEditing: PathEditing | null = null
  /** The layer whose image fill is being cropped. */
  let cropping: Picked | null = null
  /** Told when the selection changes. */
  const selectionListeners = new Set<(ids: string[]) => void>()
  /** Told when the picked page changes. */
  const pageListeners = new Set<(pageId: string | null) => void>()

  const frameOf = (key: string | undefined) => frames().find((f) => f.key === key)

  function current() {
    return selection
  }
  function enteredGroup() {
    return entered
  }
  function picked() {
    return pickedPage
  }
  function croppingLayer() {
    return cropping
  }
  function editingPath() {
    return pathEditing
  }
  function hoveredLayer() {
    return hovered
  }

  function select(ids: string[], frame: string) {
    selection = ids.length > 0 ? { ids, frame } : null
    if (pathEditing && (ids.length !== 1 || ids[0] !== pathEditing.id || frame !== pathEditing.frame))
      pathEditing = null
    if (cropping && (ids.length !== 1 || ids[0] !== cropping.id || frame !== cropping.frame)) cropping = null
    changed()
  }
  /** With nothing selected there is no crop and no path edit. */
  function endModesWhenNone() {
    if (selection) return
    cropping = null
    pathEditing = null
  }
  function selectKeepingModes(next: Selection | null) {
    selection = next
    endModesWhenNone()
  }
  function keep() {
    if (!selection) return endModesWhenNone()
    const design = drawn()
    const ids = selection.ids.filter((id) => design.nodes[id])
    selection = ids.length > 0 && frameOf(selection.frame) ? { ...selection, ids } : null
    if (entered && !design.nodes[entered]) entered = null
    if (pathEditing && (!selection?.ids.includes(pathEditing.id) || !isPath(design, pathEditing.id))) pathEditing = null
    if (cropping && (!selection?.ids.includes(cropping.id) || selection.frame !== cropping.frame)) cropping = null
  }
  function dropOffGrid() {
    if (selection && !frameOf(selection.frame)) selection = null
    endModesWhenNone()
  }
  function pickPage(pageId: string | null) {
    const design = drawn()
    const next = pageId && design.pages[pageId] && frames().some((f) => f.pageId === pageId) ? pageId : null
    if (next === pickedPage) return
    pickedPage = next
    // Picking the page lets the selection go, with a crop or path edit on it and any group gone into.
    if (next && selection) {
      entered = null
      select([], selection.frame)
    }
    changed()
    for (const listener of pageListeners) listener(pickedPage)
  }
  function enter(id: string | null) {
    entered = id
  }
  function crop(target: Picked | null) {
    cropping = target
  }
  function editPath(target: Picked | null) {
    pathEditing = target && { ...target, selected: [] }
  }
  function pickAnchors(refs: AnchorRef[]) {
    if (pathEditing) pathEditing.selected = refs
  }
  function hover(next: Picked | null) {
    const moved = next?.id !== hovered?.id || next?.frame !== hovered?.frame
    hovered = next
    return moved
  }

  function dropGonePage() {
    const design = drawn()
    const pageGone =
      pickedPage !== null &&
      (selection !== null || !design.pages[pickedPage] || !frames().some((f) => f.pageId === pickedPage))
    if (pageGone) pickedPage = null
    return pageGone
  }
  function tellListeners(pageGone: boolean) {
    const now = selection ? `${selection.frame}|${selection.ids.join(',')}` : ''
    if (now !== lastSelection) {
      lastSelection = now
      for (const listener of selectionListeners) listener(selection?.ids ?? [])
    }
    if (pageGone) for (const listener of pageListeners) listener(null)
  }
  function onSelection(listener: (ids: string[]) => void) {
    selectionListeners.add(listener)
    return () => selectionListeners.delete(listener)
  }
  function onPagePick(listener: (pageId: string | null) => void) {
    pageListeners.add(listener)
    return () => pageListeners.delete(listener)
  }

  function destroy() {
    pageListeners.clear()
    selectionListeners.clear()
  }

  return {
    current,
    entered: enteredGroup,
    pickedPage: picked,
    cropping: croppingLayer,
    pathEditing: editingPath,
    hovered: hoveredLayer,
    select,
    selectKeepingModes,
    keep,
    dropOffGrid,
    pickPage,
    enter,
    crop,
    editPath,
    pickAnchors,
    hover,
    dropGonePage,
    tellListeners,
    onSelection,
    onPagePick,
    destroy,
  }
}
