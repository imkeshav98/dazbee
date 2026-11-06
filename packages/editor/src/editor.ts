/* eslint-disable max-lines -- one deep module: startEditor builds every editor module in the code layout's order and returns the Editor */
// The editor: a design's pages, each an infinite canvas with its frames where they were placed,
// shown one page at a time (#36); click to select, drag to move, typing into text, pan and zoom.
// It has no framework in it; the page only hands it a canvas and an overlay the size of the stage.
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

import type { CanvasKit } from '@dazbee/canvaskit'
import { frameIdOf, openSession, readDesign, type Session } from '@dazbee/doc'
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { renderDesign, type ResourceCache, resourceCache } from '@dazbee/renderer'
import {
  type Design,
  fontFamilies,
  imageAssetIds,
  type Point,
  type Rect,
  type VariableRef,
  type Variables,
} from '@dazbee/schema'
import type { Skipped } from '@dazbee/svg'

import { toggled } from './across-frames.ts'
import { editorActions } from './actions.ts'
import { editorBrandKit } from './brand-kit.ts'
import { frameIn } from './canvas/frames.ts'
import { editorOverlay } from './canvas/overlay.ts'
import { frameScenes } from './canvas/scenes.ts'
import { thumbnailCache } from './canvas/thumbnails.ts'
import { editorView, type Spot } from './canvas/view.ts'
import { loadCanvasKit } from './canvaskit.ts'
import type { DrawInfo, Editor, EditorOptions, Notice } from './editor-interface.ts'
import { editorExports } from './export/exports.ts'
import { editorFrameActions } from './frame-actions.ts'
import { editorCropping } from './gestures/crop/cropping.ts'
import { editorDrawing } from './gestures/drawing/drawing.ts'
import { editorPen } from './gestures/pen/pen.ts'
import { editorPointer } from './gestures/pointer.ts'
import { editorAutoLayoutDrag } from './gestures/select/auto-layout-drag.ts'
import { editorFrameMove } from './gestures/select/frame-move.ts'
import { editorSelectPress } from './gestures/select/select-press.ts'
import { carried, editorTransformDrag } from './gestures/select/transform-drag.ts'
import { editorLayerEdits } from './layer-edits.ts'
import { editorBoxes } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { editorLinkedCopies, LINKED_ACTIONS, type LinkedAction } from './linked-copies.ts'
import { listenerSet } from './listener-set.ts'
import { editorPlace } from './place.ts'
import { editorResources, loadFonts, loadImages, shippedFonts } from './resources.ts'
import { watchSaveState } from './save-state.ts'
import { editorSelection, firstFrameOf, idsOf } from './selection.ts'
import { inField, type ShortcutAction, shortcutFor } from './shortcuts.ts'
import type { RunStyle } from './text/text-edit.ts'
import { editorTyping } from './text/typing.ts'
import { editorTools, type PlacedAsset, type Tool } from './tools.ts'

/** The popover, menu or dialog a key was pressed in, if any. */
const dialogOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest('[role="dialog"], [role="menu"], dialog') : null
/** Whether an action is one the linked-copy actions do. */
const isLinked = (action: ShortcutAction): action is LinkedAction =>
  (LINKED_ACTIONS as readonly string[]).includes(action)
/** Whether a key is an arrow pressed in a toolbar, such as the top bar, whose arrows move the focus along it. */
const arrowInToolbar = (e: KeyboardEvent) =>
  e.key.startsWith('Arrow') && e.target instanceof Element && e.target.closest('[role="toolbar"]') !== null
