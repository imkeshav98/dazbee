// What is selected, the group gone into, the picked frame, a crop or path edit, the layer under the
// pointer and the frame lit from outside the stage, with the rules that keep them in step and the
// listeners that follow them.
import { type Design, frameIdOf } from '@dazbee/schema'

import type { Frame } from './canvas/frames.ts'
import type { AnchorRef } from './gestures/pen/path.ts'

/** A layer as one frame shows it: selection, dragging and typing all happen in one frame. */
export interface Picked {
  id: string
  frameId: string
}
/**
 * The selected layers, each with its frame, in the order they were picked; never empty. They sit in
 * one frame or in several frames of one page, such as linked copies Ctrl+Alt+A or Shift and a
 * click added. The first one's frame is the one the selection's box and handles go in.
 */
export type Selection = readonly Picked[]
/** The path layer whose points are being edited (#45), and which of its anchors are selected. */
export interface PathEditing extends Picked {
  selected: AnchorRef[]
}

export interface SelectionDeps {
  /** The design as last drawn. */
  drawn: () => Design
  /** The shown page's frames as last drawn. */
  frames: () => readonly Frame[]
  /** Shows that the selection changed: draws the overlay. */
  changed: () => void
}

export interface EditorSelection {
  current(): Selection | null
  /**
   * The group or box double-clicked into: a click then picks what is directly inside it (#41).
   * It is always in the selection's frame, on the shown page.
   */
  entered(): string | null
  /** The frame layers were last selected in on a page, kept after the selection is let go; null with none. */
  lastFrameOn(pageId: string): string | null
  /**
   * The frame chosen as a whole, by a click on its label or its empty area: outlined, its label lit.
   * No layer is selected meanwhile; the frame's own keys act on it.
   */
  pickedFrame(): string | null
  /** The picked frame the page renames in place of its label, which the overlay then leaves out; null with none. */
  renamingFrame(): string | null
  /** The layer whose image fill is being cropped on the stage (#48). */
  cropping(): Picked | null
  /** The path layer whose points are being edited (#45), and which of its anchors are selected. */
  pathEditing(): Readonly<PathEditing> | null
  /** The layer under the pointer, outlined while nothing is being dragged. */
  hovered(): Picked | null
  /** The frame lit from outside the stage, as a list's row does while it is hovered or focused; null with none. */
  litFrame(): string | null
  /**
   * Selects layers in one frame, or none, with no ids or no frame; a crop or path edit stays only on
   * that one layer there. Shows it.
   */
  select(ids: string[], frameId: string | null): void
  /**
   * Selects layers in frames of one page, in order, or none: any on another page than the first
   * one's are left out. A crop or path edit stays only on that one layer, and the group gone into
   * only while the first layer is in its frame. Shows it.
   */
  selectAcross(layers: Selection): void
  /** Sets the selection and shows nothing: a crop or path edit stays while a layer is selected, and ends with none. */
  selectKeepingModes(next: Selection | null): void
  /**
   * Drops selected layers that are gone, and the selection once none are left or its frame is not
   * on the shown page; with nothing selected, a crop or path edit ends. The picked frame goes once
   * it is not shown.
   */
  keep(): void
  /**
   * Lets the selection go when its frame is not on the shown page, with a crop, path edit and the
   * group gone into, and the picked frame when it is not shown.
   */
  dropOffPage(): void
  /**
   * Picks a frame, or none with null, letting the selection go, and shows it. The frame already
   * picked is picked again: nothing changes, but the frame listeners hear of it.
   */
  pickFrame(frameId: string | null): void
  /**
   * Picks a frame for the page to rename in place of its label, and shows it; null once the rename
   * ends. It ends too once the frame is let go or another is picked.
   */
  renameFrame(frameId: string | null): void
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
  /** Lights a frame from outside the stage, or none with null; returns whether it changed. */
  lightFrame(frameId: string | null): boolean
  /**
   * Tells the selection listeners when the selection differs from the one they last heard of,
   * then the frame listeners when the picked frame does or was picked again. The overlay calls it
   * once drawn.
   */
  tellListeners(): void
  /** Told when the selection changes, so panels can follow it. */
  onSelection(listener: (ids: string[]) => void): () => boolean
  /** Told when the picked frame changes, with null once it goes, and when it is picked again. */
  onFramePick(listener: (frameId: string | null) => void): () => boolean
  destroy(): void
}

