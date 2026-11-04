// The editor: one infinite canvas per design with every page in every format as a frame (#36),
// click to select, drag to move, typing into text, pan and zoom. It has no framework in it; the
// page only hands it a canvas and an overlay the size of the stage.
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

import type { CanvasKit } from '@dazbee/canvaskit'
import { openSession, readDesign, type Session } from '@dazbee/doc'
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { renderDesign, type ResourceCache, resourceCache } from '@dazbee/renderer'
import { type Design, fontFamilies, imageAssetIds, type Point, type VariableRef, type Variables } from '@dazbee/schema'
import type { Skipped } from '@dazbee/svg'

import { editorActions } from './actions.ts'
import { editorBrandKit } from './brand-kit.ts'
import { frameGrid, frameKey } from './canvas/grid.ts'
import { editorOverlay } from './canvas/overlay.ts'
import { frameScenes } from './canvas/scenes.ts'
import { thumbnailCache } from './canvas/thumbnails.ts'
import { editorView, type Spot } from './canvas/view.ts'
import { loadCanvasKit } from './canvaskit.ts'
import type { DrawInfo, Editor, EditorOptions, Notice } from './editor-interface.ts'
import { editorExports } from './export/exports.ts'
import { editorAutoLayoutDrag } from './gestures/auto-layout-drag.ts'
import { editorCropping } from './gestures/cropping.ts'
import { editorDrawing } from './gestures/drawing.ts'
import { editorPen } from './gestures/pen.ts'
import { editorPointer } from './gestures/pointer.ts'
import { editorSelectPress } from './gestures/select-press.ts'
import { editorTransformDrag } from './gestures/transform-drag.ts'
import { editorLayerEdits } from './layer-edits.ts'
import { editorBoxes } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { editorPlace } from './place.ts'
import { editorResources, loadFonts, loadImages, shippedFonts } from './resources.ts'
import { watchSaveState } from './save-state.ts'
import { editorSelection } from './selection.ts'
import { inField, type ShortcutAction, shortcutFor } from './shortcuts.ts'
import type { RunStyle } from './text/text-edit.ts'
import { editorTyping } from './text/typing.ts'
import { editorTools, type PlacedAsset, type Tool } from './tools.ts'

