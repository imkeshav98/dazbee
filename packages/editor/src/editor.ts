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

/** Keys pressed in a popover or dialog, such as Escape to close it, are its own, not the stage's; undo and redo still are. */
const inDialog = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="dialog"], dialog') !== null
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
  const local = new IndexeddbPersistence(`razzlr-design-${designId}`, doc)
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

  const saving = watchSaveState({ provider, onSaveState: (state) => status(state) })

  const session: Session = openSession(doc)
  // Removes every listener the editor adds, on destroy.
  const listening = new AbortController()
  const on = { signal: listening.signal }
  const view = editorView({
    ck,
    canvas,
    session,
    onZoom: (zoom) => options.onZoom?.(zoom),
    draw: () => draw(),
  })
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
    signal: listening.signal,
  })

  const scenes = frameScenes({ ck, resources, drawn: view.design })
  /** Told when the text being edited, or its selected range, changes. */
  const textSelectionListeners = new Set<() => void>()
  const textSelectionChanged = () => {
    for (const listener of textSelectionListeners) listener()
  }
  /**
   * Told when a gesture has nothing to do because auto layout decides it, so the page can say why,
   * and when an SVG can't be read or had parts no layer shows, which come as `parts`.
   */
  const noticeListeners = new Set<(notice: Notice, parts: readonly Skipped[]) => void>()
  const notify = (notice: Notice, parts: readonly Skipped[] = []) => {
    for (const listener of noticeListeners) listener(notice, parts)
  }
  const tools = editorTools({
    finish: () => pen.finish(),
    changed: () => showCursor(),
    onSnapping: view.viewChanged,
  })
  const selection = editorSelection({
    drawn: view.design,
    frames: view.frames,
    changed: () => drawOverlay(),
  })
  /** Called after every redraw with the design it drew; the two-tab test times edits with it. */
  const drawListeners = new Set<(design: Design, at: number, info: DrawInfo) => void>()

  const { frameOf, firstPage, placeBox, outline } = view
  const hug = (ids: string[]) => hugIn(session, ids)
  const boxes = editorBoxes({ session, scenes, resources, selection, drawn: view.design, frameOf })

  const thumbnails = thumbnailCache({
    ck,
    scenes,
    resources,
    selection,
    current: () => session.design(),
    drawn: view.design,
    frameOf,
    firstPage,
  })
  const exporting = editorExports({ ck, cache, session, resources, view })
  const typing = editorTyping({
    ck,
    doc,
    session,
    resources,
    scenes,
    frameOf,
    hug,
    placeBox,
    textSelectionChanged,
    drawOverlay: () => drawOverlay(),
  })
  const pen = editorPen({
    canvas,
    session,
    selection,
    tools,
    typing,
    camera: view.camera,
    drawn: view.design,
    frameOf,
    boxes,
    hug,
    drawOverlay: () => drawOverlay(),
  })
  const cropping = editorCropping({
    canvas,
    session,
    selection,
    thumbnails,
    camera: view.camera,
    frameOf,
    boxes,
    outline,
    drawOverlay: () => drawOverlay(),
  })
  const drawing = editorDrawing({
    canvas,
    session,
    selection,
    tools,
    typing,
    boxes,
    camera: view.camera,
    drawn: view.design,
    hug,
    placeBox,
    drawOverlay: () => drawOverlay(),
  })
  const transformDrag = editorTransformDrag({
    canvas,
    session,
    scenes,
    selection,
    typing,
    boxes,
    camera: view.camera,
    frames: view.frames,
    hug,
    notify,
    placeBox,
  })
  const autoLayoutDrag = editorAutoLayoutDrag({
    session,
    boxes,
    camera: view.camera,
    hug,
    notify,
    outline,
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
    notify,
    drawOverlay: () => drawOverlay(),
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
    signal: listening.signal,
    drawOverlay: () => drawOverlay(),
  })
  const brandKit = editorBrandKit({ session, resources, view, selection, typing, signal: listening.signal })
  const layerEdits = editorLayerEdits({
    session,
    view,
    selection,
    resources,
    typing,
    actions,
    signal: listening.signal,
  })
  const selectPress = editorSelectPress({ canvas, view, selection, boxes, typing, transformDrag, autoLayoutDrag })
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
    signal: listening.signal,
    drawOverlay: () => drawOverlay(),
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
  function drawOverlay() {
    overlay.draw()
  }
  function showCursor() {
    pointer.showCursor()
  }

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
    for (const listener of drawListeners) listener(design, at, info)
  }

  doc.on('update', view.redraw)
  resources.onArrive(() => view.redraw())

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
    select(ids: string[], pageId?: string, formatId?: string) {
      typing.stop()
      selection.select(
        ids.filter((id) => session.design().nodes[id]),
        view.defaultFrame(pageId, formatId).key,
      )
    },
    perform,
    canUndo: () => session.canUndo(),
    canRedo: () => session.canRedo(),
    onHistory: (listener: () => void) => session.onHistory(listener),
    copyLayers: () => place.copyLayers(),
    canPasteLayers: () => place.canPasteLayers(),
    pasteLayers: () => place.pasteLayers(pointer.pointerAt),
    moveLayer: (id: string, parentId: string, before?: string) => layerEdits.moveLayer(id, parentId, before),
    beginGesture: () => session.beginGesture(),
    gesturing: () => pointer.gesture() !== null || session.inGesture(),
    setProps: layerEdits.setProps,
    renameLayer: layerEdits.renameLayer,
    setLocked: layerEdits.setLocked,
    setHidden: layerEdits.setHidden,
    onNotice(listener: (notice: Notice, parts: readonly Skipped[]) => void) {
      noticeListeners.add(listener)
      return () => noticeListeners.delete(listener)
    },
    selectionRect: () => overlay.selectionRect(),
    selectAt: (client: Point) => pointer.selectAt(client),
    busy: () => pointer.gesture() !== null,
    textSelection: () => typing.selectedText(),
    textSelectionStyles: () => typing.selectionStyles(),
    styleTextSelection: (style: RunStyle) => typing.styleSelectedText(style),
    onTextSelection(listener: () => void) {
      textSelectionListeners.add(listener)
      return () => textSelectionListeners.delete(listener)
    },
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
    focus(formatId: string | null) {
      view.focus(formatId)
      selection.dropOffGrid()
      const editing = typing.editing()
      if (editing && !frameOf(editing.frame)) typing.stop()
      view.fitAll()
    },
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
    drawn: () =>
      new Promise<void>((resolve) => {
        if (!view.scheduled()) return resolve()
        const listener = () => {
          drawListeners.delete(listener)
          resolve()
        }
        drawListeners.add(listener)
      }),
    onDraw(listener: (design: Design, at: number, info: DrawInfo) => void) {
      drawListeners.add(listener)
      return () => drawListeners.delete(listener)
    },
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
    stopEditing: () => {
      if (!typing.editing()) return
      typing.stop()
      drawOverlay()
    },
    settle() {
      if (!typing.editing() && !pen.drawing()) return
      typing.stop()
      pen.finish()
      drawOverlay()
    },
    destroyed: () => listening.signal.aborted,
    imageTarget: (client: Point | null) => place.imageTarget(client),
    fillWithImage: (id: string, asset: PlacedAsset, inFrame?: string) => place.fillWithImage(id, asset, inFrame),
    pageThumbnail: thumbnails.page,
    layerThumbnail: thumbnails.layer,
    synced: () => provider.synced && provider.unsyncedChanges === 0,
    destroy() {
      listening.abort()
      exporting.destroy()
      drawListeners.clear()
      selection.destroy()
      noticeListeners.clear()
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
