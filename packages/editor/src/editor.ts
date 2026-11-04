// The editor: one infinite canvas per design with every page in every format as a frame (#36),
// click to select, drag to move, typing into text, pan and zoom. It has no framework in it; the
// page only hands it a canvas and an overlay the size of the stage.
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

import type { CanvasKit } from '@dazbee/canvaskit'
import { descendants, mergedProps, openSession, readDesign, type Session } from '@dazbee/doc'
import type { ExportedFile } from '@dazbee/export'
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { renderDesign, type ResourceCache, resourceCache } from '@dazbee/renderer'
import {
  type BindingTarget,
  boundFillIndex,
  type Design,
  type ExportRequestInput,
  fontFamilies,
  formatScope,
  imageAssetIds,
  isContainer,
  LOCK_FLAGS,
  type Point,
  type Rect,
  type TextStyle,
  type VariableRef,
  type Variables,
} from '@dazbee/schema'
import type { Skipped } from '@dazbee/svg'

import { editorActions } from './actions.ts'
import { editorBrandKit } from './brand-kit.ts'
import { type Camera, type Insets, toScreen, type Viewport } from './canvas/camera.ts'
import { type Frame, frameGrid, frameKey, scope } from './canvas/grid.ts'
import { editorOverlay } from './canvas/overlay.ts'
import { frameScenes } from './canvas/scenes.ts'
import { thumbnailCache } from './canvas/thumbnails.ts'
import { editorView, type Spot } from './canvas/view.ts'
import { loadCanvasKit } from './canvaskit.ts'
import { exportClient } from './export/export-client.ts'
import { editorAutoLayoutDrag } from './gestures/auto-layout-drag.ts'
import { editorCropping } from './gestures/cropping.ts'
import { editorDrawing } from './gestures/drawing.ts'
import { editorPen } from './gestures/pen.ts'
import { editorPointer } from './gestures/pointer.ts'
import { editorTransformDrag } from './gestures/transform-drag.ts'
import { editorBoxes } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { round } from './layers/transform.ts'
import { editorPlace } from './place.ts'
import { editorResources, loadFonts, loadImages, type ResourceSources, shippedFonts } from './resources.ts'
import { runQuietly } from './run-quietly.ts'
import { watchSaveState } from './save-state.ts'
import { editorSelection } from './selection.ts'
import { inField, type ShortcutAction, shortcutFor } from './shortcuts.ts'
import { type RunStyle, type TextRange } from './text/text-edit.ts'
import { editorTyping } from './text/typing.ts'
import { editorTools, type PlacedAsset, type Tool } from './tools.ts'

export interface EditorOptions extends ResourceSources {
  canvas: HTMLCanvasElement
  /** Holds the selection outline and the caret, laid over the canvas at the same size. */
  overlay: HTMLElement
  designId: string
  syncUrl: string
  /** A sync token for the design, fetched again whenever the editor (re)connects (#34). */
  syncToken: () => Promise<string>
  /** The brand kit's values that bound properties take (#53), until `setVariables` changes them. */
  variables?: Variables
  /** The format to show first, zoomed to fit on the first page; every frame when left out. */
  formatId?: string
  /**
   * Loading steps, then once the design is open its save state (#37): Saving while the sync server
   * has not yet got every edit, Saved once it has, Offline (kept on this device) without it.
   */
  onStatus?: (status: string) => void
  /** Called with the zoom (1 is 100%) whenever it changes. */
  onZoom?: (zoom: number) => void
  /** Aborting it while the editor is still connecting stops it, freeing what it made. */
  signal?: AbortSignal
}

/** Something the page should say: why a gesture did nothing, or how placing an SVG went. */
export type Notice = 'placedByLayout' | 'flowEnd' | 'svgLeftOut' | 'svgUnreadable'

/** What one redraw did, for the checks that count a redraw's work. */
export interface DrawInfo {
  /** Time spent drawing, from reading the design to submitting the frame. */
  ms: number
  /** Frames drawn; the rest were out of view and skipped. */
  drawn: number
  frames: number
  /** Frames whose picture was recorded again because they changed. */
  recorded: number
}