export async function startEditor(options: EditorOptions) {
  const { designId, syncUrl } = options
  const status = options.onStatus ?? (() => {})
  status('Loading renderer')
  const ck: CanvasKit = await loadCanvasKit()
  // The fonts we ship, the fallbacks among them, load first; the design's own families once it is here.
  const fontBytes = await shippedFonts()
  const resourceBytes = {
    fonts: fontBytes,
    fallbackFamilies: [...FALLBACK_FAMILIES],
    images: {},
    ...(options.variables ? { variables: options.variables } : {}),
  }
  // One cache for the screen and exports: fonts and images are decoded once for the editor's life.
  const cache = resourceCache(ck)
  status('Connecting')
  const doc = new Y.Doc()
  // The design kept in this browser (#37): a crash, a closed tab or a reload without a connection
  // loses nothing, and edits made offline merge when the sync server is back.
  const local = new IndexeddbPersistence(`dazbee-design-${designId}`, doc)
  const provider = new HocuspocusProvider({
    url: syncUrl,
    name: designId,
    document: doc,
    token: options.syncToken,
    onAuthenticationFailed: ({ reason }) => status(`Error: the sync server refused this design (${reason})`),
  })
  try {
    await local.whenSynced
    // A copy on this device opens at once, even offline; a first visit waits for the sync server.
    const kept = doc.store.clients.size > 0
    await new Promise<void>((resolve, reject) => {
      const stop = () => reject(new Error('stopped while connecting'))
      if (options.signal?.aborted) stop()
      options.signal?.addEventListener('abort', stop)
      if (kept || provider.synced) resolve()
      else provider.on('synced', () => resolve())
    })
    // The first frame and any export need every image the design names, so they load first;
    // offline, a kept design opens without them and they load when they can.
    const opened = readDesign(doc)
    const [images, fonts] = await Promise.all([
      loadImages(imageAssetIds(opened), options).catch((error: unknown) => {
        if (kept) return {}
        throw error
      }),
      loadFonts(fontFamilies(opened, options.variables), options).catch((error: unknown) => {
        if (kept) return []
        throw error
      }),
    ])
    return live(
      ck,
      cache,
      { ...resourceBytes, fonts: [...resourceBytes.fonts, ...fonts], images },
      doc,
      provider,
      local,
      options,
    )
  } catch (error) {
    provider.destroy()
    await local.destroy()
    doc.destroy()
    cache.delete()
    throw error
  }
}