/** The selected layers' ids, in the order they were picked; none with nothing selected. */
export const idsOf = (selection: Selection | null) => selection?.map((layer) => layer.id) ?? []

/** Whether two pairs name the same layer in the same frame. */
export const samePick = (a: Picked, b: Picked) => a.id === b.id && a.frameId === b.frameId

/** Layers of one frame as selection pairs, in order. */
export const pairsIn = (frameId: string, ids: readonly string[]): Picked[] => ids.map((id) => ({ id, frameId }))

/** The first selected layer's frame, where the selection's box and handles go; undefined with nothing selected. */
export const firstFrameOf = (selection: Selection | null) => selection?.[0]?.frameId

export const isPath = (from: Design, id: string) => {
  const node = from.nodes[id]
  return node?.type === 'graphic' && node.props.shape.kind === 'path'
}

export function editorSelection({ drawn, frames, changed }: SelectionDeps): EditorSelection {
  /** The selected layers, or null. */
  let selection: Selection | null = null
  /** The frame picked as a whole; a layer selected, Esc, or a click on empty canvas lets it go. */
  let pickedFrame: string | null = null
  /** The frame the page renames in place of its label, while it stays picked. */
  let renaming: string | null = null
  /** The picked frame the frame listeners last heard of. */
  let lastPicked: string | null = null
  /** Whether the picked frame was picked again since the frame listeners last heard. */
  let pickedAgain = false
  /** The group or box double-clicked into. */
  let entered: string | null = null
  /** The frame layers were last selected in, by page. */
  const lastFrames = new Map<string, string>()
  /** The selection the selection listeners last heard of, as `<frame>|<id>` pairs. */
  let lastSelection = ''
  /** The layer under the pointer. */
  let hovered: Picked | null = null
  /** The frame lit from outside the stage. */
  let lit: string | null = null
  /** The path layer whose points are being edited, and its selected anchors. */
  let pathEditing: PathEditing | null = null
  /** The layer whose image fill is being cropped. */
  let cropping: Picked | null = null
  /** Told when the selection changes. */
  const selectionListeners = new Set<(ids: string[]) => void>()
  /** Told when the picked frame changes. */
  const frameListeners = new Set<(frameId: string | null) => void>()

  const frameOf = (id: string | undefined) => frames().find((f) => f.id === id)

  function current() {
    return selection
  }
  function enteredGroup() {
    return entered
  }
  function lastFrameOn(pageId: string) {
    return lastFrames.get(pageId) ?? null
  }
  function picked() {
    return pickedFrame
  }
  function renamingFrame() {
    return renaming !== null && renaming === pickedFrame ? renaming : null
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

  function select(ids: string[], frameId: string | null) {
    selectAcross(frameId === null ? [] : pairsIn(frameId, ids))
  }
  function selectAcross(layers: Selection) {
    const pageId = drawn().frames[layers[0]?.frameId ?? '']?.pageId
    const kept = layers.filter((layer) => drawn().frames[layer.frameId]?.pageId === pageId)
    selection = kept.length > 0 ? kept : null
    if (selection) pickedFrame = null
    rememberFrame()
    const [first] = kept
    // Layers selected in another frame leave the group gone into: Esc never goes back to it.
    if (entered && first && frameIdOf(drawn(), entered) !== first.frameId) entered = null
    if (pathEditing && !onlyLayer(pathEditing)) pathEditing = null
    if (cropping && !onlyLayer(cropping)) cropping = null
    changed()
  }
  /** Whether a layer is all the selection holds. */
  function onlyLayer(layer: Picked) {
    const [only] = selection ?? []
    return selection?.length === 1 && only !== undefined && samePick(only, layer)
  }
  /** With nothing selected there is no crop and no path edit. */
  function endModesWhenNone() {
    if (selection) return
    cropping = null
    pathEditing = null
  }
  function selectKeepingModes(next: Selection | null) {
    selection = next
    if (selection) pickedFrame = null
    rememberFrame()
    endModesWhenNone()
  }
  /** Keeps the first selected layer's frame as the one last selected in on its page. */
  function rememberFrame() {
    const frame = frameOf(firstFrameOf(selection))
    if (frame) lastFrames.set(frame.pageId, frame.id)
  }
  function keep() {
    if (pickedFrame !== null && !frameOf(pickedFrame)) pickedFrame = null
    if (!selection) return endModesWhenNone()
    const design = drawn()
    const kept = selection.filter((layer) => design.nodes[layer.id] && frameOf(layer.frameId))
    selection = kept.length > 0 ? kept : null
    if (entered && !design.nodes[entered]) entered = null
    const holds = (layer: Picked) => kept.some((p) => samePick(p, layer))
    if (pathEditing && (!kept.some((p) => p.id === pathEditing?.id) || !isPath(design, pathEditing.id)))
      pathEditing = null
    if (cropping && !holds(cropping)) cropping = null
  }
  function dropOffPage() {
    const kept = selection?.filter((layer) => frameOf(layer.frameId)) ?? []
    selection = kept.length > 0 ? kept : null
    if (pickedFrame !== null && !frameOf(pickedFrame)) pickedFrame = null
    if (entered && !frameOf(frameIdOf(drawn(), entered))) entered = null
    endModesWhenNone()
  }
  function pickFrame(frameId: string | null) {
    if (frameId === pickedFrame) {
      if (frameId === null) return
      pickedAgain = true
      changed()
      return
    }
    pickedFrame = frameId
    renaming = null
    // Picking a frame lets the selection go, with a crop or path edit on it and any group gone into.
    if (frameId !== null && selection) {
      entered = null
      selectAcross([])
      return
    }
    changed()
  }
  function renameFrame(frameId: string | null) {
    const was = pickedFrame
    if (frameId !== null) pickFrame(frameId)
    renaming = frameId
    // Picking another frame showed it already.
    if (pickedFrame === was) changed()
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
    const moved = next?.id !== hovered?.id || next?.frameId !== hovered?.frameId
    hovered = next
    return moved
  }
  function lightFrame(frameId: string | null) {
    const changed = frameId !== lit
    lit = frameId
    return changed
  }

  function tellListeners() {
    const now = (selection ?? []).map((layer) => `${layer.frameId}|${layer.id}`).join(',')
    if (now !== lastSelection) {
      lastSelection = now
      for (const listener of selectionListeners) listener(idsOf(selection))
    }
    if (pickedFrame !== lastPicked || pickedAgain) {
      lastPicked = pickedFrame
      pickedAgain = false
      for (const listener of frameListeners) listener(pickedFrame)
    }
  }
  function onSelection(listener: (ids: string[]) => void) {
    selectionListeners.add(listener)
    return () => selectionListeners.delete(listener)
  }
  function onFramePick(listener: (frameId: string | null) => void) {
    frameListeners.add(listener)
    return () => frameListeners.delete(listener)
  }

  function destroy() {
    frameListeners.clear()
    selectionListeners.clear()
  }

  return {
    current,
    entered: enteredGroup,
    lastFrameOn,
    pickedFrame: picked,
    renamingFrame,
    cropping: croppingLayer,
    pathEditing: editingPath,
    hovered: hoveredLayer,
    litFrame: () => lit,
    select,
    selectAcross,
    selectKeepingModes,
    keep,
    dropOffPage,
    pickFrame,
    renameFrame,
    enter,
    crop,
    editPath,
    pickAnchors,
    hover,
    lightFrame,
    tellListeners,
    onSelection,
    onFramePick,
    destroy,
  }
}
