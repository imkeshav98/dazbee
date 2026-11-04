// Putting things on the canvas: copying, cutting and pasting layers, placing an SVG file or an
// image, and putting an image into a layer as its fill, with the layer a dragged image would go into.
import type { CanvasKit } from '@dazbee/canvaskit'
import { ancestorsOf, childrenOf, mergedProps, type Session } from '@dazbee/doc'
import {
  canHold,
  type Design,
  type Layer,
  LayerClipboard,
  type LayerTree,
  type Paint,
  type Point,
} from '@dazbee/schema'
import { type Skipped, SVG_TYPE, SvgError, svgMarkup, svgToLayers } from '@dazbee/svg'

import type { EditorActions } from './actions.ts'
import { frameKey, scope } from './canvas/grid.ts'
import { hitTest } from './canvas/hit-test.ts'
import type { FrameScenes } from './canvas/scenes.ts'
import type { EditorView, Spot } from './canvas/view.ts'
import { keepCopy, layersOnClipboard, putOnClipboard, rememberedLayers } from './clipboard.ts'
import { newImage, withImage } from './gestures/draw-tools.ts'
import type { EditorBoxes } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { boundsOf, localTo, round } from './layers/transform.ts'
import { runQuietly } from './run-quietly.ts'
import type { EditorSelection, Picked } from './selection.ts'
import { inField } from './shortcuts.ts'
import type { EditorTyping } from './text/typing.ts'
import type { EditorTools, PlacedAsset } from './tools.ts'