/** The editor once the design has arrived: everything it makes is freed by `destroy`. */
function live(
  ck: CanvasKit,
  cache: ResourceCache,
  firstBytes: Parameters<typeof renderDesign>[3],
  doc: Y.Doc,
  provider: HocuspocusProvider,
  local: IndexeddbPersistence,
  options: EditorOptions,
): Editor {
  const { canvas } = options
  const status = options.onStatus ?? (() => {})
  // Removes every listener the editor adds, on destroy.
  const listening = new AbortController()
  const { signal } = listening
  const on = { signal }
  /** Told when the text being edited, or its selected range, changes. */
  const textSelection = listenerSet<[]>()
  /**
   * Told when a gesture has nothing to do because auto layout decides it, so the page can say why,
   * and when an SVG can't be read or had parts no layer shows, which come as `parts`.
   */
  const notices = listenerSet<[notice: Notice, parts: readonly Skipped[]]>()
  const notify = (notice: Notice, parts: readonly Skipped[] = []) => notices.emit(notice, parts)
  /** Called after every redraw with the design it drew; the two-tab test times edits with it. */
  const draws = listenerSet<[design: Design, at: number, info: DrawInfo]>()
  /** Told of a frame to rename in place: its label was double-clicked, or the page asked. */
  const frameRenames = listenerSet<[frameId: string]>()

  // Layer 2: the state owners.
  const saving = watchSaveState({ provider, onSaveState: (state) => status(state) })
  const session: Session = openSession(doc)
  const view = editorView({ ck, canvas, session, onZoom: (zoom) => options.onZoom?.(zoom), draw })
  const { frameOf, placeBox, outline, camera, design: drawn, frames } = view
  const resources = editorResources({
    ck,
    cache,
    first: firstBytes,
    sources: {
      ...(options.assetBytes ? { assetBytes: options.assetBytes } : {}),
      ...(options.fontFiles ? { fontFiles: options.fontFiles } : {}),
    },
    connected: saving.connected,
    status,
    signal,
  })
  const scenes = frameScenes({ ck, resources, drawn })
  const tools = editorTools({ finish: finishPath, changed: showCursor, onSnapping: view.viewChanged })
  const selection = editorSelection({ drawn, frames, changed: drawOverlay })

  // Layer 3: the queries.
  const boxes = editorBoxes({ session, scenes, resources, selection, drawn, frameOf })
  const hug = (ids: string[]) => hugIn(session, ids)
  const thumbnails = thumbnailCache({ ck, scenes, resources, current: () => session.design(), drawn })
  const exporting = editorExports({ ck, cache, session, resources, view })

  // Layer 4: the behaviours.
  const typing = editorTyping({
    ck,
    doc,
    session,
    resources,
    scenes,
    frameOf,
    hug,
    placeBox,
    textSelectionChanged: textSelection.emit,
    drawOverlay,
  })
  const pen = editorPen({ canvas, session, selection, tools, typing, camera, drawn, frameOf, boxes, hug, drawOverlay })
  const cropping = editorCropping({
    canvas,
    session,
    selection,
    thumbnails,
    camera,
    frameOf,
    boxes,
    outline,
    drawOverlay,
  })
  const frameActions = editorFrameActions({
    session,
    view,
    tools,
    frameName: options.frameName,
    selection,
    drawOverlay,
  })
  const drawing = editorDrawing({
    canvas,
    session,
    selection,
    tools,
    typing,
    boxes,
    camera,
    page: view.page,
    frameName: options.frameName,
    frameActions,
    hug,
    placeBox,
    drawOverlay,
  })
  const transformDrag = editorTransformDrag({
    canvas,
    session,
    scenes,
    selection,
    typing,
    boxes,
    camera,
    frames,
    hug,
    notify,
    placeBox,
  })
  const autoLayoutDrag = editorAutoLayoutDrag({ session, boxes, camera, hug, notify, outline })
  const frameMove = editorFrameMove({ session })
  const selectPress = editorSelectPress({
    canvas,
    view,
    selection,
    boxes,
    typing,
    transformDrag,
    autoLayoutDrag,
    frameMove,
  })
  const actions = editorActions({
    session,
    view,
    tools,
    selection,
    scenes,
    boxes,
    pen,
    transformDrag,
    autoLayoutDrag,
    frameActions,
    notify,
    drawOverlay,
  })
  const place = editorPlace({
    ck,
    session,
    designId: options.designId,
    view,
    tools,
    selection,
    boxes,
    typing,
    actions,
    notify,
    signal,
    drawOverlay,
  })
  const brandKit = editorBrandKit({ session, resources, view, selection, typing, signal })
  const layerEdits = editorLayerEdits({ session, selection, resources, typing, signal })
  const linked = editorLinkedCopies({ session, selection, typing, resources, signal, drawOverlay })

  // Layer 5: the routers.
  const pointer = editorPointer({
    canvas,
    overlay: options.overlay,
    session,
    view,
    tools,
    selection,
    boxes,
    typing,
    pen,
    cropping,
    drawing,
    transformDrag,
    autoLayoutDrag,
    frameMove,
    selectPress,
    renameFrame: (frameId: string) => pickFrame(frameId, true),
    signal,
    drawOverlay,
  })
  const overlay = editorOverlay({
    overlay: options.overlay,
    view,
    selection,
    boxes,
    typing,
    pen,
    cropping,
    drawing,
    transformDrag,
    autoLayoutDrag,
    place,
    pointer,
  })

  // Called late-bound by modules built before what they call.
  function finishPath() {
    pen.finish()
  }
  function showCursor() {
    pointer.showCursor()
  }
  function drawOverlay() {
    overlay.draw()
  }

  /**
   * The frame callback: brings the view up to date, lets the selection and typing go when what
   * they are on is gone, draws the scene, checks the hover again and draws the overlay.
   */
  function draw() {
    const started = performance.now()
    view.update()
    selection.keep()
    typing.stopWhenGone()
    const design = view.design()
    let recorded = 0
    const painted = view.paint(
      (inView) => {
        const made = scenes.pictures(view.frames(), inView, resources.screen(design))
        recorded = made.recorded
        return made.pictures
      },
      () => {
        // What a drag carries, drawn faintly past its frame's edge.
        const drag = carried(pointer.gesture())
        return drag && { frame: drag.frame, picture: scenes.ghost(drag.frame, drag.roots, resources.screen(design)) }
      },
    )
    if (!painted) return
    pointer.rehover()
    drawOverlay()
    const info = {
      ms: performance.now() - started,
      drawn: view.inView().length,
      frames: view.frames().length,
      recorded,
    }
    const at = performance.timeOrigin + performance.now()
    draws.emit(design, at, info)
  }

  /**
   * Does what a shortcut names, as the actions and the linked-copy actions do; undo and redo first
   * end what is open on the stage: the pen's path, a drag and typing.
   */
  function perform(action: ShortcutAction) {
    if (isLinked(action)) return linked.perform(action)
    if (action !== 'undo' && action !== 'redo') return actions.perform(action)
    pen.finish()
    pointer.endDrag()
    typing.stop()
    if (action === 'undo') session.undo()
    else session.redo()
    return true
  }
  /** Sends a key to what it is for: undo and redo, the pointer's keys, the shortcuts, or the text being edited. */
  function onKey(e: KeyboardEvent) {
    if (inField(e.target)) return
    // The paste event that follows doesn't say whether Shift was down.
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') place.aimPaste(e.shiftKey)
    const action = shortcutFor(e)
    if (action === 'undo' || action === 'redo') {
      e.preventDefault()
      perform(action)
      return
    }
    // Keys pressed in a popover, menu or dialog, such as Escape to close it, are its own, not the
    // stage's; undo and redo still are. Space still pans beside a dialog that says it is not modal,
    // as the edit panel does.
    const dialog = dialogOf(e.target)
    if (dialog) {
      if (dialog.getAttribute('aria-modal') === 'false') pointer.keyDown(e)
      return
    }
    // The arrows in a toolbar are its own: they never move the selection, the picked frame or the caret.
    if (arrowInToolbar(e)) return
    if (!typing.editing()) {
      if (!pointer.keyDown(e) && action && perform(action)) e.preventDefault()
      return
    }
    typing.key(e)
  }
  /**
   * Selects layers in the frames of the first one's page, as the app asks, ending typing first: any
   * on other pages are left out, and that page is shown first when another is. None clears it.
   */
  function select(ids: string[]) {
    typing.stop()
    const now = session.design()
    const layers = ids.flatMap((id) => {
      const frameId = now.nodes[id] ? frameIdOf(now, id) : undefined
      return frameId === undefined ? [] : [{ id, frameId }]
    })
    const pageId = now.frames[layers[0]?.frameId ?? '']?.pageId
    if (pageId === undefined) {
      selection.select([], null)
      return
    }
    if (pageId !== view.page()) showPage(pageId)
    selection.selectAcross(layers)
  }
  /** Shift and a click on a layer of the shown page, from a list: as on the stage, it is added, taken out or selected alone. */
  function toggleSelected(id: string) {
    const now = session.design()
    const frameId = now.nodes[id] ? frameIdOf(now, id) : undefined
    if (frameId === undefined || !frameOf(frameId)) return
    typing.stop()
    selection.selectAcross(toggled(selection.current(), { id, frameId }, now))
  }
  /**
   * Shows a page, its frames fitted: a selection, crop, path edit, pen path or typing on another
   * page lets go, and so does the picked frame.
   */
  function showPage(pageId: string) {
    pen.finish()
    view.showPage(pageId)
    selection.dropOffPage()
    const editing = typing.editing()
    if (editing && !frameOf(editing.frameId)) typing.stop()
    selection.pickFrame(null)
    drawOverlay()
  }
  /**
   * Picks a frame of the shown page, ending typing, and with `rename` asks the page to rename it in
   * place of its label, which the overlay leaves out meanwhile; any other frame lets the picked one go.
   */
  function pickFrame(frameId: string | null, rename = false) {
    const shown = frameOf(frameId ?? undefined)
    if (shown) typing.stop()
    if (!shown || !rename) return selection.pickFrame(shown?.id ?? null)
    selection.renameFrame(shown.id)
    frameRenames.emit(shown.id)
  }
  /** Lights a frame from outside the stage, or none, and shows it. */
  function lightFrame(frameId: string | null) {
    if (selection.lightFrame(frameId)) drawOverlay()
  }
  /** Renames a frame of the shown page in place of its label, panning first, at the same zoom, so the label shows. */
  function renameFrame(frameId: string) {
    const frame = frameOf(frameId)
    if (frame) view.showLabel(frame)
    pickFrame(frameId, true)
  }
  /** Fits a frame in view, showing its page first when another is shown. */
  function fitFrame(frameId: string) {
    const now = session.design()
    const pageId = Object.hasOwn(now.frames, frameId) ? now.frames[frameId]?.pageId : undefined
    if (pageId !== undefined && pageId !== view.page()) showPage(pageId)
    view.fitArea(view.defaultFrame(frameId))
  }
  /** Pans, at the same zoom, so a frame of the shown page shows clear of the chrome, and out from under `panel` when it lies under it. */
  function showFrame(frameId: string, panel?: Rect) {
    const frame = frameOf(frameId)
    if (frame) view.showArea(frame, panel)
  }
  /** A layer's box as drawn in its frame, shown or not. */
  function boxOf(id: string) {
    const now = session.design()
    const frameId = frameIdOf(now, id)
    const frame = frameId === undefined ? undefined : frameIn(now, frameId)
    return frame ? boxes.drawnRect(frame, id) : null
  }
  function stopEditing() {
    if (!typing.editing()) return
    typing.stop()
    drawOverlay()
  }
  function settle() {
    if (!typing.editing() && !pen.drawing()) return
    typing.stop()
    pen.finish()
    drawOverlay()
  }

  doc.on('update', view.redraw)
  resources.onArrive(() => view.redraw())

  window.addEventListener('copy', place.copy, on)
  window.addEventListener('cut', place.cut, on)
  window.addEventListener('paste', (e) => place.paste(e, pointer.pointerAt), on)
  window.addEventListener('keydown', onKey, on)
  window.addEventListener('keyup', pointer.keyUp, on)
  for (const type of ['keydown', 'pointerdown', 'focusin'])
    window.addEventListener(type, pointer.input, { ...on, capture: true })
  window.addEventListener('blur', pointer.blur, on)

  view.resize()
  view.fitAll()
  options.onZoom?.(view.camera().zoom)
  draw()
  saving.start()

  void brandKit.refitBrandFonts()

  return {
    session,
    doc,
    design: () => session.design(),
    selected: () => selection.current()?.[0]?.id ?? null,
    selection: () => idsOf(selection.current()),
    selectedFrame: () => firstFrameOf(selection.current()) ?? null,
    toggleSelected,
    select,
    perform,
    ungroupState: actions.ungroupState,
    canUndo: () => session.canUndo(),
    canRedo: () => session.canRedo(),
    onHistory: (listener: () => void) => session.onHistory(listener),
    copyLayers: () => place.copyLayers(),
    canPasteLayers: () => place.canPasteLayers(),
    pasteLayers: () => place.pasteLayers(pointer.pointerAt),
    linkedMenu: linked.menu,
    moveLayer: layerEdits.moveLayer,
    beginGesture: () => session.beginGesture(),
    gesturing: () => pointer.gesture() !== null || session.inGesture(),
    setProps: layerEdits.setProps,
    renameLayer: layerEdits.renameLayer,
    setLocked: layerEdits.setLocked,
    setHidden: layerEdits.setHidden,
    onNotice: notices.on,
    selectionRect: overlay.selectionRect,
    selectAt: pointer.selectAt,
    busy: () => pointer.gesture() !== null,
    textSelection: () => typing.selectedText(),
    textSelectionStyles: () => typing.selectionStyles(),
    styleTextSelection: (style: RunStyle) => typing.styleSelectedText(style),
    onTextSelection: textSelection.on,
    onSelection: (listener: (ids: string[]) => void) => selection.onSelection(listener),
    pickedFrame: () => selection.pickedFrame(),
    pickFrame: (frameId: string | null) => pickFrame(frameId),
    onFramePick: (listener: (frameId: string | null) => void) => selection.onFramePick(listener),
    lightFrame,
    renameFrame,
    onFrameRename: frameRenames.on,
    renamed: () => selection.renameFrame(null),
    onFrameDelete: frameActions.onFrameDelete,
    addFrame: frameActions.addFrame,
    addSize: frameActions.addSize,
    labelRect: overlay.labelRect,
    rulers: () => view.rulers(),
    snapping: () => tools.snapping(),
    snapWork: () => transformDrag.snapWork(),
    setSnapping: (on: boolean) => tools.setSnapping(on),
    onView: view.onView,
    frames: view.frames,
    shownPage: view.page,
    showPage,
    camera: view.camera,
    viewport: view.viewport,
    setCamera: view.setCamera,
    setInsets: view.setInsets,
    zoomTo: view.zoomTo,
    zoomIn: view.zoomIn,
    zoomOut: view.zoomOut,
    fitAll: view.fitAll,
    fitSelection: actions.fitSelection,
    fitFrame,
    showFrame,
    setTool: (next: Tool) => tools.setTool(next),
    tool: () => tools.tool(),
    armImage: (asset: PlacedAsset | null) => tools.setTool(asset ? 'image' : tools.tool(), asset),
    imageArmed: () => tools.imageToPlace() !== null,
    onTool: (listener: (tool: Tool) => void) => tools.onTool(listener),
    screenPoint: view.screenPoint,
    boxOf,
    loaded: () => resources.loaded(),
    drawn: () => (view.scheduled() ? draws.next() : Promise.resolve()),
    onDraw: draws.on,
    exportPixels: exporting.pixels,
    exportFiles: exporting.files,
    loadedFamilies: () => resources.families(),
    setFont: layerEdits.setFont,
    variables: () => resources.bytes().variables ?? {},
    setVariables: (variables: Variables) => brandKit.setVariables(variables),
    bindSelection: (kind: 'color' | 'font', ref: VariableRef | null) => brandKit.bindSelection(kind, ref),
    placeImage: (asset: PlacedAsset, where?: Point | Spot) => place.placeImage(asset, where),
    placeSvg: (text: string, name: string, where?: Point | Spot) => place.placeSvg(text, name, where),
    spotAt: view.spotAt,
    stopEditing,
    settle,
    destroyed: () => signal.aborted,
    imageTarget: (client: Point | null) => place.imageTarget(client),
    fillWithImage: (id: string, asset: PlacedAsset) => place.fillWithImage(id, asset),
    pageThumbnail: thumbnails.page,
    layerThumbnail: thumbnails.layer,
    synced: () => provider.synced && provider.unsyncedChanges === 0,
    destroy() {
      listening.abort()
      exporting.destroy()
      draws.clear()
      selection.destroy()
      notices.clear()
      thumbnails.destroy()
      tools.destroy()
      doc.off('update', view.redraw)
      scenes.destroy()
      resources.destroy()
      session.destroy()
      saving.destroy()
      provider.destroy()
      void local.destroy()
      doc.destroy()
      cache.delete()
      view.destroy()
    },
  }
}
