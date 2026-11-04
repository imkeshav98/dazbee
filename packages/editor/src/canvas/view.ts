// The stage's view of the canvas: the WebGL surface it draws on, the camera, the stage's size and
// the edges chrome covers, the page it shows and that page's frames as last drawn, the rulers, and
// the animation-frame schedule that redraws it.
import type { CanvasKit, GrDirectContext, SkPicture, Surface } from '@dazbee/canvaskit'
import type { Session } from '@dazbee/doc'
import { type Design, inOrder, type Point, type Rect } from '@dazbee/schema'

import type { Box } from '../layers/transform.ts'
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
} from './camera.ts'
import { type Frame, frameAt, pageFrames } from './frames.ts'
import { px } from './rulers.ts'

/** A point on the design: a frame, by its id, and a point in it in design pixels. */
export interface Spot {
  frame: string
  x: number
  y: number
}

export interface ViewDeps {
  ck: CanvasKit
  canvas: HTMLCanvasElement
  session: Pick<Session, 'design'>
  /** Told with the zoom (1 is 100%) whenever it changes. */
  onZoom: (zoom: number) => void
  /** The frame callback: draws the stage, called from the animation-frame schedule. */
  draw: () => void
}

export interface EditorView {
  camera(): Camera
  viewport(): Viewport
  /** The design as last drawn. */
  design(): Design
  /** The shown page's frames as last drawn, by order. */
  frames(): Frame[]
  /** The shown page's frame with an id, as last drawn, if there is one. */
  frameOf(key: string | undefined): Frame | undefined
  /** The page the canvas shows. */
  page(): string
  /** The frames the last redraw drew: the ones in view then. */
  inView(): Frame[]
  /** The frame in the middle of the view, if one is there. */
  middleFrame(): Frame | undefined
  /** Whether the rulers along the stage's edges show. */
  rulers(): boolean
  /** A point in client coordinates as a point on the stage. */
  onStage(client: Point): Point
  /** The frame under a point on screen, in client coordinates, and the point in its design pixels. */
  pointAt(client: Point): { frame: Frame; p: Point } | null
  /** The spot under a point on screen, in client coordinates: the frame there and the point in it. */
  spotAt(client: Point): Spot | null
  /** The shown page's frame with an id, its first by default. Throws when the shown page has no such frame. */
  defaultFrame(frameId?: string): Frame
  /** Where a design pixel of a frame of the shown page is on screen now, in client coordinates; its first frame by default. */
  screenPoint(x: number, y: number, frameId?: string): Point
  /** Whether a redraw is waiting for the next animation frame. */
  scheduled(): boolean
  /** Puts an overlay element over a box in a frame, in design pixels. */
  placeBox(el: HTMLElement, frame: Frame, box: Rect): void
  /** A box on the overlay with a class, turned as the layer is. */
  outline(className: string, frame: Frame, box: Box): HTMLElement
  /**
   * Reads the design for a redraw: a shown page that is gone shows the first page again, and the
   * shown page's frames are laid out again.
   */
  update(): void
  /**
   * Draws the frames in view at the camera, each picture over white with a hairline edge, and
   * shows them; `record` gives the pictures of the frames in view. False, drawing nothing, before
   * the stage has a surface.
   */
  paint(record: (inView: Frame[]) => readonly { frame: Frame; picture: SkPicture }[]): boolean
  setCamera(next: Camera): void
  /** The stage's edges floating chrome covers, in screen pixels; later fits keep clear of them. */
  setInsets(next: Insets): void
  zoomTo(zoom: number, at?: Point): void
  zoomIn(): void
  zoomOut(): void
  /** Shows a page, the first page for one the design lacks: reads the design, lays out its frames at once and fits them. */
  showPage(pageId: string): void
  /** Fits the shown page's frames in view; on a page with none, puts the page's origin in the middle at 100%. */
  fitAll(): void
  /** Fits a part of the canvas in view, in world units; nothing without one. */
  fitArea(area: Rect | undefined): void
  /** Turns the rulers on or off; the view listeners hear of it from `viewChanged`. */
  toggleRulers(): void
  /** Tells the view listeners that the rulers or snapping turned on or off. */
  viewChanged(): void
  /** Calls back whenever the rulers or snapping turn on or off. */
  onView(listener: () => void): () => boolean
  /** Fits the canvas's backing store to the stage's size on screen, at the screen's pixels. */
  resize(): void
  /** Draws the stage at the next animation frame, once however often it is asked. */
  redraw(): void
  destroy(): void
}

const ZOOM_STEP = 2