export interface PlaceDeps {
  ck: CanvasKit
  session: Session
  /** The design the copied layers come from. */
  designId: string
  view: Pick<EditorView, 'design' | 'frames' | 'frameOf' | 'inView' | 'middleFrame' | 'pointAt' | 'spotAt'>
  tools: Pick<EditorTools, 'setTool'>
  selection: Pick<EditorSelection, 'current' | 'entered' | 'select'>
  scenes: Pick<FrameScenes, 'scene'>
  boxes: Pick<EditorBoxes, 'roots' | 'boxIn' | 'containersOf' | 'pickable'>
  typing: Pick<EditorTyping, 'editing' | 'stop' | 'fitText' | 'copy' | 'cut' | 'paste'>
  actions: Pick<EditorActions, 'perform'>
  /** Tells the page that an SVG can't be read, or had parts no layer shows, which come as `parts`. */
  notify: (notice: 'svgUnreadable' | 'svgLeftOut', parts?: readonly Skipped[]) => void
  /** Aborted when the editor is destroyed: a file read after that places nothing. */
  signal: AbortSignal
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorPlace {
  /** The layer an image dragged over the stage would go into, outlined while it is over it. */
  dropTarget(): Picked | null
  /** The copy event: the text selected in the text being edited, or else the selected layers. */
  copy(e: ClipboardEvent): void
  /** The cut event: the selected layers, copied then deleted, or the text selected in the text being edited. */
  cut(e: ClipboardEvent): void
  /**
   * The paste event: copied layers, or an SVG file or its markup, or text into the text being
   * edited. `pointer` is where the pointer is over the stage, in client coordinates, or null.
   */
  paste(e: ClipboardEvent, pointer: () => Point | null): void
  /** Mod+V went down: the paste that follows goes where the pointer is when Shift is down too. */
  aimPaste(atPointer: boolean): void
  /** Copies the selected layers, kept on this device for Paste in a menu; false with nothing to copy. */
  copyLayers(): boolean
  /** Whether Paste in a menu has layers to place: the ones last copied in Dazbee on this device. */
  canPasteLayers(): boolean
  /** Pastes the layers last copied in Dazbee on this device, with the pointer where it is; false with none kept. */
  pasteLayers(pointer: () => Point | null): boolean
  /** Places an SVG file as layers, centred on a spot or a point in client coordinates, or in the frame in view. */
  placeSvg(text: string, name: string, where?: Point | Spot): string | null
  /** Places an image asset as a graphic filled with it, centred on a spot or a point in client coordinates, or in the frame in view. */
  placeImage(asset: PlacedAsset, where?: Point | Spot): string | null
  /** Outlines the layer an image dragged over the stage at `client` would go into, or none with null; returns its id. */
  imageTarget(client: Point | null): string | null
  /** Puts an image into a layer as its fill, in every format, as one undo step; selects the layer. */
  fillWithImage(id: string, asset: PlacedAsset, inFrame?: string): boolean
}

/** The share of a frame's shorter side a placed SVG may take before it is scaled down to it. */
const SVG_ROOM = 0.6

export function editorPlace({
  ck,
  session,
  designId,
  view: { design: drawn, frames, frameOf, inView, middleFrame, pointAt, spotAt },
  tools,
  selection,
  scenes,
  boxes,
  typing,
  actions,
  notify,
  signal,
  drawOverlay,
}: PlaceDeps): EditorPlace {
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  const hug = (ids: string[]) => hugIn(session, ids)
  /** The layer an image dragged over the stage would be put into, outlined while it is over it. */
  let dropTarget: Picked | null = null
  /** Whether the paste being made goes where the pointer is (Mod+Shift+V), not where the layers were. */
  let pasteAtPointer = false

  function currentDropTarget() {
    return dropTarget
  }
  /**
   * The layer under a point, in client coordinates, that an image dropped there goes into as its
   * fill: a shape, frame or boolean (a shape inside a boolean gives the boolean, whose paint shows),
   * not a line, and not one whose style is locked. Null over text, a group's gaps or empty space.
   */
  function imageTargetAt(client: Point): Picked | null {
    const design = drawn()
    const at = pointAt(client)
    const hit = at && hitTest(scenes.scene(at.frame).layers, at.p, boxes.pickable)
    if (!at || !hit) return null
    let id = hit.id
    for (const up of ancestorsOf(design, design.nodes[id]?.parentId ?? ''))
      if (design.nodes[up]?.type === 'boolean') id = up
    const node = design.nodes[id]
    const takes =
      node?.type === 'frame' ||
      node?.type === 'boolean' ||
      (node?.type === 'graphic' && node.props.shape.kind !== 'line')
    return takes && !node.lock?.style ? { id, frame: at.frame.key } : null
  }

  /** Where something placed with no point goes: the frame in the middle of the view, else the selection's or the first. */
  function frameToPlaceIn() {
    return middleFrame() ?? frameOf(selection.current()?.frame) ?? frames()[0]
  }

  /**
   * The selected layers as a tree for the clipboard (#49), bottom to top with everything inside
   * them, each as the selection's format shows it: placed by auto layout, with the format's overrides.
   */
  function copiedLayers(): LayerClipboard | null {
    const current = selection.current()
    const frame = current && frameOf(current.frame)
    if (!frame || typing.editing()) return null
    const now = session.design()
    const stacked: string[] = []
    const walk = (parentId: string) => {
      for (const [id] of childrenOf(now, parentId)) {
        stacked.push(id)
        walk(id)
      }
    }
    walk(frame.pageId)
    const tops = boxes.roots(now).sort((a, b) => stacked.indexOf(a) - stacked.indexOf(b))
    if (tops.length === 0) return null
    const nodes: Record<string, Layer> = {}
    const add = (id: string) => {
      const node = now.nodes[id]
      const box = boxes.boxIn(frame, id, now)
      if (!node || !box) return
      nodes[id] = { ...node, props: { ...mergedProps(now, scope(frame), id), ...box } } as Layer
      for (const [child] of childrenOf(now, id)) add(child)
    }
    for (const id of tops) add(id)
    return {
      kind: 'dazbee.layers',
      designId,
      tree: { nodes, roots: tops },
    }
  }
  /**
   * Pastes layers (#49) into the frame the selection is in, or else the one under the pointer: in
   * the group or frame double-clicked into when it can hold them, otherwise on the page, where they
   * were or centred on the pointer. One undo step; the pasted layers end up selected.
   */
  function pasteTree(tree: LayerTree, atPointer: boolean, pointer: Point | null) {
    const under = pointer ? pointAt(pointer) : null
    const frame = frameOf(selection.current()?.frame) ?? under?.frame ?? inView()[0] ?? frames()[0]
    if (!frame) return
    const now = session.design()
    const entered = selection.entered()
    const inside = entered ? now.nodes[entered] : undefined
    const holds = inside && tree.roots.every((root) => canHold(inside.type, tree.nodes[root]?.type ?? ''))
    const parentId = entered && holds && selection.current()?.frame === frame.key ? entered : frame.pageId
    let dx = 0
    let dy = 0
    if (atPointer && under?.frame.key === frame.key) {
      const p = localTo(under.p, boxes.containersOf(frame, parentId, now))
      const b = boundsOf(
        tree.roots.flatMap((root) => {
          const props = tree.nodes[root]?.props
          return props
            ? [{ x: props.x, y: props.y, width: props.width, height: props.height, rotation: props.rotation }]
            : []
        }),
      )
      dx = round(p.x - (b.x + b.width / 2))
      dy = round(p.y - (b.y + b.height / 2))
    }
    let pasted: string[] = []
    if (
      runQuietly(() =>
        session.gesture(() => {
          pasted = session.run('design.place', { parentId, tree, dx, dy })
          if (now.nodes[parentId]) hug([parentId])
        }),
      )
    )
      selection.select(pasted, frame.key)
  }

  /**
   * Places an SVG file as layers: a group of path, text and mask layers drawn as the file
   * is, in one undo step. It goes centred on `spot`, or at `client`, in client coordinates, or else
   * in the middle of the frame in view; a file larger than SVG_ROOM of the frame's shorter side is
   * scaled down to it; what the file had that no layer shows is noticed. Returns the group's id, or
   * null when it placed nothing: there is no frame to put it in, or the file can't be read, which is
   * noticed too.
   */
  function placeSvgAt(
    text: string,
    name: string,
    where: { client?: Point | null | undefined; spot?: Spot },
  ): string | null {
    const client = where.client ?? undefined
    const spot = where.spot ?? (client && spotAt(client))
    // A point off every frame puts the file in the middle of the selection's frame; with no point,
    // it goes in the frame in the middle of the view.
    const frame = spot ? frameOf(spot.frame) : client ? frameOf(selection.current()?.frame) : frameToPlaceIn()
    if (!frame) return null
    const at = spot ? { x: spot.x, y: spot.y } : { x: frame.width / 2, y: frame.height / 2 }
    let made: ReturnType<typeof svgToLayers>
    try {
      const natural = svgToLayers(ck, text, { name })
      const room = Math.min(frame.width, frame.height) * SVG_ROOM
      made = Math.max(natural.width, natural.height) > room ? svgToLayers(ck, text, { name, fit: room }) : natural
    } catch (error) {
      if (!(error instanceof SvgError)) throw error
      notify('svgUnreadable')
      return null
    }
    const box = made.tree.nodes[made.root]?.props
    if (!box) return null
    typing.stop()
    let ids: string[] = []
    const ok = runQuietly(() =>
      session.gesture(() => {
        ids = session.run('design.place', {
          parentId: frame.pageId,
          tree: made.tree,
          dx: round(at.x - (box.x + box.width / 2)),
          dy: round(at.y - (box.y + box.height / 2)),
        })
        // Text is measured in its font, as the editor lays it out.
        const placed = session.design()
        const fitTexts = (id: string) => {
          if (placed.nodes[id]?.type === 'text') typing.fitText(id)
          for (const [child] of childrenOf(placed, id)) fitTexts(child)
        }
        for (const root of ids) fitTexts(root)
      }),
    )
    const id = ids[0]
    if (!ok || !id) return null
    tools.setTool('select')
    selection.select([id], frame.key)
    if (made.skipped.length > 0) notify('svgLeftOut', made.skipped)
    return id
  }

  // Copy, cut and paste plain text while typing (#47), and layers otherwise (#49). Pasted line
  // breaks become paragraphs.
  function copy(e: ClipboardEvent) {
    if (inField(e.target) || !e.clipboardData) return
    if (typing.copy(e)) return
    const copied = copiedLayers()
    if (!copied) return
    putOnClipboard(e.clipboardData, copied)
    e.preventDefault()
  }
  function cut(e: ClipboardEvent) {
    if (!typing.editing() && !inField(e.target) && e.clipboardData) {
      const copied = copiedLayers()
      if (!copied) return
      putOnClipboard(e.clipboardData, copied)
      e.preventDefault()
      actions.perform('delete')
      return
    }
    if (!inField(e.target)) typing.cut(e)
  }
  function paste(e: ClipboardEvent, pointer: () => Point | null) {
    if (inField(e.target)) return
    if (!typing.editing()) {
      // Layers copied in this or another design, or an SVG file or its markup; anything else on the
      // clipboard isn't ours to paste.
      const tree = layersOnClipboard(e.clipboardData)
      if (!tree) {
        const atPointer = pasteAtPointer
        pasteAtPointer = false
        const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type === SVG_TYPE)
        const markup = svgMarkup(e.clipboardData?.getData(SVG_TYPE) || e.clipboardData?.getData('text/plain'))
        if (!file && !markup) return
        e.preventDefault()
        if (markup) placeSvgAt(markup, 'SVG', { client: atPointer ? pointer() : undefined })
        else if (file) {
          void file.text().then((text) => {
            if (!signal.aborted)
              placeSvgAt(text, file.name.replace(/.svg$/i, '') || 'SVG', { client: atPointer ? pointer() : undefined })
          })
        }
        return
      }
      e.preventDefault()
      pasteTree(tree, pasteAtPointer, pointer())
      pasteAtPointer = false
      return
    }
    typing.paste(e)
  }
  function aimPaste(atPointer: boolean) {
    pasteAtPointer = atPointer
  }

