// The editor: one infinite canvas per design with every page in every format as a frame (#36),
// click to select, drag to move, typing into text, pan and zoom. It has no framework in it; the
// page only hands it a canvas and an overlay the size of the stage.
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

import type { CanvasKit, GrDirectContext, Surface } from '@dazbee/canvaskit'
import { ancestorsOf, childrenOf, descendants, mergedProps, openSession, readDesign, type Session } from '@dazbee/doc'
import type { ExportedFile } from '@dazbee/export'
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { renderDesign, type ResourceCache, resourceCache, scaleText } from '@dazbee/renderer'
import {
  type BindingTarget,
  boundFillIndex,
  canBind,
  canHold,
  type Design,
  type ExportRequestInput,
  fontFamilies,
  formatScope,
  imageAssetIds,
  isContainer,
  type Layer,
  LayerClipboard,
  type LayerTree,
  LOCK_FLAGS,
  type Paint,
  type Point,
  type Rect,
  SCHEMA_VERSION,
  type TextStyle,
  type VariableRef,
  type Variables,
} from '@dazbee/schema'
import { type Skipped, SVG_TYPE, SvgError, svgMarkup, svgToLayers } from '@dazbee/svg'

import {
  type Camera,
  fit,
  framesInView,
  type Insets,
  NO_INSETS,
  toScreen,
  toWorld,
  type Viewport,
  zoomAt,
} from './canvas/camera.ts'
import { resizeCursor, ROTATE_CURSOR } from './canvas/cursors.ts'
import { type Frame, frameAt, frameGrid, frameKey, scope } from './canvas/grid.ts'
import { hitTest } from './canvas/hit-test.ts'
import { px, rulerParts } from './canvas/rulers.ts'
import { frameScenes } from './canvas/scenes.ts'
import { thumbnailCache } from './canvas/thumbnails.ts'
import { loadCanvasKit } from './canvaskit.ts'
import { keepCopy, layersOnClipboard, putOnClipboard, rememberedLayers } from './clipboard.ts'
import { exportClient } from './export/export-client.ts'
import { editorAutoLayoutDrag, type ReorderDrag } from './gestures/auto-layout-drag.ts'
import { type CropDrag, editorCropping } from './gestures/cropping.ts'
import { isDrawTool, newImage, withImage } from './gestures/draw-tools.ts'
import { editorDrawing, type ImageBoxDrag, type ShapeDrag, type TextBoxDrag } from './gestures/drawing.ts'
import { editorPen, type PathDrag } from './gestures/pen.ts'
import { CLICK_SLOP, HANDLE_SIZE } from './gestures/press.ts'
import {
  editorTransformDrag,
  type MarqueeDrag,
  type MoveDrag,
  type ResizeDrag,
  type RotateDrag,
} from './gestures/transform-drag.ts'
import { align, type Alignment, distribute, type Distribution, type Offset } from './layers/arrange.ts'
import { inFlow } from './layers/auto-layout.ts'
import { editorBoxes, visibleIn } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { boundsOf, type Box, cornersOf, handleAt, localTo, round } from './layers/transform.ts'
import {
  editorResources,
  loadFonts,
  loadImages,
  type ResourceSources,
  SHIPPED_FAMILIES,
  shippedFonts,
} from './resources.ts'
import { runQuietly } from './run-quietly.ts'
import { watchSaveState } from './save-state.ts'
import { editorSelection, isPath, type Picked } from './selection.ts'
import { NUDGE, NUDGE_FAR, type ShortcutAction, shortcutFor } from './shortcuts.ts'
import { paragraphAt, type RunStyle, type TextRange, wordAt } from './text/text-edit.ts'
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

/** A point on the design: a frame, as `<pageId>/<formatId>`, and a point in it in design pixels. */
export interface Spot {
  frame: string
  x: number
  y: number
}

/** The share of a frame's shorter side a placed SVG may take before it is scaled down to it. */
const SVG_ROOM = 0.6

/** Screen pixels a frame needs before it gets a label. */
const MIN_LABEL_WIDTH = 56
/** How far a label stays from the stage's start edge when its frame runs past it. */
const LABEL_INSET = 8
/** Room the tool dock takes along the bottom of the stage, which the size label stays out of. */
const SIZE_CLEARANCE = 72
/** The room the selection's size label takes, in screen pixels. */
const SIZE_LABEL_HEIGHT = 20

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

const ZOOM_STEP = 2
/** Room around the frames when the focus view fits them, past the chip over the stage. */
const FOCUS_PADDING = 104

/**
 * Whether two fill lists have the same topmost solid fill: the one a brand colour binding colours,
 * so a change that leaves it be (an image added or swapped) keeps the binding.
 */
function sameTopSolid(a: unknown, b: unknown) {
  const top = (fills: unknown) => (Array.isArray(fills) ? fills[boundFillIndex(fills)] : undefined)
  return JSON.stringify(top(a)) === JSON.stringify(top(b))
}

/** The page a layer is on. */
function pageOf(design: Design, id: string) {
  let up = id
  while (design.nodes[up]) up = design.nodes[up]?.parentId ?? ''
  return up
}