/** The open editor that `startEditor` resolves to: everything it makes is freed by `destroy`. */
export interface Editor {
  session: Session
  doc: Y.Doc
  /** The design as the document holds it now, which can be ahead of the last redraw. */
  design: () => Design
  /** The first selected layer, or null. */
  selected: () => string | null
  /** Every selected layer, in the order they were picked. */
  selection: () => string[]
  /** The frame the selection is in, as `<pageId>/<formatId>`. */
  selectedFrame: () => string | null
  /** Selects layers in one frame, the first page in the primary format by default; none clears it. */
  select(ids: string[], pageId?: string, formatId?: string): void
  /** Does what a shortcut does, as if its key was pressed on the stage. */
  perform: (action: ShortcutAction) => boolean
  /** Whether this tab has a change of its own to undo, or an undone one to redo. */
  canUndo: () => boolean
  canRedo: () => boolean
  /** Calls back whenever what undo or redo would do may have changed. */
  onHistory: (listener: () => void) => () => void
  /**
   * Copies the selected layers as Mod+C does, from a menu: kept on this device for Paste, and
   * their names as plain text on the clipboard, which a Mod+V elsewhere matches to the kept copy.
   * False with nothing to copy.
   */
  copyLayers(): boolean
  /** Whether Paste in a menu has layers to place: the ones last copied in Dazbee on this device. */
  canPasteLayers: () => boolean
  /** Pastes the layers last copied in Dazbee on this device, as Mod+V does; false with none kept. */
  pasteLayers(): boolean
  /**
   * Moves a layer under a page or container, before a sibling or on top (#59), as one undo step;
   * groups it leaves and enters fit what they hold again. False when the move isn't allowed, such
   * as into itself or into a layer that can't hold it.
   */
  moveLayer(id: string, parentId: string, before?: string): boolean
  /**
   * Starts one undo step for the properties panel's scrubbing (#60): every change until the
   * returned function is called is undone together.
   */
  beginGesture: () => () => void
  /** Whether a gesture is running: a drag, resize or turn on the stage, a scrub in the panels, or text being typed. */
  gesturing: () => boolean
  /**
   * Sets properties of layers as the properties panel does (#60), as one undo step, or as part of
   * the gesture open. `to` gives a layer's patch from the values it has in the frame now (base
   * and that format's overrides); null leaves it be. In this format only (`everyFormat` false)
   * the values become overrides of the frame's format, as a drag on the stage does. In every
   * format they become the base values and the layers' overrides of those properties go, so every
   * format shows what this one does. X and Y of a group or frame carry what it holds along;
   * groups fit what they hold again. A fill, text colour or font set by hand no longer follows
   * the brand. False when a change isn't allowed, such as on a locked layer.
   */
  setProps(
    ids: string[],
    to: (id: string, now: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
    everyFormat: boolean,
    pageId?: string,
    formatId?: string,
  ): boolean
  /** Renames a layer (#59), as one undo step; false for an empty name. */
  renameLayer: (id: string, name: string) => boolean
  /** Locks layers completely, or unlocks them (#59), as one undo step. */
  setLocked: (ids: string[], locked: boolean) => boolean
  /**
   * Hides layers in one frame's format, or shows them (#59), as one undo step: like the Hide
   * shortcut, in that format only. The first page in the primary format by default.
   */
  setHidden(ids: string[], hidden: boolean, pageId?: string, formatId?: string, everyFormat?: boolean): boolean
  /** Calls back with what the editor tells the person, such as a nudge auto layout decides. */
  onNotice(listener: (notice: Notice, parts: readonly Skipped[]) => void): () => boolean
  /**
   * Where the selection is drawn on the stage, in pixels from the stage's top start corner: the
   * upright box round it, turned or not, and its size label under or over it. Null with nothing
   * selected.
   */
  selectionRect(): Rect | null
  /**
   * Picks what a right-click at `client` (client coordinates) acts on: the selection when the point
   * is on it, else the layer there, selected, locked or not. Returns the selected layers, none when
   * the point is on no layer.
   */
  selectAt(client: Point): string[]
  /** Whether a gesture is running: when the bar by the selection keeps out of the way. */
  busy: () => boolean
  /** The text layer being edited and its selected range, when one is selected; what the bar and cards then style. */
  textSelection: () => { id: string; range: TextRange } | null
  /** Each character's style in the selected range of the text being edited, or null with no range. */
  textSelectionStyles(): TextStyle[] | null
  /** Styles the selected range of the text being edited, as one undo step; false with no range. */
  styleTextSelection: (style: RunStyle) => boolean
  /** Calls back when the text being edited, or its selected range, changes. */
  onTextSelection(listener: () => void): () => boolean
  /** Calls back with the selected layers whenever the selection changes. */
  onSelection(listener: (ids: string[]) => void): () => boolean
  /** The page a click on its background picked, or null; no layer is selected while one is. */
  pickedPage: () => string | null
  /** Picks a page as a click on its background does, clearing the selection; null lets it go. */
  pickPage: (pageId: string | null) => void
  /** Calls back with the picked page, or null, whenever it changes. */
  onPagePick(listener: (pageId: string | null) => void): () => boolean
  /** Whether the rulers along the stage's edges show. */
  rulers: () => boolean
  /** Whether a drag snaps to layers and the frame. */
  snapping: () => boolean
  /**
   * Snapping's work since the editor opened, for the checks that count it: `gathered` drags
   * worked out what they can snap to, `moves` pointer moves of a drag snapped, and the last
   * drag gathered `targets` boxes, each move measured against all of them.
   */
  snapWork: () => { gathered: number; moves: number; targets: number }
  /** Turns snapping on or off for every drag. */
  setSnapping(on: boolean): void
  /** Calls back whenever the rulers or snapping turn on or off. */
  onView(listener: () => void): () => boolean
  frames: () => Frame[]
  /** The format the focus view shows alone, or null when every format shows. */
  focused: () => string | null
  /** Shows one format alone, fitted, or every format again with null. */
  focus(formatId: string | null): void
  camera: () => Camera
  viewport: () => Viewport
  setCamera: (next: Camera) => void
  /** The stage's edges floating chrome covers, in screen pixels; later fits keep clear of them. */
  setInsets(next: Insets): void
  zoomTo: (zoom: number, at?: Point) => void
  zoomIn: () => void
  zoomOut: () => void
  fitAll: () => void
  fitSelection: () => void
  fitFrame: (pageId: string, formatId: string) => void
  /** Brings one page's row into view: every format of that page, fitted. */
  fitPage(pageId: string): void
  setTool: (next: Tool) => void
  tool: () => Tool
  /**
   * Picks the image the image tool places with its next click or drag, and switches to that
   * tool; null forgets it. Another tool forgets it too.
   */
  armImage(asset: PlacedAsset | null): void
  /** Whether the image tool has an image to place. */
  imageArmed: () => boolean
  /** Calls back with the tool whenever it changes, by a key or after drawing a shape. */
  onTool(listener: (tool: Tool) => void): () => boolean
  /** Where a design pixel of one frame is on screen now, in client coordinates; the first page and the primary format by default. */
  screenPoint(x: number, y: number, pageId?: string, formatId?: string): Point
  /** A layer's box as drawn in one frame, in design pixels, auto layout solved; the first page and the primary format by default. */
  boxOf(id: string, pageId?: string, formatId?: string): Rect | null
  /**
   * Resolves once the fonts and images the design has asked for so far are here or failed to
   * come. One arriving drops every frame's picture, so the next redraw records them again.
   */
  loaded: () => Promise<undefined>
  /** Resolves once what the screen shows is up to date: after the pending redraw, if there is one. */
  drawn: () => Promise<void>
  onDraw(listener: (design: Design, at: number, info: DrawInfo) => void): () => boolean
  /** The export render of one frame as this tab holds it now, on the CPU surface, as RGBA; the first page in the primary format by default. */
  exportPixels(pageId?: string, formatId?: string): Uint8Array
  /**
   * Exports pages in formats as PNG or JPG, as this tab holds the design now, drawn in the export
   * worker so the stage stays responsive (#55). One file comes as itself, more as one zip.
   */
  exportFiles(request: ExportRequestInput, progress?: (done: number, total: number) => void): Promise<ExportedFile>
  /**
   * Gives layers back the values every format has, in one format (`scope`, `format:<id>`): the
   * properties in `paths`, or all of them. Text that grows the size of its words fits them again
   * there, in the same undo step.
   */
  resetOwn(ids: string[], scope: ReturnType<typeof formatScope>, paths?: string[]): boolean
  /** The families whose files the editor has, shipped ones included (#50). */
  loadedFamilies: () => string[]
  /**
   * Sets the font of the selected text layers, or of the selected range of the text being edited,
   * as one undo step: the family, and the weight when one is given. It waits for the family's files
   * first, so text that grows the size of its words is measured in it and fits its box in the same step.
   */
  setFont(fontFamily: string, fontWeight?: number): Promise<void>
  /** The brand kit's values bound properties take now (#53). */
  variables: () => Variables
  /**
   * Gives bound properties new values, as when the brand kit changes: bound layers redraw with them,
   * the families of brand fonts load, and exports use them. Text bound to a brand font whose family
   * changed takes the new one and refits once its files are here, a change no one undoes; the
   * promise settles then.
   */
  setVariables(variables: Variables): Promise<void>
  /**
   * Binds the selected layers to a brand colour or font, or unbinds them with null, in one undo
   * step (#53). A colour binds a text layer's colour and any other layer's fill; a font binds text
   * only. Returns how many layers changed.
   */
  bindSelection(kind: 'color' | 'font', ref: VariableRef | null): number
  /**
   * Places an image asset as a graphic filled with it (#52), in one undo step: centred on `where`,
   * a spot or a point in client coordinates, or else in the middle of the frame in the middle of
   * the view. The image's bytes load in the background. Returns the new layer's id, or null when
   * the point is on no frame.
   */
  placeImage(asset: PlacedAsset, where?: Point | Spot): string | null
  placeSvg: (text: string, name: string, where?: Point | Spot) => string | null
  /** The spot under a point on screen, in client coordinates: the frame there and the point in it. Null off every frame. */
  spotAt(client: Point): Spot | null
  /** Ends typing into a text layer, if one is being typed into, closing its undo step. */
  stopEditing: () => void
  /**
   * Ends what stays open on the stage until a key ends it, closing its undo step: typing, and a
   * pen path, which keeps the anchors placed so far, as Enter does.
   */
  settle(): void
  /** Whether the editor has been destroyed. */
  destroyed: () => boolean
  /**
   * Outlines the layer an image dragged over the stage at `client` would go into, or clears the
   * outline with null. Returns that layer's id, or null where a drop makes a new layer.
   */
  imageTarget(client: Point | null): string | null
  /**
   * Puts an image into a layer as its fill, in every format, as one undo step: in place of its
   * topmost image fill (keeping its fit, adjustments and filter, the crop reset), or on top of its
   * fills when it has none. A format with fills of its own gets the image in them too, keeping its
   * colours; a fill bound to a brand colour stays bound. The layer is selected, in `inFrame` when
   * given, as `<pageId>/<formatId>`. False when it can't take one, such as a layer whose style is
   * locked.
   */
  fillWithImage(id: string, asset: PlacedAsset, inFrame?: string): boolean
  /** A page's picture in its main format, `size` pixels on its longer side, for the Pages card. Null when it has none. */
  pageThumbnail(pageId: string, size?: number): string | null
  /**
   * A small picture of a layer for the effect tiles and the layers panel: drawn by the renderer
   * without the layer's own effects, in `frameKey` (the frame the selection is in, else the first
   * page in the primary format), and kept until the layer or what it is drawn with changes. Text
   * is "Aa" in its look, outlined with no fill when asked. A PNG object URL, or null.
   */
  layerThumbnail(id: string, size?: number, outlined?: boolean, frameKey?: string): string | null
  synced: () => boolean
  destroy(): void
}

/**
 * Whether two fill lists have the same topmost solid fill: the one a brand colour binding colours,
 * so a change that leaves it be (an image added or swapped) keeps the binding.
 */
function sameTopSolid(a: unknown, b: unknown) {
  const top = (fills: unknown) => (Array.isArray(fills) ? fills[boundFillIndex(fills)] : undefined)
  return JSON.stringify(top(a)) === JSON.stringify(top(b))
}

/** Keys pressed in a popover or dialog, such as Escape to close it, are its own, not the stage's; undo and redo still are. */
const inDialog = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="dialog"], dialog') !== null
/** Text properties that change how big its words are, so an auto-sized box fits them again. */
const SIZES_TEXT = new Set([
  'text',
  'runs',
  'style',
  'boxMode',
  'width',
  'list',
  'paragraphSpacing',
  'maxLines',
  'shrinkToFit',
  'direction',
])

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

  const thumbnails = thumbnailCache({ ck, scenes, resources, current: () => session.design(), drawn: view.design })
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

  // Exports are drawn in a worker of their own (#55), started at the first one.
  const exporter = exportClient()

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

  const defaultFrame = (pageId?: string, formatId?: string) => {
    const page = pageId ?? firstPage()
    const format = formatId ?? view.design().meta.primaryFormatId
    const found = frameOf(frameKey(page, format))
    if (!found) throw new Error(`no frame for page "${page}" in format "${format}"`)
    return found
  }

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
        defaultFrame(pageId, formatId).key,
      )
    },
    perform,
    canUndo: () => session.canUndo(),
    canRedo: () => session.canRedo(),
    onHistory: (listener: () => void) => session.onHistory(listener),
    copyLayers: () => place.copyLayers(),
    canPasteLayers: () => place.canPasteLayers(),
    pasteLayers: () => place.pasteLayers(pointer.pointerAt),
    moveLayer(id: string, parentId: string, before?: string) {
      const from = session.design().nodes[id]?.parentId
      return runQuietly(() =>
        session.gesture(() => {
          session.run('node.move', { id, parentId, ...(before ? { before } : {}) })
          hug([id, ...(from && session.design().nodes[from] ? [from] : [])])
        }),
      )
    },
    beginGesture: () => session.beginGesture(),
    gesturing: () => pointer.gesture() !== null || session.inGesture(),
    setProps(
      ids: string[],
      to: (id: string, now: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
      everyFormat: boolean,
      pageId?: string,
      formatId?: string,
    ) {
      const frame = defaultFrame(pageId, formatId)
      const here = scope(frame)
      return runQuietly(() =>
        session.gesture(() => {
          const now = session.design()
          const placedProps = (id: string) => mergedProps(now, here, id)
          const writes = new Map<string, Record<string, unknown>>()
          for (const id of ids) {
            const node = now.nodes[id]
            if (!node) continue
            const at = placedProps(id)
            // Values a change leaves as they are aren't written, so they make no undo step.
            const asked = to(id, at)
            const patch =
              asked &&
              Object.fromEntries(
                Object.entries(asked).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(at[key])),
              )
            if (!patch || Object.keys(patch).length === 0) continue
            writes.set(id, { ...writes.get(id), ...patch })
            if (!isContainer(node.type) || !('x' in patch || 'y' in patch)) continue
            const dx = 'x' in patch ? Number(patch.x) - Number(at.x) : 0
            const dy = 'y' in patch ? Number(patch.y) - Number(at.y) : 0
            for (const inner of descendants(now, id)) {
              if (ids.includes(inner)) continue
              const was = placedProps(inner)
              writes.set(inner, { ...writes.get(inner), x: round(Number(was.x) + dx), y: round(Number(was.y) + dy) })
            }
          }
          for (const [id, patch] of writes) {
            const node = session.design().nodes[id]
            const at = placedProps(id)
            const style = patch.style as { color?: string; fontFamily?: string } | undefined
            const was = at.style as { color?: string; fontFamily?: string } | undefined
            const unbind: BindingTarget[] = [
              ...(node?.bindings?.fill && 'fills' in patch && !sameTopSolid(patch.fills, at.fills)
                ? ['fill' as const]
                : []),
              ...(node?.bindings?.textColor && style && style.color !== was?.color ? ['textColor' as const] : []),
              ...(node?.bindings?.fontFamily && style && style.fontFamily !== was?.fontFamily
                ? ['fontFamily' as const]
                : []),
            ]
            for (const target of unbind) session.run('node.bind', { ids: [id], target, ref: null })
            if (!everyFormat) {
              session.run('node.update', { ids: [id], scope: here, patch })
              continue
            }
            session.run('node.update', { ids: [id], scope: 'base', patch })
            for (const [other, byNode] of Object.entries(session.design().overrides)) {
              const paths = Object.keys(patch).filter((path) => byNode[id] && path in byNode[id])
              if (paths.length > 0) session.run('override.reset', { ids: [id], scope: other, paths })
            }
          }
          // Text that grows the size of its words fits them again, in the formats the change reached.
          for (const [id, patch] of writes) {
            if (Object.keys(patch).some((key) => SIZES_TEXT.has(key)))
              typing.fitText(id, everyFormat ? undefined : frame.formatId)
          }
          hug([...writes.keys()])
        }),
      )
    },
    renameLayer: (id: string, name: string) => runQuietly(() => session.run('node.rename', { id, name })),
    setLocked: (ids: string[], locked: boolean) =>
      runQuietly(() =>
        session.run('node.lock', { ids, lock: Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, locked])) }),
      ),
    setHidden(ids: string[], hidden: boolean, pageId?: string, formatId?: string, everyFormat = false) {
      if (everyFormat) return actions.hideInEveryFormat(ids, hidden)
      const frame = defaultFrame(pageId, formatId)
      return runQuietly(() => session.run('node.update', { ids, scope: scope(frame), patch: { visible: !hidden } }))
    },
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
    fitFrame: (pageId: string, formatId: string) => view.fitArea(defaultFrame(pageId, formatId)),
    fitPage: view.fitPage,
    setTool: (next: Tool) => tools.setTool(next),
    tool: () => tools.tool(),
    armImage: (asset: PlacedAsset | null) => tools.setTool(asset ? 'image' : tools.tool(), asset),
    imageArmed: () => tools.imageToPlace() !== null,
    onTool: (listener: (tool: Tool) => void) => tools.onTool(listener),
    screenPoint(x: number, y: number, pageId?: string, formatId?: string): Point {
      const frame = defaultFrame(pageId, formatId)
      const at = toScreen(view.camera(), { x: frame.x + x, y: frame.y + y })
      const rect = canvas.getBoundingClientRect()
      return { x: rect.left + at.x, y: rect.top + at.y }
    },
    boxOf(id: string, pageId?: string, formatId?: string) {
      const box = boxes.drawnBoxOf(defaultFrame(pageId, formatId), id)
      return box && { x: box.x, y: box.y, width: box.width, height: box.height }
    },
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
    exportPixels(pageId?: string, formatId?: string) {
      const frame = defaultFrame(pageId, formatId)
      return renderDesign(ck, session.design(), frame.pageId, frame.formatId, resources.bytes(), cache).pixels
    },
    async exportFiles(request: ExportRequestInput, progress?: (done: number, total: number) => void) {
      // A family picked or an image placed a moment ago is drawn as itself, never the fallback or a gap.
      resources.screen(session.design())
      await resources.loaded()
      return exporter.run(session.design(), request, resources.bytes(), progress)
    },
    resetOwn(ids: string[], scope: ReturnType<typeof formatScope>, paths?: string[]) {
      return runQuietly(() =>
        session.gesture(() => {
          session.run('override.reset', { ids, scope, ...(paths ? { paths } : {}) })
          for (const id of ids) typing.fitText(id, scope.slice('format:'.length))
        }),
      )
    },
    loadedFamilies: () => resources.families(),
    async setFont(fontFamily: string, fontWeight?: number) {
      const ids = (selection.current()?.ids ?? []).filter((id) => session.design().nodes[id]?.type === 'text')
      const range = typing.selectedText()
      if (ids.length === 0 && !range) return
      await resources.loadFamilies([fontFamily])[0]
      if (listening.signal.aborted) return
      if (range) {
        const node = session.design().nodes[range.id]
        if (node?.type === 'text' && range.range.end <= node.props.text.length)
          typing.styleRange(range, { fontFamily, ...(fontWeight === undefined ? {} : { fontWeight }) })
        return
      }
      const current = session.design()
      session.gesture(() => {
        for (const id of ids) {
          const node = current.nodes[id]
          if (node?.type !== 'text') continue
          // A font picked by hand no longer follows the brand's (#53).
          if (node.bindings?.fontFamily)
            runQuietly(() => session.run('node.bind', { ids: [id], target: 'fontFamily', ref: null }))
          const style = { ...node.props.style, fontFamily, ...(fontWeight === undefined ? {} : { fontWeight }) }
          runQuietly(() => session.run('node.update', { ids: [id], patch: { style } }))
          typing.fitText(id)
        }
      })
    },
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
    pageThumbnail(pageId: string, size = 72): string | null {
      const frame = frameOf(frameKey(pageId, view.design().meta.primaryFormatId))
      return frame ? thumbnails.page(frame, size) : null
    },
    layerThumbnail(id: string, size = 96, outlined = false, inFrame?: string): string | null {
      const frame =
        frameOf(inFrame ?? selection.current()?.frame) ??
        frameOf(frameKey(firstPage(), view.design().meta.primaryFormatId))
      return frame ? thumbnails.layer(frame, id, size, outlined) : null
    },
    synced: () => provider.synced && provider.unsyncedChanges === 0,
    destroy() {
      listening.abort()
      exporter.destroy()
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