  function copyLayers() {
    const copied = copiedLayers()
    if (!copied) return false
    const { plain, kept } = keepCopy(copied)
    if (!kept) return false
    void navigator.clipboard?.writeText(plain).catch(() => {
      // Without clipboard access, Paste in the menu still has the kept copy.
    })
    return true
  }
  function canPasteLayers() {
    return rememberedLayers() !== null
  }
  function pasteLayers(pointer: () => Point | null) {
    const tree = rememberedLayers()
    if (!tree) return false
    pasteTree(tree, false, pointer())
    return true
  }
  function placeImage(asset: PlacedAsset, where?: Point | Spot): string | null {
    // A point off every frame places nothing; with no point, it goes in the frame in the middle of the view.
    const spot = where && ('frame' in where ? where : spotAt(where))
    if (where && !spot) return null
    const frame = spot ? frameOf(spot.frame) : frameToPlaceIn()
    if (!frame) return null
    const at = spot ? { x: spot.x, y: spot.y } : { x: frame.width / 2, y: frame.height / 2 }
    typing.stop()
    let id = ''
    if (
      !runQuietly(() => {
        id = session.run('node.create', { parentId: frame.pageId, layer: newImage(asset, at, frame) })
      })
    )
      return null
    tools.setTool('select')
    selection.select([id], frame.key)
    return id
  }
  function placeSvg(text: string, name: string, where?: Point | Spot) {
    return placeSvgAt(text, name, !where ? {} : 'frame' in where ? { spot: where } : { client: where })
  }
  function imageTarget(client: Point | null): string | null {
    const next = client ? imageTargetAt(client) : null
    if (next?.id !== dropTarget?.id || next?.frame !== dropTarget?.frame) {
      dropTarget = next
      drawOverlay()
    }
    return next?.id ?? null
  }
  function fillWithImage(id: string, asset: PlacedAsset, inFrame?: string): boolean {
    const now = session.design()
    const node = now.nodes[id]
    if (!node || !('fills' in node.props) || node.lock?.style) return false
    const fills = node.props.fills as Paint[]
    const page = pageOf(now, id)
    const near = [inFrame, dropTarget?.id === id ? dropTarget.frame : undefined, selection.current()?.frame]
      .map(frameOf)
      .find((f) => f?.pageId === page)
    const frame = near ?? frameOf(frameKey(page, now.meta.primaryFormatId))
    dropTarget = null
    typing.stop()
    const ok = runQuietly(() =>
      session.gesture(() => {
        session.run('node.update', { ids: [id], patch: { fills: withImage(fills, asset.id) } })
        for (const [scope, byNode] of Object.entries(now.overrides)) {
          const own = byNode[id]?.fills as Paint[] | undefined
          if (own)
            session.run('node.update', {
              ids: [id],
              scope,
              patch: { fills: withImage(own, asset.id) },
            })
        }
      }),
    )
    if (ok && frame) selection.select([id], frame.key)
    drawOverlay()
    return ok
  }

  return {
    dropTarget: currentDropTarget,
    copy,
    cut,
    paste,
    aimPaste,
    copyLayers,
    canPasteLayers,
    pasteLayers,
    placeSvg,
    placeImage,
    imageTarget,
    fillWithImage,
  }
}

/** The page a layer is on. */
function pageOf(design: Design, id: string) {
  let up = id
  while (design.nodes[up]) up = design.nodes[up]?.parentId ?? ''
  return up
}