/** Keys typed into the page's own fields belong to them. */
const inField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
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
  const { canvas, overlay } = options
  const status = options.onStatus ?? (() => {})

  const saving = watchSaveState({ provider, onSaveState: (state) => status(state) })

  const maybeGl = ck.MakeWebGLContext(ck.GetWebGLContext(canvas))
  if (!maybeGl) throw new Error('this browser has no WebGL')
  const gl: GrDirectContext = maybeGl
  let surface: Surface | null = null
  let dpr = 1
  let viewport: Viewport = { width: 1, height: 1 }
  // The stage's edges that floating chrome covers; fitting centres in what is left (#83).
  let insets = NO_INSETS
  const session: Session = openSession(doc)
  // Removes every listener the editor adds, on destroy.
  const listening = new AbortController()
  const on = { signal: listening.signal }
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

  let design: Design = session.design()
  /** The one format the focus view shows, or null for every format. */
  let focused: string | null = null
  let grid = frameGrid(design, focused)
  let camera: Camera = { x: 0, y: 0, zoom: 1 }
  const scenes = frameScenes({ ck, resources, drawn: () => design })
  /** The rulers are off until asked for (Shift+R or the View card): the stage is for the ads. */
  let rulers = false
  /** Told when the rulers or snapping turn on or off, so the View card follows a shortcut too. */
  const viewListeners = new Set<() => void>()
  const viewChanged = () => {
    for (const listener of viewListeners) listener()
  }
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
    onSnapping: viewChanged,
  })
  const selection = editorSelection({
    drawn: () => design,
    frames: () => grid.frames,
    changed: () => drawOverlay(),
  })
  /** Called after every redraw with the design it drew; the two-tab test times edits with it. */
  const drawListeners = new Set<(design: Design, at: number, info: DrawInfo) => void>()

  const frameOf = (key: string | undefined) => grid.frames.find((f) => f.key === key)
  const firstPage = () => grid.frames[0]?.pageId ?? ''
  const hug = (ids: string[]) => hugIn(session, ids)
  const boxes = editorBoxes({ session, scenes, resources, selection, drawn: () => design, frameOf })

  /**
   * The locked in place layer a press at `p` lands on, the one a click would select: the topmost
   * layer there, as a click picks it, when that one is locked. A click selects it, so its lock can
   * be undone; a drag from it draws a marquee and moves nothing, it or what lies beneath.
   */
  function lockedAt(frame: Frame, p: Point): string | null {
    const top = hitTest(scenes.scene(frame).layers, p)
    const id = top ? target(top.id, frame.key) : null
    return id && design.nodes[id]?.lock?.move ? id : null
  }
  /**
   * What a press on a layer picks: a selected layer it is in, so the selection moves whole; inside
   * the group or frame double-clicked into, what is directly in it; or else the layer on the page
   * that holds it, so a click on a group's child picks the group.
   */
  function target(hitId: string, frame: string) {
    const chain = ancestorsOf(design, hitId)
    const current = selection.current()
    const selected = current?.frame === frame ? chain.find((id) => current?.ids.includes(id)) : undefined
    const entered = selection.entered()
    const at = entered ? chain.indexOf(entered) : -1
    return selected ?? (at > 0 ? chain[at - 1] : chain.at(-1)) ?? hitId
  }
  /** Whether a layer is inside the entered group or frame, not the container itself. */
  function insideEntered(id: string) {
    return ancestorsOf(design, design.nodes[id]?.parentId ?? '').some((up) => up === selection.entered())
  }

  const thumbnails = thumbnailCache({ ck, scenes, resources, current: () => session.design(), drawn: () => design })
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
    camera: () => camera,
    drawn: () => design,
    frameOf,
    containersOf: boxes.containersOf,
    pathIn: boxes.pathIn,
    parentFor: boxes.parentFor,
    hug,
    drawOverlay: () => drawOverlay(),
  })
  const cropping = editorCropping({
    canvas,
    session,
    selection,
    thumbnails,
    camera: () => camera,
    frameOf,
    cropTarget: boxes.cropTarget,
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
    camera: () => camera,
    drawn: () => design,
    hug,
    placeBox,
  })
  const transformDrag = editorTransformDrag({
    canvas,
    session,
    scenes,
    selection,
    typing,
    boxes,
    camera: () => camera,
    frames: () => grid.frames,
    hug,
    notify,
    placeBox,
  })
  const autoLayoutDrag = editorAutoLayoutDrag({
    session,
    boxes,
    transformDrag,
    camera: () => camera,
    hug,
    notify,
    outline,
  })

  /** A design-pixel box in a frame, as CSS on the overlay. */
  function placeBox(el: HTMLElement, frame: Frame, box: Rect) {
    const at = toScreen(camera, { x: frame.x + box.x, y: frame.y + box.y })
    Object.assign(el.style, {
      left: px(at.x),
      top: px(at.y),
      width: px(box.width * camera.zoom),
      height: px(box.height * camera.zoom),
    })
  }

  function frameLabel(frame: Frame, drawnFrames: Frame[]) {
    const format = design.formats[frame.formatId]
    const page = design.pages[frame.pageId]
    if (!format || !page) return null
    const label = document.createElement('div')
    label.className = 'frame-label'
    label.dataset.frame = frame.key
    if (
      selection.current()?.frame === frame.key ||
      typing.editing()?.frame === frame.key ||
      selection.pickedPage() === frame.pageId
    )
      label.dataset.active = ''
    const at = toScreen(camera, frame)
    // A frame running off the stage's start keeps its label in view, along the part still showing.
    const left = Math.max(at.x, LABEL_INSET)
    const width = at.x + frame.width * camera.zoom - left
    // Too narrow to read even a cut name: zoomed far out, the frames speak for themselves.
    if (width < MIN_LABEL_WIDTH) return null
    Object.assign(label.style, { left: px(left), top: px(at.y), width: px(width) })
    const name = document.createElement('span')
    name.className = 'frame-name'
    const pages = new Set(drawnFrames.map((f) => f.pageId)).size > 1 || Object.keys(design.pages).length > 1
    name.textContent = pages ? `${page.name} · ${format.name}` : format.name
    label.append(name)
    if (width >= 120) {
      const size = document.createElement('span')
      size.className = 'frame-size'
      size.textContent = `${format.width} × ${format.height}`
      label.append(size)
    }
    return label
  }

  /** Where the size label's top goes for a box spanning `ys` on screen: under it, or over it when the tool dock along the stage's bottom would cover it. */
  function sizeLabelTop(ys: number[]) {
    const below = Math.max(...ys) + 8
    return below + 24 > viewport.height - SIZE_CLEARANCE ? Math.min(...ys) - 26 : below
  }
  /** A box on the overlay, turned as the layer is. */
  function outline(className: string, frame: Frame, box: Box) {
    const el = document.createElement('div')
    el.className = className
    placeBox(el, frame, box)
    if (box.rotation) el.style.transform = `rotate(${box.rotation}deg)`
    return el
  }

  /** Each selected layer's outline, then the box with its handles and the size under it. */
  function selectionParts() {
    const outer = boxes.selectionBox()
    const current = selection.current()
    if (!outer || !current) return []
    const { frame, drawn: box } = outer
    const parts: HTMLElement[] = []
    const several = current.ids.length > 1
    if (several) {
      for (const id of current.ids) {
        const b = boxes.drawnBoxOf(frame, id, design)
        if (!b) continue
        const member = outline('selection-member', frame, b)
        member.dataset.layer = id
        parts.push(member)
      }
    }
    const el = outline('selection', frame, box)
    el.dataset.frame = frame.key
    el.dataset.count = String(current.ids.length)
    if (!several) el.dataset.layer = current.ids[0]
    // Handles only once the box is big enough on screen to grab them apart, and not on a locked one.
    if (!typing.editing() && Math.min(box.width, box.height) * camera.zoom >= 2 * HANDLE_SIZE) {
      for (const h of boxes.handlesFor()) {
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.dataset.handle = h
        const at = handleAt(h)
        Object.assign(handle.style, { left: `${at.x * 100}%`, top: `${at.y * 100}%` })
        el.append(handle)
      }
    }
    parts.push(el)
    if (!typing.editing()) {
      const corners = cornersOf(box).map((p) => toScreen(camera, { x: frame.x + p.x, y: frame.y + p.y }))
      const size = document.createElement('div')
      size.className = 'selection-size'
      size.textContent = `${round(box.width, 0)} × ${round(box.height, 0)}`
      // A corner scaling one text says its size too, from where it was.
      const g = gesture?.kind === 'resize' ? gesture : null
      const text = g && !several ? g.texts.get(current.ids[0] ?? '') : undefined
      if (g && text) size.textContent += ` · ${text.style.fontSize} → ${scaleText(text, g.factor).style.fontSize}`
      const top = sizeLabelTop(corners.map((c) => c.y))
      Object.assign(size.style, {
        left: px((Math.min(...corners.map((c) => c.x)) + Math.max(...corners.map((c) => c.x))) / 2),
        top: px(top),
      })
      parts.push(size)
    }
    return parts
  }

  let drawnFrames: Frame[] = []
  function drawOverlay() {
    // A layer selected, or the page's frames gone (a page deleted, a size shown alone), lets the page go.
    const pageGone = selection.dropGonePage()
    const parts: Element[] = []
    for (const frame of drawnFrames) {
      const label = frameLabel(frame, drawnFrames)
      if (label) parts.push(label)
    }
    for (const frame of drawnFrames) {
      if (frame.pageId === selection.pickedPage())
        parts.push(outline('page-picked', frame, { x: 0, y: 0, width: frame.width, height: frame.height, rotation: 0 }))
    }
    const entered = selection.entered()
    const enteredFrame = entered && frameOf(selection.current()?.frame)
    const enteredBox = enteredFrame && entered && boxes.drawnBoxOf(enteredFrame, entered, design)
    if (enteredFrame && enteredBox) parts.push(outline('entered', enteredFrame, enteredBox))
    const hovered = selection.hovered()
    const hover = !gesture && hovered && !selection.current()?.ids.includes(hovered.id) ? hovered : null
    const hoverFrame = hover && frameOf(hover.frame)
    const hoverBox = hoverFrame && hover && boxes.drawnBoxOf(hoverFrame, hover.id, design)
    if (hoverFrame && hoverBox) parts.push(outline('hover', hoverFrame, hoverBox))
    // The layer an image dragged over the stage would go into.
    const dropFrame = dropTarget && frameOf(dropTarget.frame)
    const dropBox = dropFrame && dropTarget && boxes.drawnBoxOf(dropFrame, dropTarget.id, design)
    if (dropFrame && dropBox) parts.push(outline('drop-target', dropFrame, dropBox))
    parts.push(
      ...(selection.pathEditing() || selection.cropping() ? [] : selectionParts()),
      ...pen.parts(),
      ...cropping.parts(),
      ...autoLayoutDrag.parts(gesture?.kind === 'reorder' ? gesture : null),
    )
    if (gesture?.kind === 'textBox' || gesture?.kind === 'imageBox') parts.push(...drawing.parts(gesture))
    parts.push(...transformDrag.parts(gesture?.kind === 'marquee' ? gesture : null))
    if (rulers) {
      const origin = frameOf(selection.current()?.frame) ?? frameOf(selection.hovered()?.frame) ?? drawnFrames[0]
      const outer = boxes.selectionBox()
      if (origin)
        parts.push(
          ...rulerParts(
            camera,
            viewport,
            origin,
            outer && outer.frame.key === origin.key ? boundsOf([outer.drawn]) : null,
          ),
        )
    }
    parts.push(...typing.parts())
    overlay.replaceChildren(...parts)
    selection.tellListeners(pageGone)
  }

  const backing = new ck.Paint()
  backing.setColor(ck.WHITE)
  const edge = new ck.Paint()
  edge.setStyle(ck.PaintStyle.Stroke)
  // Width 0 is a hairline: one device pixel at any zoom.
  edge.setStrokeWidth(0)
  edge.setColor(ck.Color(0, 0, 0, 0.12))

  function draw() {
    const started = performance.now()
    design = session.design()
    if (focused && !design.formats[focused]) focused = null
    grid = frameGrid(design, focused)
    selection.keep()
    typing.stopWhenGone()
    if (!surface) return

    const screen = resources.screen(design)
    drawnFrames = framesInView(grid.frames, camera, viewport)
    const { pictures, recorded } = scenes.pictures(grid.frames, drawnFrames, screen)
    const c = surface.getCanvas()
    c.clear(ck.TRANSPARENT)
    c.save()
    c.scale(dpr, dpr)
    c.translate(camera.x, camera.y)
    c.scale(camera.zoom, camera.zoom)
    for (const { frame, picture } of pictures) {
      const box = ck.XYWHRect(frame.x, frame.y, frame.width, frame.height)
      c.drawRect(box, backing)
      c.save()
      c.translate(frame.x, frame.y)
      c.drawPicture(picture)
      c.restore()
      c.drawRect(box, edge)
    }
    c.restore()
    surface.flush()
    rehover()
    drawOverlay()
    const info = { ms: performance.now() - started, drawn: drawnFrames.length, frames: grid.frames.length, recorded }
    const at = performance.timeOrigin + performance.now()
    for (const listener of drawListeners) listener(design, at, info)
  }

  // Exports are drawn in a worker of their own (#55), started at the first one.
  const exporter = exportClient()

  let pending = 0
  const redraw = () => {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0
        draw()
      })
  }
  doc.on('update', redraw)
  resources.onArrive(() => redraw())

  function setCamera(next: Camera) {
    const zoomed = next.zoom !== camera.zoom
    camera = next
    if (zoomed) options.onZoom?.(camera.zoom)
    redraw()
  }

  // The canvas fills the stage; its backing store matches the screen's pixels.
  function resize() {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    viewport = { width, height }
    if (surface && canvas.width === pixelWidth && canvas.height === pixelHeight) return
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    surface?.delete()
    surface = ck.MakeOnScreenGLSurface(gl, pixelWidth, pixelHeight, ck.ColorSpace.SRGB)
    if (!surface) throw new Error('could not make the WebGL surface')
    redraw()
  }
  const resized = new ResizeObserver(() => resize())
  resized.observe(canvas)

  const centre = (): Point => ({ x: viewport.width / 2, y: viewport.height / 2 })
  function fitAll() {
    // The focus view's chip sits over the stage's top edge: leave it room above the frame's label.
    setCamera(fit(grid.bounds, viewport, focused ? FOCUS_PADDING : undefined, insets))
  }
  function fitFrame(frame: Frame | undefined) {
    if (frame) setCamera(fit(frame, viewport, undefined, insets))
  }
  function fitSelection() {
    const outer = boxes.selectionBox()
    if (!outer) return fitAll()
    const { frame, box } = outer
    const b = boundsOf([box])
    setCamera(
      fit({ x: frame.x + b.x, y: frame.y + b.y, width: b.width, height: b.height }, viewport, undefined, insets),
    )
  }
  const zoomTo = (zoom: number, at: Point = centre()) => setCamera(zoomAt(camera, at, zoom))
  const zoomIn = () => zoomTo(camera.zoom * ZOOM_STEP)
  const zoomOut = () => zoomTo(camera.zoom / ZOOM_STEP)

  // Pointer: screen points are CSS pixels from the canvas's corner.
  /** A point in client coordinates as a point on the stage. */
  const onStage = (client: Point): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: client.x - rect.left, y: client.y - rect.top }
  }
  const screenOf = (e: MouseEvent): Point => onStage({ x: e.clientX, y: e.clientY })
  /** The frame under a point on screen, in client coordinates, and the point in its page's design pixels. */
  function pointAt(client: Point) {
    const world = toWorld(camera, onStage(client))
    const frame = frameAt(grid.frames, world)
    return frame ? { frame, p: { x: world.x - frame.x, y: world.y - frame.y } } : null
  }
  /** Where something placed with no point goes: the frame in the middle of the view, else the selection's or the first. */
  function middleFrame() {
    return frameAt(grid.frames, toWorld(camera, centre())) ?? frameOf(selection.current()?.frame) ?? grid.frames[0]
  }
  /** The spot under a point on screen, in client coordinates: the frame there and the point in it. */
  function spotAt(client: Point): Spot | null {
    const at = pointAt(client)
    return at ? { frame: at.frame.key, x: at.p.x, y: at.p.y } : null
  }
  /** The frame under the pointer and the point in its page's design pixels. */
  function pointIn(e: MouseEvent) {
    return pointAt({ x: e.clientX, y: e.clientY })
  }

  /** What a drag on the stage is doing, from pointer down to up. */
  type Gesture =
    | MoveDrag
    | ResizeDrag
    | ReorderDrag
    | RotateDrag
    | MarqueeDrag
    | { kind: 'textSelect'; frame: Frame; around: Box[] }
    | TextBoxDrag
    | ImageBoxDrag
    | CropDrag
    | ShapeDrag
    | PathDrag
  let gesture: Gesture | null = null
  /**
   * What a click selects alone when the pointer doesn't move first: one of several selected
   * layers, or a layer pressed inside the selection's box, which a drag moves instead; '' for a
   * press there on nothing, which a click deselects.
   */
  let clickedAlone: string | null = null
  /** The locked layer under a press that started a marquee: a click, with no drag, selects it. */
  let lockedClick: { id: string; frame: string } | null = null
  /** Where a press that may still be a click went down, on screen: it drags only once it has gone CLICK_SLOP from there. */
  let pressedAt: Point | null = null
  let pan: { from: Point; camera: Camera } | null = null
  let spaceHeld = false
  const panning = () => tools.tool() === 'hand' || spaceHeld

  let hoverCursor = ''
  const showCursor = () => {
    const tool = tools.tool()
    const drawing = isDrawTool(tool) || tool === 'pen' || (tool === 'image' && tools.imageToPlace())
    canvas.style.cursor = pan
      ? 'grabbing'
      : panning()
        ? 'grab'
        : drawing
          ? 'crosshair'
          : tool === 'text'
            ? 'text'
            : hoverCursor
  }
  function cursorFor(screen: Point) {
    if (gesture?.kind === 'resize' || gesture?.kind === 'rotate') return
    if (selection.cropping()) {
      // Cropping, the image moves under the pointer; the box's handles are gone (#48).
      hoverCursor = 'move'
      showCursor()
      return
    }
    const under = transformDrag.handleUnder(screen)
    const rotation = boxes.selectionBox()?.drawn.rotation ?? 0
    hoverCursor = !under ? '' : under.kind === 'rotate' ? ROTATE_CURSOR : resizeCursor(under.handle, rotation)
    showCursor()
  }

  /** Whether a press on the stage is held, from its pointerdown until it ends. */
  let pressing = false
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      pressing = true
      // Middle button, space or the hand tool pan; nothing else does.
      if (e.button === 1 || (e.button === 0 && panning())) {
        e.preventDefault()
        canvas.setPointerCapture(e.pointerId)
        pan = { from: { x: e.clientX, y: e.clientY }, camera }
        showCursor()
        return
      }
      if (e.button !== 0) return
      const screen = screenOf(e)
      const at = pointIn(e)
      const tool = tools.tool()
      if (isDrawTool(tool)) {
        const drag = at && drawing.pressShape(e, tool, at)
        if (drag) gesture = drag
        return
      }
      if (tool === 'image') {
        const imageToPlace = tools.imageToPlace()
        if (at && imageToPlace) gesture = drawing.pressImage(e, at, imageToPlace)
        return
      }
      if (tool === 'pen') {
        if (at) pen.down(e, at)
        return
      }
      if (tool === 'text') {
        if (at) gesture = drawing.pressText(e, at)
        return
      }
      if (selection.pathEditing()) {
        const drag = pen.pressPoints(e, at)
        if (drag) {
          gesture = drag
          drawOverlay()
          return
        }
      }
      if (selection.cropping()) {
        const drag = cropping.press(e, screen)
        if (drag) {
          gesture = drag
          return
        }
      }
      const deepest = at && hitTest(scenes.scene(at.frame).layers, at.p, boxes.pickable)
      const editing = typing.editing()
      if (at && editing && deepest?.id === editing.id && editing.frame === at.frame.key) {
        // In the text being edited (#47): a press puts the caret there, Shift extends the range to
        // it, a drag selects, and a third click selects the paragraph.
        const offset = typing.caretFromPoint(at.p)
        const node = session.design().nodes[editing.id]
        if (e.detail >= 3 && node?.type === 'text') {
          typing.selectText(paragraphAt(node.props.text, offset))
        } else {
          typing.caretTo(offset, e.shiftKey)
          if (e.detail <= 1) {
            canvas.setPointerCapture(e.pointerId)
            gesture = { kind: 'textSelect', frame: at.frame, around: [] }
          }
        }
        drawOverlay()
        return
      }
      typing.stop()
      clickedAlone = null
      pressedAt = screen
      const grabbed = transformDrag.handleUnder(screen)
      const outer = boxes.selectionBox()
      if (grabbed && outer && selection.current()) {
        gesture = transformDrag.pressHandle(e, screen, grabbed, outer)
        drawOverlay()
        return
      }
      const inSelection = (id: string) =>
        selection.current()?.frame === at?.frame.key && selection.current()?.ids.includes(id)
      const locked = at && !e.shiftKey ? lockedAt(at.frame, at.p) : null
      // Inside the selection's box, a press moves the selection, gaps and layers over it included:
      // a mask, which isn't drawn, or a layer under others, is dragged where it is.
      const inner = at && outer && localTo(at.p, outer.around)
      // A selection that can't move leaves the press to what is under it.
      const current = selection.current()
      const movable = current && !boxes.lockedSelection()
      const inOuter =
        inner &&
        outer &&
        current &&
        movable &&
        current.ids.length > 0 &&
        outer.frame.key === at.frame.key &&
        inner.x >= outer.box.x &&
        inner.x <= outer.box.x + outer.box.width &&
        inner.y >= outer.box.y &&
        inner.y <= outer.box.y + outer.box.height
      // A press outside the group or frame double-clicked into leaves it.
      if (
        selection.entered() &&
        !inOuter &&
        !(deepest && insideEntered(deepest.id)) &&
        !(locked && insideEntered(locked))
      )
        selection.enter(null)
      const hit = at && deepest && !(locked && !inOuter) ? { id: target(deepest.id, at.frame.key) } : null
      if (at && hit) {
        if (e.shiftKey) {
          // Shift adds a layer to the selection, or takes it out again.
          if (inSelection(hit.id) && current) {
            selection.select(
              current.ids.filter((id) => id !== hit.id),
              current.frame,
            )
            return
          }
          selection.select(current?.frame === at.frame.key ? [...current.ids, hit.id] : [hit.id], at.frame.key)
        } else if (inSelection(hit.id)) {
          if ((selection.current()?.ids.length ?? 0) > 1) clickedAlone = hit.id
        } else if (inOuter) {
          clickedAlone = hit.id
        } else {
          selection.select([hit.id], at.frame.key)
        }
        // Inside the selection's box a drag still moves the selection; a click picks the locked layer
        // on top there.
        if (locked && inOuter) clickedAlone = locked
      } else if (!inOuter) {
        // Empty canvas, or a locked layer: a marquee, adding to the selection with shift.
        canvas.setPointerCapture(e.pointerId)
        lockedClick = at && locked ? { id: locked, frame: at.frame.key } : null
        const from = toWorld(camera, screen)
        const base = e.shiftKey ? (selection.current()?.ids ?? []) : []
        const baseFrame = e.shiftKey ? (selection.current()?.frame ?? null) : null
        // A press on a locked layer keeps the selection until it is a drag, so a click on the one
        // selected leaves it be.
        if (!e.shiftKey && !locked) selection.selectKeepingModes(null)
        if (!(locked && insideEntered(locked))) selection.enter(null)
        gesture = { kind: 'marquee', from, to: from, base, baseFrame }
        drawOverlay()
        return
      } else if (!e.shiftKey) {
        clickedAlone = ''
      }
      const frame = at && frameOf(selection.current()?.frame)
      const around = boxes.selectionBox()?.around ?? []
      if (!at || !frame) return
      canvas.setPointerCapture(e.pointerId)
      const ids = boxes.roots()
      const reorder = autoLayoutDrag.press(frame, around, at.p, ids)
      if (reorder) {
        gesture = reorder
        drawOverlay()
        return
      }
      gesture = transformDrag.pressMove(frame, around, at.p, ids)
      drawOverlay()
    },
    on,
  )

  /** The layer an image dragged over the stage would be put into, outlined while it is over it. */
  let dropTarget: Picked | null = null
  /**
   * The layer under a point, in client coordinates, that an image dropped there goes into as its
   * fill: a shape, frame or boolean (a shape inside a boolean gives the boolean, whose paint shows),
   * not a line, and not one whose style is locked. Null over text, a group's gaps or empty space.
   */
  function imageTargetAt(client: Point): Picked | null {
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

  /** Where the pointer last was over the stage, so the hover outline follows edits under it. */
  let pointer: MouseEvent | null = null
  function rehover() {
    const at = pointer && !gesture && !panning() ? pointIn(pointer) : null
    const hit = at && hitTest(scenes.scene(at.frame).layers, at.p)
    const next = at && hit ? { id: target(hit.id, at.frame.key), frame: at.frame.key } : null
    return selection.hover(next)
  }

  canvas.addEventListener(
    'pointermove',
    (e) => {
      pointer = e
      if (pan) {
        setCamera({ ...pan.camera, x: pan.camera.x + e.clientX - pan.from.x, y: pan.camera.y + e.clientY - pan.from.y })
        return
      }
      const screen = screenOf(e)
      if (pen.drawing()) {
        pen.move(e, screen)
        return
      }
      if (!gesture) {
        // Hovering: outline the layer under the pointer and show what a press on a handle would do.
        cursorFor(screen)
        if (rehover()) drawOverlay()
        return
      }
      const world = toWorld(camera, screen)
      if (gesture.kind === 'marquee') {
        gesture.to = world
        transformDrag.marquee(gesture)
        drawOverlay()
        return
      }
      // A press that may be a click waits until the pointer has really moved, so a shaking tap still clicks.
      if (clickedAlone !== null && pressedAt && Math.hypot(screen.x - pressedAt.x, screen.y - pressedAt.y) < CLICK_SLOP)
        return
      clickedAlone = null
      const p = localTo({ x: world.x - gesture.frame.x, y: world.y - gesture.frame.y }, gesture.around)
      if (gesture.kind === 'textSelect') {
        typing.caretTo(typing.caretFromPoint(p), true)
        drawOverlay()
        return
      }
      if (gesture.kind === 'textBox' || gesture.kind === 'imageBox') {
        drawing.dragBox(gesture, p, e.shiftKey)
        drawOverlay()
        return
      }
      if (gesture.kind === 'draw') {
        drawing.dragShape(gesture, p, e.shiftKey, e.altKey)
        return
      }
      if (gesture.kind === 'path') {
        pen.dragPoints(gesture, p, e.shiftKey, e.altKey)
        return
      }
      if (gesture.kind === 'crop') {
        cropping.drag(gesture, p)
        return
      }
      // Holding Ctrl (⌘ on a Mac) turns snapping off for as long as it is held.
      const snap = tools.snapping() && !(e.ctrlKey || e.metaKey)
      if (gesture.kind === 'reorder') {
        autoLayoutDrag.drag(gesture, p)
        drawOverlay()
        return
      }
      if (gesture.kind === 'move') transformDrag.move(gesture, p, e.shiftKey, snap)
      else if (gesture.kind === 'resize') transformDrag.resize(gesture, p, e.shiftKey, e.altKey, snap)
      else transformDrag.rotate(gesture, p, e.shiftKey)
    },
    on,
  )

  const endDrag = () => {
    pressing = false
    if (pen.drawing() && !pan) {
      pen.up()
      return
    }
    if (gesture?.kind === 'draw') {
      drawing.finishShape(gesture)
      gesture = null
      showCursor()
      drawOverlay()
      return
    }
    if (gesture?.kind === 'textBox' || gesture?.kind === 'imageBox') {
      if (gesture.kind === 'textBox') drawing.finishText(gesture)
      else drawing.finishImage(gesture)
      gesture = null
      showCursor()
      drawOverlay()
      return
    }
    if (gesture?.kind === 'textSelect') {
      gesture = null
      return
    }
    if (gesture?.kind === 'reorder') autoLayoutDrag.release(gesture)
    else if (gesture?.kind === 'path') pen.releasePoints(gesture)
    else if (gesture?.kind === 'crop') cropping.release(gesture)
    else if (gesture && gesture.kind !== 'marquee') transformDrag.release(gesture)
    // A click on a locked layer, not a drag, selects it; a click on no layer picks the page under
    // it, and a click off every page or a drag lets the page go.
    const clicked =
      gesture?.kind === 'marquee' &&
      Math.hypot(gesture.to.x - gesture.from.x, gesture.to.y - gesture.from.y) * camera.zoom < CLICK_SLOP
    if (clicked && lockedClick) selection.select([lockedClick.id], lockedClick.frame)
    else if (gesture?.kind === 'marquee')
      selection.pickPage(clicked && !selection.current() ? (frameAt(grid.frames, gesture.from)?.pageId ?? null) : null)
    lockedClick = null
    const current = selection.current()
    if (clickedAlone !== null && current) {
      // A click that picks a layer outside the group gone into, or nothing, leaves it.
      if (selection.entered() && (!clickedAlone || !insideEntered(clickedAlone))) selection.enter(null)
      selection.select(clickedAlone ? [clickedAlone] : [], current.frame)
      // A click inside the selection's box on no layer picks the page there.
      if (!clickedAlone && pressedAt)
        selection.pickPage(frameAt(grid.frames, toWorld(camera, pressedAt))?.pageId ?? null)
    }
    clickedAlone = null
    pressedAt = null
    gesture = null
    pan = null
    showCursor()
    drawOverlay()
  }
  const cancelDrag = () => {
    // A drag the browser took away drops nothing into a flow, and selects no locked layer.
    if (gesture?.kind === 'reorder') gesture.moved = false
    lockedClick = null
    endDrag()
  }
  canvas.addEventListener('pointerup', endDrag, on)
  canvas.addEventListener('pointercancel', cancelDrag, on)
  // A press whose pointer capture goes without a pointerup or pointercancel, as when another
  // element takes the pointer, ends as a cancelled one does; after either, nothing is held.
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      if (pressing) cancelDrag()
    },
    on,
  )
  canvas.addEventListener(
    'pointerleave',
    () => {
      pointer = null
      if (selection.hover(null)) drawOverlay()
    },
    on,
  )
  canvas.addEventListener(
    'dblclick',
    (e) => {
      if (panning()) return
      const at = pointIn(e)
      const hit = at && hitTest(scenes.scene(at.frame).layers, at.p, boxes.pickable)
      if (!at || !hit || lockedAt(at.frame, at.p)) return
      const editing = typing.editing()
      if (editing && hit.id === editing.id && editing.frame === at.frame.key) {
        // A double click in the text being edited selects the word there (#47).
        const node = session.design().nodes[editing.id]
        if (node?.type === 'text') typing.selectText(wordAt(node.props.text, typing.caretFromPoint(at.p)))
        drawOverlay()
        return
      }
      const picked = target(hit.id, at.frame.key)
      const container = design.nodes[picked]
      if (picked !== hit.id && container && isContainer(container.type)) {
        // Into the group, frame or boolean: what is directly inside it under the pointer gets picked.
        typing.stop()
        selection.enter(picked)
        selection.selectKeepingModes(null)
        selection.select([target(hit.id, at.frame.key)], at.frame.key)
        return
      }
      if (boxes.cropTarget(at.frame, hit.id) && !design.nodes[hit.id]?.lock?.style) {
        // Into cropping its image fill (#48).
        typing.stop()
        selection.select([hit.id], at.frame.key)
        selection.crop({ id: hit.id, frame: at.frame.key })
        drawOverlay()
        return
      }
      if (isPath(design, hit.id) && !design.nodes[hit.id]?.lock?.style) {
        // Into a path's points (#45).
        typing.stop()
        selection.select([hit.id], at.frame.key)
        selection.editPath({ id: hit.id, frame: at.frame.key })
        drawOverlay()
        return
      }
      if (hit.type !== 'text' || design.nodes[hit.id]?.lock?.content) return
      typing.stop()
      selection.selectKeepingModes({ ids: [hit.id], frame: at.frame.key })
      typing.start(hit.id, at.frame.key, 0)
      typing.caretTo(typing.caretFromPoint(at.p))
      drawOverlay()
    },
    on,
  )

  // Wheel and trackpad: scrolling pans; pinching (which Chromium sends as ctrl-wheel) and
  // ctrl- or cmd-wheel zoom about the pointer.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.height : 1
      if (e.ctrlKey || e.metaKey) {
        const delta = Math.max(-30, Math.min(30, e.deltaY * unit))
        zoomTo(camera.zoom * Math.exp(-delta * 0.01), screenOf(e))
        return
      }
      const sideways = e.shiftKey && e.deltaX === 0
      const dx = (sideways ? e.deltaY : e.deltaX) * unit
      const dy = (sideways ? 0 : e.deltaY) * unit
      setCamera({ ...camera, x: camera.x - dx, y: camera.y - dy })
    },
    { ...on, passive: false },
  )

  /** Hides layers in every format, or shows them in every one: the base, with each format's own visibility gone. One undo step. */
  function hideInEveryFormat(ids: string[], hidden: boolean) {
    return runQuietly(() => session.run('node.visibleEverywhere', { ids, visible: !hidden }))
  }

  /** Combines the selected shapes into a live boolean (#44) and selects it. One undo step. */
  function combine(op: 'union' | 'subtract' | 'intersect' | 'exclude') {
    const current = selection.current()
    const frame = current && frameOf(current.frame)
    if (!frame) return
    let id = ''
    if (
      runQuietly(() => {
        id = session.run('node.boolean', {
          ids: boxes.roots(),
          op,
          drawn: boxes.drawnInFlow(boxes.roots(), frame.pageId),
        })
      })
    )
      selection.select([id], frame.key)
  }

  /**
   * Moves each selected layer, with what is inside it, by an offset worked out from the boxes
   * around them as drawn: align and distribute (#42). One undo step.
   */
  function arrange(offsets: (boxes: Rect[], within: Rect) => Offset[]) {
    const current = selection.current()
    const frame = current && frameOf(current.frame)
    const format = frame && design.formats[frame.formatId]
    if (!frame || !format) return false
    const now = session.design()
    const ids = boxes.roots(now)
    if (ids.some((id) => inFlow(frame, id, now))) notify('placedByLayout')
    const free = ids.filter((id) => !inFlow(frame, id, now))
    if (free.length === 0) return true
    return arrangeFree(frame, format, free, offsets, now)
  }
  /** Align or distribute layers that aren't in a flow. */
  function arrangeFree(
    frame: Frame,
    format: { width: number; height: number },
    ids: string[],
    offsets: (boxes: Rect[], within: Rect) => Offset[],
    now: Design,
  ) {
    const start = transformDrag.startBoxes(frame, ids)
    // One layer lines up with what holds it: its group or frame, or the format.
    const parent = now.nodes[ids[0] ?? '']?.parentId
    const holder = parent && now.nodes[parent] ? boxes.boxIn(frame, parent, now) : null
    const within = holder ?? { x: 0, y: 0, width: format.width, height: format.height }
    const moves = offsets(
      ids.map((id) => boundsOf([start.get(id) as Box])),
      within,
    )
    const next = new Map<string, Box>()
    ids.forEach((id, i) => {
      const { dx, dy } = moves[i] ?? { dx: 0, dy: 0 }
      for (const inner of [id, ...descendants(now, id)]) {
        const b = start.get(inner)
        if (b) next.set(inner, { ...b, x: round(b.x + dx), y: round(b.y + dy) })
      }
    })
    session.gesture(() => {
      transformDrag.writeBoxes(frame, start, next)
      hug(ids)
    })
    return true
  }
  const alignTo = (to: Alignment) => arrange((boxes, within) => align(boxes, to, within))
  const distributeAlong = (axis: Distribution) => arrange((boxes) => distribute(boxes, axis))

  /** Moves the selection by whole pixels in its format, one undo step per press. */
  function nudge(dx: number, dy: number) {
    const current = selection.current()
    const frame = current && frameOf(current.frame)
    if (!frame) return
    const ids = boxes.roots()
    const now = session.design()
    if (ids.some((id) => inFlow(frame, id, now))) {
      autoLayoutDrag.nudge(frame, ids, dx, dy, now)
      return
    }
    const start = transformDrag.startBoxes(frame, ids)
    // Arrows move along the page as drawn, also inside a turned group.
    const around = boxes.selectionBox()?.around ?? []
    const step = localTo(
      { x: dx, y: dy },
      around.map((b) => ({ ...b, x: -b.width / 2, y: -b.height / 2 })),
    )
    session.gesture(() => {
      transformDrag.writeBoxes(
        frame,
        start,
        new Map([...start].map(([id, b]) => [id, { ...b, x: round(b.x + step.x), y: round(b.y + step.y) }])),
      )
      hug(ids)
    })
  }

  /** The top-level layers of the selection's page, or the first page's, that can be picked. */
  function selectAll() {
    const frame =
      frameOf(selection.current()?.frame) ??
      frameOf(frameKey(firstPage(), design.meta.primaryFormatId)) ??
      grid.frames[0]
    if (!frame) return
    selection.select(
      scenes
        .scene(frame)
        .layers.filter(boxes.pickable)
        .map((layer) => layer.id),
      frame.key,
    )
  }

  /**
   * Does what a shortcut names. Returns whether there was anything to do it to; the keys that act
   * on the selection do nothing without one.
   */
  function perform(action: ShortcutAction): boolean {
    const view: Partial<Record<ShortcutAction, () => void>> = {
      undo: () => session.undo(),
      redo: () => session.redo(),
      zoomToFit: fitAll,
      zoomToSelection: fitSelection,
      zoomTo100: () => zoomTo(1),
      zoomIn,
      zoomOut,
      selectAll,
      toggleRulers: () => {
        rulers = !rulers
        drawOverlay()
        viewChanged()
      },
      toolSelect: () => tools.setTool('select'),
      toolHand: () => tools.setTool('hand'),
      toolRect: () => tools.setTool('rect'),
      toolEllipse: () => tools.setTool('ellipse'),
      toolLine: () => tools.setTool('line'),
      toolArrow: () => tools.setTool('arrow'),
      toolPen: () => tools.setTool('pen'),
      toolText: () => tools.setTool('text'),
      toolFrame: () => tools.setTool('frame'),
      toolImage: () => tools.setTool('image'),
    }
    // The pen's path ends with Enter or Escape, open as it is (#45).
    if (pen.drawing() && (action === 'deselect' || action === 'editPoints')) {
      pen.finish()
      return true
    }
    // Enter or Escape ends a crop (#48).
    if (selection.cropping() && (action === 'deselect' || action === 'editPoints')) {
      selection.crop(null)
      drawOverlay()
      return true
    }
    if (selection.pathEditing()) {
      if (action === 'deselect' || action === 'editPoints') {
        selection.editPath(null)
        drawOverlay()
        return true
      }
      if (action === 'delete') {
        pen.deletePoints()
        drawOverlay()
        return true
      }
    }
    const viewAction = view[action]
    if (viewAction) {
      if (action === 'undo' || action === 'redo') {
        pen.finish()
        endDrag()
        typing.stop()
      }
      viewAction()
      return true
    }
    // Esc lets the picked page go; the layers' other keys do nothing to it.
    if (action === 'deselect' && !selection.current() && selection.pickedPage()) {
      selection.pickPage(null)
      return true
    }
    const current = selection.current()
    const frame = current && frameOf(current.frame)
    if (!current || !frame) return false
    const ids = boxes.roots()
    const nodes = session.design().nodes
    const far = action.endsWith('Far') ? NUDGE_FAR : NUDGE
    switch (action) {
      case 'deselect': {
        // Out of a group or frame one level at a time: it gets selected, then the page.
        const up = selection.entered()
        const parent = up ? design.nodes[up]?.parentId : undefined
        selection.enter(parent && design.nodes[parent] ? parent : null)
        selection.select(up ? [up] : [], frame.key)
        break
      }
      case 'delete': {
        const parents = ids.map((id) => nodes[id]?.parentId ?? '').filter((id) => nodes[id])
        if (
          runQuietly(() =>
            session.gesture(() => {
              session.run('node.delete', { ids })
              hug(parents)
            }),
          )
        )
          selection.select([], frame.key)
        break
      }
      case 'group': {
        let group = ''
        if (
          runQuietly(() => {
            group = session.run('node.group', { ids, drawn: boxes.drawnInFlow(ids, frame.pageId) })
          })
        )
          selection.select([group], frame.key)
        break
      }
      case 'alignLeft':
        alignTo('left')
        break
      case 'alignCentre':
        alignTo('centre')
        break
      case 'alignRight':
        alignTo('right')
        break
      case 'alignTop':
        alignTo('top')
        break
      case 'alignMiddle':
        alignTo('middle')
        break
      case 'alignBottom':
        alignTo('bottom')
        break
      case 'distributeHorizontal':
        distributeAlong('horizontal')
        break
      case 'distributeVertical':
        distributeAlong('vertical')
        break
      case 'editPoints': {
        // Enter on one layer with an image fill crops it (#48); on one path, it goes into its points (#45).
        const [only] = current.ids
        if (current.ids.length !== 1 || !only || nodes[only]?.lock?.style) return false
        if (boxes.cropTarget(frame, only)) selection.crop({ id: only, frame: frame.key })
        else if (isPath(session.design(), only)) selection.editPath({ id: only, frame: frame.key })
        else return false
        break
      }
      case 'mask': {
        // One layer becomes a mask for the layers after it in its parent, or plain again. Several
        // are grouped first, and the bottom one masks the rest (#48).
        if (ids.length === 1) {
          const on = !nodes[ids[0] ?? '']?.props.mask
          runQuietly(() => session.run('node.mask', { ids, mask: on ? 'alpha' : null }))
          break
        }
        let group = ''
        if (
          runQuietly(() =>
            session.gesture(() => {
              group = session.run('node.group', { ids, drawn: boxes.drawnInFlow(ids, frame.pageId) })
              const [[bottom] = []] = childrenOf(session.design(), group)
              if (bottom) session.run('node.mask', { ids: [bottom], mask: 'alpha' })
            }),
          )
        )
          selection.select([group], frame.key)
        break
      }
      case 'frameSelection': {
        let framed = ''
        if (
          runQuietly(() => {
            framed = session.run('node.frame', { ids, drawn: boxes.drawnInFlow(ids, frame.pageId) })
          })
        )
          selection.select([framed], frame.key)
        break
      }
      case 'autoLayout': {
        // Selected frames: auto layout on, or off when every one has it already (#46).
        if (ids.length === 0) return false
        const frames = ids.filter((id) => nodes[id]?.type === 'frame')
        if (frames.length > 0) {
          const on = !frames.every((id) => {
            const node = nodes[id]
            return node?.type === 'frame' && node.props.layout !== undefined
          })
          runQuietly(() =>
            session.gesture(() => {
              for (const id of frames) session.run('node.autoLayout', { id, on })
            }),
          )
          break
        }
        // Layers none of which is a frame are wrapped in a frame that hugs them, its layout read off
        // where they are: layers already in an even row or column don't move.
        let framed = ''
        if (
          runQuietly(() =>
            session.gesture(() => {
              framed = session.run('node.frame', { ids, drawn: boxes.drawnInFlow(ids, frame.pageId) })
              session.run('node.autoLayout', { id: framed, on: true })
              session.run('node.update', { ids: [framed], patch: { sizing: { width: 'hug', height: 'hug' } } })
            }),
          )
        )
          selection.select([framed], frame.key)
        break
      }
      case 'booleanUnion':
        combine('union')
        break
      case 'booleanSubtract':
        combine('subtract')
        break
      case 'booleanIntersect':
        combine('intersect')
        break
      case 'booleanExclude':
        combine('exclude')
        break
      case 'ungroup': {
        // Booleans come apart the same way, their shapes showing their own paints again.
        const groups = ids.filter((id) => nodes[id]?.type === 'group' || nodes[id]?.type === 'boolean')
        if (groups.length === 0) return false
        let freed: string[] = []
        if (
          runQuietly(() => {
            freed = session.run('node.ungroup', { ids: groups })
          })
        ) {
          selection.select([...ids.filter((id) => !groups.includes(id)), ...freed], frame.key)
        }
        break
      }
      case 'duplicate': {
        let copies: string[] = []
        if (
          runQuietly(() => {
            copies = session.run('node.duplicate', { ids })
          })
        )
          selection.select(copies, frame.key)
        break
      }
      case 'bringForward':
        runQuietly(() => session.run('node.reorder', { ids, to: 'forward' }))
        break
      case 'sendBackward':
        runQuietly(() => session.run('node.reorder', { ids, to: 'backward' }))
        break
      case 'bringToFront':
        runQuietly(() => session.run('node.reorder', { ids, to: 'front' }))
        break
      case 'sendToBack':
        runQuietly(() => session.run('node.reorder', { ids, to: 'back' }))
        break
      case 'lock': {
        // Locks every flag, or unlocks them all when every selected layer is already locked.
        const locked = current.ids.every((id) => LOCK_FLAGS.every((flag) => nodes[id]?.lock?.[flag]))
        runQuietly(() =>
          session.run('node.lock', {
            ids: current?.ids ?? [],
            lock: Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, !locked])),
          }),
        )
        break
      }
      case 'hide': {
        // Hidden in this format only, like a move; the layer stays selected so it can be shown again.
        const shown = current.ids.some((id) => visibleIn(session.design(), frame, id))
        runQuietly(() =>
          session.run('node.update', { ids: current?.ids ?? [], scope: scope(frame), patch: { visible: !shown } }),
        )
        break
      }
      case 'hideEverywhere': {
        // Shown in any format: hidden in every one; hidden in all of them: shown in every one.
        const now = session.design()
        const shown = current.ids.some((id) =>
          Object.keys(now.formats).some(
            (f) => (now.overrides[formatScope(f)]?.[id]?.visible ?? now.nodes[id]?.props.visible) !== false,
          ),
        )
        hideInEveryFormat(current.ids, shown)
        break
      }
      case 'nudgeLeft':
      case 'nudgeLeftFar':
        nudge(-far, 0)
        break
      case 'nudgeRight':
      case 'nudgeRightFar':
        nudge(far, 0)
        break
      case 'nudgeUp':
      case 'nudgeUpFar':
        nudge(0, -far)
        break
      case 'nudgeDown':
      case 'nudgeDownFar':
        nudge(0, far)
        break
      default:
        return false
    }
    drawOverlay()
    return true
  }

  function onKey(e: KeyboardEvent) {
    if (inField(e.target)) return
    // The paste event that follows doesn't say whether Shift was down.
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') pasteAtPointer = e.shiftKey
    const action = shortcutFor(e)
    if (action === 'undo' || action === 'redo') {
      e.preventDefault()
      perform(action)
      return
    }
    if (inDialog(e.target)) return
    if (!typing.editing()) {
      if (e.code === 'Space' && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (!spaceHeld) {
          spaceHeld = true
          showCursor()
        }
      } else if (action && perform(action)) {
        e.preventDefault()
      }
      return
    }
    typing.key(e)
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
      schemaVersion: SCHEMA_VERSION,
      designId: options.designId,
      tree: { nodes, roots: tops },
    }
  }
  /** Whether the paste being made goes where the pointer is (Mod+Shift+V), not where the layers were. */
  let pasteAtPointer = false
  /**
   * Pastes layers (#49) into the frame the selection is in, or else the one under the pointer: in
   * the group or frame double-clicked into when it can hold them, otherwise on the page, where they
   * were or centred on the pointer. One undo step; the pasted layers end up selected.
   */
  function pasteLayers(tree: LayerTree, atPointer: boolean) {
    const under = pointer ? pointIn(pointer) : null
    const frame = frameOf(selection.current()?.frame) ?? under?.frame ?? drawnFrames[0] ?? grid.frames[0]
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
   * is, in one undo step. It goes centred on `spot`, or at `client`, in client coordinates, or at the
   * pointer when `atPointer`, or else in the middle of the frame in view; a file larger than SVG_ROOM of the
   * frame's shorter side is scaled down to it; what the file had that no layer shows is noticed.
   * Returns the group's id, or null when it placed nothing: there is no frame to put it in, or the
   * file can't be read, which is noticed too.
   */
  function placeSvg(
    text: string,
    name: string,
    where: { client?: Point; atPointer?: boolean; spot?: Spot },
  ): string | null {
    const client = where.client ?? (where.atPointer && pointer ? { x: pointer.clientX, y: pointer.clientY } : undefined)
    const spot = where.spot ?? (client && spotAt(client))
    // A point off every frame puts the file in the middle of the selection's frame; with no point,
    // it goes in the frame in the middle of the view.
    const frame = spot ? frameOf(spot.frame) : client ? frameOf(selection.current()?.frame) : middleFrame()
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
  window.addEventListener(
    'copy',
    (e) => {
      if (inField(e.target) || !e.clipboardData) return
      if (typing.copy(e)) return
      const copied = copiedLayers()
      if (!copied) return
      putOnClipboard(e.clipboardData, copied)
      e.preventDefault()
    },
    on,
  )
  window.addEventListener(
    'cut',
    (e) => {
      if (!typing.editing() && !inField(e.target) && e.clipboardData) {
        const copied = copiedLayers()
        if (!copied) return
        putOnClipboard(e.clipboardData, copied)
        e.preventDefault()
        perform('delete')
        return
      }
      if (!inField(e.target)) typing.cut(e)
    },
    on,
  )
  window.addEventListener(
    'paste',
    (e) => {
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
          if (markup) placeSvg(markup, 'SVG', { atPointer })
          else if (file) {
            void file.text().then((text) => {
              if (!listening.signal.aborted) placeSvg(text, file.name.replace(/.svg$/i, '') || 'SVG', { atPointer })
            })
          }
          return
        }
        e.preventDefault()
        pasteLayers(tree, pasteAtPointer)
        pasteAtPointer = false
        return
      }
      typing.paste(e)
    },
    on,
  )
  window.addEventListener('keydown', onKey, on)
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code !== 'Space') return
      spaceHeld = false
      showCursor()
    },
    on,
  )
  window.addEventListener(
    'blur',
    () => {
      spaceHeld = false
      showCursor()
    },
    on,
  )

  resize()
  const firstFormat = options.formatId ? frameOf(frameKey(firstPage(), options.formatId)) : undefined
  if (firstFormat) fitFrame(firstFormat)
  else fitAll()
  options.onZoom?.(camera.zoom)
  draw()
  saving.start()

  const defaultFrame = (pageId?: string, formatId?: string) => {
    const page = pageId ?? firstPage()
    const format = formatId ?? design.meta.primaryFormatId
    const found = frameOf(frameKey(page, format))
    if (!found) throw new Error(`no frame for page "${page}" in format "${format}"`)
    return found
  }

  /**
   * Text bound to a brand font whose family the kit has changed since: once that family's files are
   * here, it takes it and its box fits it in every format. The kit lives outside the design, so this
   * is a change no one undoes, as another tab's: undo could not put the kit back with it. Run when the
   * kit changes and when the design opens.
   */
  async function refitBrandFonts() {
    const kit = resources.bytes().variables ?? {}
    const stale = Object.entries(session.design().nodes).flatMap(([id, node]) => {
      const ref = node.type === 'text' ? node.bindings?.fontFamily : undefined
      const family = ref ? kit[ref] : undefined
      return node.type === 'text' && ref && family && family !== node.props.style.fontFamily
        ? [{ id, ref, family }]
        : []
    })
    if (stale.length === 0) return
    const families = [...new Set(stale.map((s) => s.family))]
    await Promise.all(resources.loadFamilies(families))
    if (listening.signal.aborted) return
    // Fitted in the fallback fonts, a box would be wrong: only a family whose files came is written.
    const here = new Set([...SHIPPED_FAMILIES, ...resources.bytes().fonts.map((f) => f.family)])
    session.untracked(() => {
      for (const { id, ref, family } of stale) {
        const node = session.design().nodes[id]
        // Still bound, the kit still gives this family (not a newer one), and the text has not taken it already.
        if (node?.type !== 'text' || node.bindings?.fontFamily !== ref || resources.bytes().variables?.[ref] !== family)
          continue
        if (node.props.style.fontFamily === family || !here.has(family)) continue
        if (!runQuietly(() => session.run('node.bind', { ids: [id], target: 'fontFamily', ref, value: family })))
          continue
        typing.fitText(id)
      }
    })
  }
  void refitBrandFonts()

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
    copyLayers() {
      const copied = copiedLayers()
      if (!copied) return false
      const { plain, kept } = keepCopy(copied)
      if (!kept) return false
      void navigator.clipboard?.writeText(plain).catch(() => {
        // Without clipboard access, Paste in the menu still has the kept copy.
      })
      return true
    },
    canPasteLayers: () => rememberedLayers() !== null,
    pasteLayers() {
      const tree = rememberedLayers()
      if (!tree) return false
      pasteLayers(tree, false)
      return true
    },
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
    gesturing: () => gesture !== null || session.inGesture(),
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
      if (everyFormat) return hideInEveryFormat(ids, hidden)
      const frame = defaultFrame(pageId, formatId)
      return runQuietly(() => session.run('node.update', { ids, scope: scope(frame), patch: { visible: !hidden } }))
    },
    onNotice(listener: (notice: Notice, parts: readonly Skipped[]) => void) {
      noticeListeners.add(listener)
      return () => noticeListeners.delete(listener)
    },
    selectionRect(): Rect | null {
      const outer = boxes.selectionBox()
      if (!outer) return null
      const { frame, drawn } = outer
      const corners = cornersOf(drawn).map((p) => toScreen(camera, { x: frame.x + p.x, y: frame.y + p.y }))
      const xs = corners.map((c) => c.x)
      const ys = corners.map((c) => c.y)
      if (!typing.editing()) {
        const label = sizeLabelTop(ys)
        ys.push(label, label + SIZE_LABEL_HEIGHT)
      }
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }
    },
    selectAt(client: Point): string[] {
      const at = pointAt(client)
      if (!at) return []
      const { frame } = at
      const deepest = hitTest(scenes.scene(frame).layers, at.p)
      if (!deepest) return []
      const id = target(deepest.id, frame.key)
      const current = selection.current()
      if (!(current?.frame === frame.key && current.ids.includes(id))) selection.select([id], frame.key)
      return [...(selection.current()?.ids ?? [])]
    },
    busy: () => gesture !== null,
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
    rulers: () => rulers,
    snapping: () => tools.snapping(),
    snapWork: () => transformDrag.snapWork(),
    setSnapping: (on: boolean) => tools.setSnapping(on),
    onView(listener: () => void) {
      viewListeners.add(listener)
      return () => viewListeners.delete(listener)
    },
    frames: () => frameGrid(session.design(), focused).frames,
    focused: () => focused,
    focus(formatId: string | null) {
      focused = formatId && design.formats[formatId] ? formatId : null
      grid = frameGrid(design, focused)
      selection.dropOffGrid()
      const editing = typing.editing()
      if (editing && !frameOf(editing.frame)) typing.stop()
      fitAll()
    },
    camera: () => camera,
    viewport: () => viewport,
    setCamera,
    setInsets(next: Insets) {
      insets = next
    },
    zoomTo,
    zoomIn,
    zoomOut,
    fitAll,
    fitSelection,
    fitFrame: (pageId: string, formatId: string) => fitFrame(defaultFrame(pageId, formatId)),
    fitPage(pageId: string) {
      const row = grid.frames.filter((f) => f.pageId === pageId)
      const first = row[0]
      if (!first) return
      const right = Math.max(...row.map((f) => f.x + f.width))
      const bottom = Math.max(...row.map((f) => f.y + f.height))
      setCamera(
        fit(
          { x: first.x, y: first.y, width: right - first.x, height: bottom - first.y },
          viewport,
          focused ? FOCUS_PADDING : undefined,
          insets,
        ),
      )
    },
    setTool: (next: Tool) => tools.setTool(next),
    tool: () => tools.tool(),
    armImage: (asset: PlacedAsset | null) => tools.setTool(asset ? 'image' : tools.tool(), asset),
    imageArmed: () => tools.imageToPlace() !== null,
    onTool: (listener: (tool: Tool) => void) => tools.onTool(listener),
    screenPoint(x: number, y: number, pageId?: string, formatId?: string): Point {
      const frame = defaultFrame(pageId, formatId)
      const at = toScreen(camera, { x: frame.x + x, y: frame.y + y })
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
        if (!pending) return resolve()
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
    setVariables(variables: Variables) {
      resources.setVariables(variables)
      resources.loadFamilies(fontFamilies(session.design(), variables))
      redraw()
      return refitBrandFonts()
    },
    bindSelection(kind: 'color' | 'font', ref: VariableRef | null): number {
      const current = session.design()
      const value = ref ? resources.bytes().variables?.[ref] : undefined
      if (ref && value === undefined) return 0
      const targets = (selection.current()?.ids ?? []).flatMap((id) => {
        const type = current.nodes[id]?.type ?? ''
        const target: BindingTarget = kind === 'font' ? 'fontFamily' : type === 'text' ? 'textColor' : 'fill'
        return canBind(type, target) ? [{ id, target }] : []
      })
      if (targets.length === 0) return 0
      let changed = 0
      session.gesture(() => {
        for (const { id, target } of targets) {
          if (
            !runQuietly(() =>
              session.run('node.bind', { ids: [id], target, ref, ...(value === undefined ? {} : { value }) }),
            )
          )
            continue
          changed++
          if (target === 'fontFamily') typing.fitText(id)
        }
      })
      return changed
    },
    placeImage(
      asset: { id: string; name: string; width: number; height: number },
      where?: Point | Spot,
    ): string | null {
      // A point off every frame places nothing; with no point, it goes in the frame in the middle of the view.
      const spot = where && ('frame' in where ? where : spotAt(where))
      if (where && !spot) return null
      const frame = spot ? frameOf(spot.frame) : middleFrame()
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
    },
    placeSvg: (text: string, name: string, where?: Point | Spot) =>
      placeSvg(text, name, !where ? {} : 'frame' in where ? { spot: where } : { client: where }),
    spotAt,
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
    imageTarget(client: Point | null): string | null {
      const next = client ? imageTargetAt(client) : null
      if (next?.id !== dropTarget?.id || next?.frame !== dropTarget?.frame) {
        dropTarget = next
        drawOverlay()
      }
      return next?.id ?? null
    },
    fillWithImage(id: string, asset: PlacedAsset, inFrame?: string): boolean {
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
    },
    pageThumbnail(pageId: string, size = 72): string | null {
      const frame = frameOf(frameKey(pageId, design.meta.primaryFormatId))
      return frame ? thumbnails.page(frame, size) : null
    },
    layerThumbnail(id: string, size = 96, outlined = false, inFrame?: string): string | null {
      const frame =
        frameOf(inFrame ?? selection.current()?.frame) ?? frameOf(frameKey(firstPage(), design.meta.primaryFormatId))
      return frame ? thumbnails.layer(frame, id, size, outlined) : null
    },
    synced: () => provider.synced && provider.unsyncedChanges === 0,
    destroy() {
      listening.abort()
      exporter.destroy()
      resized.disconnect()
      cancelAnimationFrame(pending)
      drawListeners.clear()
      selection.destroy()
      noticeListeners.clear()
      thumbnails.destroy()
      tools.destroy()
      doc.off('update', redraw)
      scenes.destroy()
      resources.destroy()
      session.destroy()
      saving.destroy()
      provider.destroy()
      void local.destroy()
      doc.destroy()
      cache.delete()
      backing.delete()
      edge.delete()
      surface?.delete()
      gl.delete()
    },
  }
}
