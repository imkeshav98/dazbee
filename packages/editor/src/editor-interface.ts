// What `startEditor` is given and what it resolves to: the open editor, its options and the events
// it tells the page of.
import type { DesignDoc, Session } from '@dazbee/doc'
import type { ExportedFile } from '@dazbee/export'
import type { Design, ExportRequestInput, Point, Rect, TextStyle, VariableRef, Variables } from '@dazbee/schema'
import type { Skipped } from '@dazbee/svg'

import type { Camera, Insets, Viewport } from './canvas/camera.ts'
import type { Frame } from './canvas/frames.ts'
import type { Spot } from './canvas/view.ts'
import type { ResourceSources } from './resources.ts'
import type { ShortcutAction } from './shortcuts.ts'
import type { RunStyle, TextRange } from './text/text-edit.ts'
import type { PlacedAsset, Tool } from './tools.ts'

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
  /**
   * Loading steps, then once the design is open its save state (#37): Saving while the sync server
   * has not yet got every edit, Saved once it has, Offline (kept on this device) without it.
   */
  onStatus?: (status: string) => void
  /** Called with the zoom (1 is 100%) whenever it changes. */
  onZoom?: (zoom: number) => void
  /** The name a frame drawn with the Frame tool takes, from its size, in the app's words. */
  frameName: (width: number, height: number) => string
  /** Aborting it while the editor is still connecting stops it, freeing what it made. */
  signal?: AbortSignal
}

/** Something the page should say: why a gesture or a paste did nothing, or how placing an SVG went. */
export type Notice = 'placedByLayout' | 'flowEnd' | 'svgLeftOut' | 'svgUnreadable' | 'pasteNeedsFrame'

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
  doc: DesignDoc
  /** The design as the document holds it now, which can be ahead of the last redraw. */
  design: () => Design
  /** The first selected layer, or null. */
  selected: () => string | null
  /** Every selected layer, in the order they were picked. */
  selection: () => string[]
  /** The frame the selection is in, by its id, or null. */
  selectedFrame: () => string | null
  /**
   * Selects layers in the frame of the first of them, leaving out any in other frames, and shows
   * that frame's page first when another is shown; none clears the selection.
   */
  select(ids: string[]): void
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
   * Moves a layer to the top level of its frame or into a container there, before a sibling or on
   * top (#59), as one undo step; groups it leaves and enters fit what they hold again. False when the
   * move isn't allowed, such as into itself, into another frame or into a layer that can't hold it.
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
   * the gesture open. `to` gives a layer's patch from its props now; null leaves it be. The change
   * stays on these layers: their linked copies in other frames keep their own values. X and Y of a
   * group or box carry what it holds along; groups fit what they hold again. A fill, text colour or
   * font set by hand no longer follows the brand. False when a change isn't allowed, such as on a
   * locked layer.
   */
  setProps(
    ids: string[],
    to: (id: string, props: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
  ): boolean
  /** Renames a layer (#59), as one undo step; false for an empty name. */
  renameLayer: (id: string, name: string) => boolean
  /** Locks layers completely, or unlocks them (#59), as one undo step. */
  setLocked: (ids: string[], locked: boolean) => boolean
  /** Hides layers, or shows them (#59), as one undo step, like the Hide shortcut: their linked copies stay as they are. */
  setHidden(ids: string[], hidden: boolean): boolean
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
  /**
   * The frame picked as a whole, by a press on its label or its empty area, or null; no layer is
   * selected while one is. Esc, a layer selected or a click on empty canvas lets it go.
   */
  pickedFrame: () => string | null
  /**
   * Picks a frame of the shown page as a press on its label does, letting the selection go; null,
   * or a frame not on the shown page, lets the picked one go.
   */
  pickFrame: (frameId: string | null) => void
  /** Calls back with the picked frame, or null, whenever it changes. */
  onFramePick(listener: (frameId: string | null) => void): () => boolean
  /**
   * Picks a frame of the shown page and asks the page to rename it in place, as a double click on
   * its label does; the page renames it with the `frame.update` command and calls `renamed` once
   * its field closes, the label left out until then. Does nothing for a frame not on the shown page.
   */
  renameFrame(frameId: string): void
  /** Calls back with the frame to rename in place: its label was double-clicked, or `renameFrame` asked. */
  onFrameRename(listener: (frameId: string) => void): () => boolean
  /** The page's rename field has closed: the frame's label shows again. */
  renamed(): void
  /** Calls back with a frame's name once Delete, by its key or `perform('delete')`, deleted it as the picked frame. */
  onFrameDelete(listener: (name: string) => void): () => boolean
  /**
   * Where a frame's label is drawn on the stage, in pixels from the stage's top start corner; null
   * for a frame the shown page lacks, or one off the stage at its start.
   */
  labelRect(frameId: string): Rect | null
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
  /** The shown page's frames as last drawn, by order, each at its stored place. */
  frames: () => Frame[]
  /** The page the canvas shows: the first page when the editor opens, and when the shown page is deleted. */
  shownPage: () => string
  /**
   * Shows a page, its frames fitted; the first page for one the design lacks. A selection, crop,
   * path edit, pen path or typing on another page and the picked frame let go.
   */
  showPage(pageId: string): void
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
  /** Fits a frame in view, showing its page first when another is shown. Throws for a frame the design lacks. */
  fitFrame(frameId: string): void
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
  /** Where a design pixel of a frame of the shown page is on screen now, in client coordinates; its first frame by default. */
  screenPoint(x: number, y: number, frameId?: string): Point
  /** A layer's box as drawn in its frame, in design pixels, auto layout solved; null for a layer in no frame. */
  boxOf(id: string): Rect | null
  /**
   * Resolves once the fonts and images the design has asked for so far are here or failed to
   * come. One arriving drops every frame's picture, so the next redraw records them again.
   */
  loaded: () => Promise<undefined>
  /** Resolves once what the screen shows is up to date: after the pending redraw, if there is one. */
  drawn: () => Promise<void>
  onDraw(listener: (design: Design, at: number, info: DrawInfo) => void): () => boolean
  /** The export render of a frame, shown or not, as this tab holds it now, on the CPU surface, as RGBA; the shown page's first frame by default. */
  exportPixels(frameId?: string): Uint8Array
  /**
   * Exports the frames a request names, as this tab holds the design now, drawn in the export
   * worker so the stage stays responsive (#55). One file comes as itself, more as one zip.
   */
  exportFiles(request: ExportRequestInput, progress?: (done: number, total: number) => void): Promise<ExportedFile>
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
   * Puts an image into a layer as its fill, as one undo step: in place of its topmost image fill
   * (keeping its fit, adjustments and filter, the crop reset), or on top of its fills when it has
   * none; a fill bound to a brand colour stays bound. Its linked copies keep their own fills. The
   * layer is selected in its frame. False when it can't take one, such as a layer whose style is
   * locked.
   */
  fillWithImage(id: string, asset: PlacedAsset): boolean
  /** A picture of a page's first frame, shown or not, `size` pixels on its longer side, for the Pages card. Null for a page with no frames. */
  pageThumbnail(pageId: string, size?: number): string | null
  /**
   * A small picture of a layer for the effect tiles and the layers panel: drawn by the renderer
   * without the layer's own effects, in its own frame, and kept until the layer or what it is
   * drawn with changes. Text is "Aa" in its look, outlined with no fill when asked. A PNG object
   * URL, or null.
   */
  layerThumbnail(id: string, size?: number, outlined?: boolean): string | null
  synced: () => boolean
  destroy(): void
}