/** Keys pressed in a popover, menu or dialog, such as Escape to close it, are its own, not the stage's; undo and redo still are. */
const inDialog = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="dialog"], [role="menu"], dialog') !== null
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
  firstBytes: Parameters<typeof renderDesign>[4],
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

  // Layer 2: the state owners.
  const saving = watchSaveState({ provider, onSaveState: (state) => status(state) })
  const session: Session = openSession(doc)
  const view = editorView({ ck, canvas, session, onZoom: (zoom) => options.onZoom?.(zoom), draw })
  const { frameOf, firstPage, placeBox, outline, camera, design: drawn, frames } = view
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
  const thumbnails = thumbnailCache({
    ck,
    scenes,
    resources,
    selection,
    current: () => session.design(),
    drawn,
    frameOf,
    firstPage,
  })
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
  const drawing = editorDrawing({
    canvas,
    session,
    selection,
    tools,
    typing,
    boxes,
    camera,
    drawn,
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
  const selectPress = editorSelectPress({ canvas, view, selection, boxes, typing, transformDrag, autoLayoutDrag })
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
    scenes,
    boxes,
    typing,
    actions,
    notify,
    signal,
    drawOverlay,
  })
  const brandKit = editorBrandKit({ session, resources, view, selection, typing, signal })
  const layerEdits = editorLayerEdits({ session, view, selection, resources, typing, actions, signal })

  // Layer 5: the routers.
  const pointer = editorPointer({
    canvas,
    session,
    view,
    tools,
    selection,
    scenes,
    boxes,
    typing,
    pen,
    cropping,
    drawing,
    transformDrag,
    autoLayoutDrag,
    selectPress,
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
    const painted = view.paint((inView) => {
      const screen = resources.screen(design)
      const made = scenes.pictures(view.frames(), inView, screen)
      recorded = made.recorded
      return made.pictures
    })
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
   * Does what a shortcut names, as the actions do; undo and redo first end what is open on the
   * stage: the pen's path, a drag and typing.
   */
  function perform(action: ShortcutAction) {
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
    if (inDialog(e.target)) return
    if (!typing.editing()) {
      if (!pointer.keyDown(e) && action && perform(action)) e.preventDefault()
      return
    }
    typing.key(e)
  }
  /** Selects layers in one frame, as the page asks, ending typing first. */
  function select(ids: string[], pageId?: string, formatId?: string) {
    typing.stop()
    selection.select(
      ids.filter((id) => session.design().nodes[id]),
      view.defaultFrame(pageId, formatId).key,
    )
  }
  /** Shows one format alone, or every one with null, letting go of a selection or text no longer shown. */
  function focus(formatId: string | null) {
    view.focus(formatId)
    selection.dropOffGrid()
    const editing = typing.editing()
    if (editing && !frameOf(editing.frame)) typing.stop()
    view.fitAll()
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
  window.addEventListener('blur', pointer.blur, on)

  view.resize()
  const firstFormat = options.formatId ? frameOf(frameKey(firstPage(), options.formatId)) : undefined
  if (firstFormat) view.fitArea(firstFormat)
  else view.fitAll()
  options.onZoom?.(view.camera().zoom)
  draw()
  saving.start()

  void brandKit.refitBrandFonts()

  return {
    session,
    doc,
    design: () => session.design(),
    selected: () => selection.current()?.ids[0] ?? null,
    selection: () => [...(selection.current()?.ids ?? [])],
    selectedFrame: () => selection.current()?.frame ?? null,
    select,
    perform,
    canUndo: () => session.canUndo(),
    canRedo: () => session.canRedo(),
    onHistory: (listener: () => void) => session.onHistory(listener),
    copyLayers: () => place.copyLayers(),
    canPasteLayers: () => place.canPasteLayers(),
    pasteLayers: () => place.pasteLayers(pointer.pointerAt),
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
    pickedPage: () => selection.pickedPage(),
    pickPage: (pageId: string | null) => selection.pickPage(pageId),
    onPagePick: (listener: (pageId: string | null) => void) => selection.onPagePick(listener),
    rulers: () => view.rulers(),
    snapping: () => tools.snapping(),
    snapWork: () => transformDrag.snapWork(),
    setSnapping: (on: boolean) => tools.setSnapping(on),
    onView: view.onView,
    frames: () => frameGrid(session.design(), view.focused()).frames,
    focused: view.focused,
    focus,
    camera: view.camera,
    viewport: view.viewport,
    setCamera: view.setCamera,
    setInsets: view.setInsets,
    zoomTo: view.zoomTo,
    zoomIn: view.zoomIn,
    zoomOut: view.zoomOut,
    fitAll: view.fitAll,
    fitSelection: actions.fitSelection,
    fitFrame: (pageId: string, formatId: string) => view.fitArea(view.defaultFrame(pageId, formatId)),
    fitPage: view.fitPage,
    setTool: (next: Tool) => tools.setTool(next),
    tool: () => tools.tool(),
    armImage: (asset: PlacedAsset | null) => tools.setTool(asset ? 'image' : tools.tool(), asset),
    imageArmed: () => tools.imageToPlace() !== null,
    onTool: (listener: (tool: Tool) => void) => tools.onTool(listener),
    screenPoint: view.screenPoint,
    boxOf: (id: string, pageId?: string, formatId?: string) => boxes.drawnRect(view.defaultFrame(pageId, formatId), id),
    loaded: () => resources.loaded(),
    drawn: () => (view.scheduled() ? draws.next() : Promise.resolve()),
    onDraw: draws.on,
    exportPixels: exporting.pixels,
    exportFiles: exporting.files,
    resetOwn: layerEdits.resetOwn,
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
    fillWithImage: (id: string, asset: PlacedAsset, inFrame?: string) => place.fillWithImage(id, asset, inFrame),
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

/**
 * The listeners to one of the Editor's events: `on` adds one and returns what takes it out again,
 * `emit` tells each of them, and `next` resolves the next time they are told.
 */
function listenerSet<A extends unknown[]>() {
  const listeners = new Set<(...args: A) => void>()
  const on = (listener: (...args: A) => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const emit = (...args: A) => {
    for (const listener of listeners) listener(...args)
  }
  const next = () =>
    new Promise<void>((resolve) => {
      const off = on(() => {
        off()
        resolve()
      })
    })
  return { on, emit, next, clear: () => listeners.clear() }
}