export function editorView({ ck, canvas, session, onZoom, draw }: ViewDeps): EditorView {
  const maybeGl = ck.MakeWebGLContext(ck.GetWebGLContext(canvas))
  if (!maybeGl) throw new Error('this browser has no WebGL')
  /** The WebGL context the stage draws with. */
  const gl: GrDirectContext = maybeGl
  /** The canvas's surface, made again when the stage's size changes. */
  let surface: Surface | null = null
  /** Screen pixels per CSS pixel. */
  let dpr = 1
  /** The stage's size, in CSS pixels. */
  let viewport: Viewport = { width: 1, height: 1 }
  // The stage's edges that floating chrome covers; fitting centres in what is left (#83).
  let insets = NO_INSETS
  /** The design as last drawn. */
  let design: Design = session.design()
  /** The page the canvas shows: the first page by order, until another is shown. */
  let shown = firstPageOf(design)
  /** The shown page's frames as last drawn, and the box round them. */
  let laid = pageFrames(design, shown)
  /** Where the canvas is on the stage, and its zoom. */
  let camera: Camera = { x: 0, y: 0, zoom: 1 }
  /** The rulers are off until asked for (Shift+R or the View card): the stage is for the ads. */
  let rulers = false
  /** Told when the rulers or snapping turn on or off, so the View card follows a shortcut too. */
  const viewListeners = new Set<() => void>()
  /** The frames the last redraw drew. */
  let drawnFrames: Frame[] = []
  /** The animation frame the next redraw waits for, or 0 with none asked for. */
  let pending = 0

  const backing = new ck.Paint()
  backing.setColor(ck.WHITE)
  const edge = new ck.Paint()
  edge.setStyle(ck.PaintStyle.Stroke)
  // Width 0 is a hairline: one device pixel at any zoom.
  edge.setStrokeWidth(0)
  edge.setColor(ck.Color(0, 0, 0, 0.12))
  const resized = new ResizeObserver(() => resize())
  resized.observe(canvas)

  function currentCamera() {
    return camera
  }
  function currentViewport() {
    return viewport
  }
  function drawn() {
    return design
  }
  function frames() {
    return laid.frames
  }
  function frameOf(key: string | undefined) {
    return laid.frames.find((f) => f.key === key)
  }
  function shownPage() {
    return shown
  }
  function inView() {
    return drawnFrames
  }
  function centre(): Point {
    return { x: viewport.width / 2, y: viewport.height / 2 }
  }
  function middleFrame() {
    return frameAt(laid.frames, toWorld(camera, centre()))
  }
  function rulersShown() {
    return rulers
  }
  // Pointer: screen points are CSS pixels from the canvas's corner.
  function onStage(client: Point): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: client.x - rect.left, y: client.y - rect.top }
  }
  function pointAt(client: Point) {
    const world = toWorld(camera, onStage(client))
    const frame = frameAt(laid.frames, world)
    return frame ? { frame, p: { x: world.x - frame.x, y: world.y - frame.y } } : null
  }
  function spotAt(client: Point): Spot | null {
    const at = pointAt(client)
    return at ? { frame: at.frame.key, x: at.p.x, y: at.p.y } : null
  }
  const defaultFrame = (frameId?: string) => {
    const found = frameId === undefined ? laid.frames[0] : frameOf(frameId)
    if (found) return found
    throw new Error(frameId === undefined ? 'the shown page has no frames' : `no frame "${frameId}" on the shown page`)
  }
  function screenPoint(x: number, y: number, frameId?: string): Point {
    const frame = defaultFrame(frameId)
    const at = toScreen(camera, { x: frame.x + x, y: frame.y + y })
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + at.x, y: rect.top + at.y }
  }
  function scheduled() {
    return pending !== 0
  }
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
  /** A box on the overlay, turned as the layer is. */
  function outline(className: string, frame: Frame, box: Box) {
    const el = document.createElement('div')
    el.className = className
    placeBox(el, frame, box)
    if (box.rotation) el.style.transform = `rotate(${box.rotation}deg)`
    return el
  }

  function update() {
    design = session.design()
    if (!Object.hasOwn(design.pages, shown)) shown = firstPageOf(design)
    laid = pageFrames(design, shown)
  }
  function paint(record: (inView: Frame[]) => readonly { frame: Frame; picture: SkPicture }[]) {
    if (!surface) return false
    drawnFrames = framesInView(laid.frames, camera, viewport)
    const pictures = record(drawnFrames)
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
    return true
  }
  function setCamera(next: Camera) {
    const zoomed = next.zoom !== camera.zoom
    camera = next
    if (zoomed) onZoom(camera.zoom)
    redraw()
  }
  function setInsets(next: Insets) {
    insets = next
  }
  function zoomTo(zoom: number, at: Point = centre()) {
    setCamera(zoomAt(camera, at, zoom))
  }
  function zoomIn() {
    zoomTo(camera.zoom * ZOOM_STEP)
  }
  function zoomOut() {
    zoomTo(camera.zoom / ZOOM_STEP)
  }
  function showPage(pageId: string) {
    shown = pageId
    update()
    fitAll()
  }
  function fitAll() {
    if (laid.bounds) setCamera(fit(laid.bounds, viewport, undefined, insets))
    else setCamera({ ...centre(), zoom: 1 })
  }
  function fitArea(area: Rect | undefined) {
    if (area) setCamera(fit(area, viewport, undefined, insets))
  }
  function toggleRulers() {
    rulers = !rulers
  }
  function viewChanged() {
    for (const listener of viewListeners) listener()
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
  function redraw() {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0
        draw()
      })
  }

  function onView(listener: () => void) {
    viewListeners.add(listener)
    return () => viewListeners.delete(listener)
  }

  function destroy() {
    cancelAnimationFrame(pending)
    surface?.delete()
    resized.disconnect()
    edge.delete()
    backing.delete()
    viewListeners.clear()
    gl.delete()
  }

  return {
    camera: currentCamera,
    viewport: currentViewport,
    design: drawn,
    frames,
    frameOf,
    page: shownPage,
    inView,
    middleFrame,
    rulers: rulersShown,
    onStage,
    pointAt,
    spotAt,
    scheduled,
    defaultFrame,
    screenPoint,
    placeBox,
    outline,
    update,
    paint,
    setCamera,
    setInsets,
    zoomTo,
    zoomIn,
    zoomOut,
    showPage,
    fitAll,
    fitArea,
    toggleRulers,
    viewChanged,
    onView,
    resize,
    redraw,
    destroy,
  }
}

/** The design's first page by order, or '' with none. */
function firstPageOf(design: Design) {
  return inOrder(design.pages)[0]?.[0] ?? ''
}
