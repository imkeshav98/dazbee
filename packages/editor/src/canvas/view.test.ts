import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasKit, SkPicture } from '@dazbee/canvaskit'
import type { Design, Rect } from '@dazbee/schema'

import { fit } from './camera.ts'
import { pageFrames } from './frames.ts'
import { design } from './test-design.ts'
import { editorView, type ViewDeps } from './view.ts'

/** A CanvasKit that logs what the view makes, draws and frees, with a canvas that logs its calls. */
function fakeCanvasKit(log: string[]) {
  const drawn = {
    clear: () => log.push('clear'),
    save: () => log.push('save'),
    restore: () => log.push('restore'),
    scale: (x: number, y: number) => log.push(`scale ${x} ${y}`),
    translate: (x: number, y: number) => log.push(`translate ${x} ${y}`),
    drawRect: () => log.push('rect'),
    drawPicture: (picture: { name: string }) => log.push(`picture ${picture.name}`),
  }
  const ck = {
    GetWebGLContext: () => 1,
    MakeWebGLContext: () => ({ delete: () => log.push('delete gl') }),
    MakeOnScreenGLSurface: (_gl: unknown, width: number, height: number) => {
      log.push(`surface ${width}×${height}`)
      return { getCanvas: () => drawn, flush: () => log.push('flush'), delete: () => log.push('delete surface') }
    },
    Paint: class {
      setColor() {}
      setStyle() {}
      setStrokeWidth() {}
      delete() {
        log.push('delete paint')
      }
    },
    WHITE: 'white',
    TRANSPARENT: 'clear',
    PaintStyle: { Stroke: 'stroke' },
    ColorSpace: { SRGB: 'srgb' },
    Color: () => 'edge',
    XYWHRect: (x: number, y: number, w: number, h: number) => [x, y, w, h],
  }
  return ck as unknown as CanvasKit
}

/** The canvas on a stage of a size, 10 pixels from the page's corner. */
function fakeCanvas(width: number, height: number) {
  return {
    clientWidth: width,
    clientHeight: height,
    width: 300,
    height: 150,
    getBoundingClientRect: () => ({ left: 10, top: 10 }),
  }
}

/** Animation frames waiting to run. */
let frames: Map<number, () => void>
let observed: string[]
beforeEach(() => {
  frames = new Map()
  observed = []
  let next = 0
  vi.stubGlobal('window', { devicePixelRatio: 2 })
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
    next += 1
    frames.set(next, run)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        observed.push('observe')
      }
      disconnect() {
        observed.push('disconnect')
      }
    },
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})
/** Runs the animation frames waiting now. */
function runFrames() {
  const waiting = [...frames.values()]
  frames.clear()
  for (const run of waiting) run()
}

/** The view over the test design on a 1000×800 stage, logging what it draws, its zooms and its draws. */
function harness(start: Design = design) {
  let now = start
  const log: string[] = []
  const deps: ViewDeps = {
    ck: fakeCanvasKit(log),
    canvas: fakeCanvas(1000, 800) as unknown as HTMLCanvasElement,
    session: { design: () => now },
    onZoom: (zoom) => log.push(`zoom ${zoom}`),
    draw: () => log.push('draw'),
  }
  const view = editorView(deps)
  const change = (next: Design) => {
    now = next
  }
  return { view, log, change, canvas: deps.canvas }
}
const picture = (name: string) => ({ name }) as unknown as SkPicture
const white = [{ type: 'solid' as const, color: '#FFFFFFFF' }]
/** The test design with a third page, `three`, holding one frame away from the origin, or none. */
const withPageThree = (frames: boolean): Design => ({
  ...design,
  pages: { ...design.pages, three: { name: 'Three', order: 'a2' } },
  frames: frames
    ? {
        ...design.frames,
        'three-sq': {
          pageId: 'three',
          name: 'Square',
          width: 500,
          height: 400,
          x: 100,
          y: 200,
          fills: white,
          order: 'a0',
        },
      }
    : design.frames,
})
/** The test design without page `one` and its frames. */
const withoutPageOne: Design = {
  ...design,
  pages: { two: design.pages.two as Design['pages'][string] },
  frames: Object.fromEntries(Object.entries(design.frames).filter(([, f]) => f.pageId !== 'one')),
}

describe('editorView', () => {
  describe('design, frames, frameOf and page', () => {
    it('reads the design and shows the first page, its frames where they are stored', () => {
      const { view } = harness()
      expect(view.design()).toBe(design)
      expect(view.page()).toBe('one')
      expect(view.frames()).toEqual(pageFrames(design, 'one').frames)
      expect(view.frameOf('one-mpu')).toMatchObject({ pageId: 'one', name: 'MPU', x: 2560, y: 0 })
    })

    it('finds no frame of a page not shown, or one the design lacks', () => {
      const { view } = harness()
      expect(view.frameOf('two-mpu')).toBeUndefined()
      expect(view.frameOf('gone')).toBeUndefined()
      expect(view.frameOf(undefined)).toBeUndefined()
    })
  })

  describe('middleFrame', () => {
    it('finds the frame in the middle of the view', () => {
      const { view } = harness()
      view.resize()
      view.setCamera({ x: 500 - 540, y: 400 - 540, zoom: 1 })
      expect(view.middleFrame()?.key).toBe('one-sq')
      view.setCamera({ x: 500 - 1200, y: 0, zoom: 1 })
      expect(view.middleFrame()).toBeUndefined()
    })
  })

  describe('onStage, pointAt and spotAt', () => {
    it('reads a client point on the stage, and the frame and design pixel under it', () => {
      const { view } = harness()
      view.setCamera({ x: 100, y: 50, zoom: 2 })
      expect(view.onStage({ x: 110, y: 60 })).toEqual({ x: 100, y: 50 })
      expect(view.pointAt({ x: 130, y: 80 })).toMatchObject({ frame: { key: 'one-sq' }, p: { x: 10, y: 10 } })
      expect(view.spotAt({ x: 130, y: 80 })).toEqual({ frame: 'one-sq', x: 10, y: 10 })
      expect(view.spotAt({ x: 0, y: 0 })).toBeNull()
    })
  })

  describe('defaultFrame and screenPoint', () => {
    it("finds a frame of the shown page, its first by default, and where the frame's pixels are on screen", () => {
      const { view } = harness()
      expect(view.defaultFrame().key).toBe('one-sq')
      expect(view.defaultFrame('one-mpu').key).toBe('one-mpu')
      view.setCamera({ x: 100, y: 50, zoom: 2 })
      expect(view.screenPoint(5, 6, 'one-mpu')).toEqual({ x: 10 + 100 + (2560 + 5) * 2, y: 10 + 50 + 6 * 2 })
      expect(view.screenPoint(0, 0)).toEqual({ x: 10 + 100, y: 10 + 50 })
    })

    it('throws for a frame not on the shown page, and on a page with no frames', () => {
      const { view, change } = harness()
      expect(() => view.defaultFrame('two-mpu')).toThrow('no frame "two-mpu" on the shown page')
      expect(() => view.screenPoint(0, 0, 'gone')).toThrow('no frame "gone" on the shown page')
      change(withPageThree(false))
      view.showPage('three')
      expect(() => view.defaultFrame()).toThrow('the shown page has no frames')
    })
  })

  describe('scheduled and redraw', () => {
    it('draws once at the next animation frame however often it is asked', () => {
      const { view, log } = harness()
      expect(view.scheduled()).toBe(false)
      view.redraw()
      view.redraw()
      expect(view.scheduled()).toBe(true)
      runFrames()
      expect(view.scheduled()).toBe(false)
      expect(log).toEqual(['draw'])
    })
  })

  describe('placeBox', () => {
    it('puts an element over a box in a frame, at the camera', () => {
      const { view } = harness()
      view.setCamera({ x: 10, y: 20, zoom: 2 })
      const el = { style: {} } as HTMLElement
      view.placeBox(el, view.frameOf('one-sq') as never, { x: 5, y: 5, width: 50, height: 25 })
      expect(el.style).toMatchObject({ left: '20px', top: '30px', width: '100px', height: '50px' })
    })
  })

  describe('update', () => {
    it("reads the design again and lays out the shown page's frames", () => {
      const { view, change } = harness()
      const without: Design = {
        ...design,
        frames: Object.fromEntries(Object.entries(design.frames).filter(([id]) => id !== 'one-story')),
      }
      change(without)
      expect(view.design()).toBe(design)
      view.update()
      expect(view.design()).toBe(without)
      expect(view.frames().map((f) => f.key)).toEqual(['one-sq', 'one-mpu'])
    })

    it('shows the first page again when the shown page is gone', () => {
      const { view, change } = harness()
      view.showPage('two')
      change({ ...design, pages: { one: design.pages.one as Design['pages'][string] } })
      view.update()
      expect(view.page()).toBe('one')
      expect(view.frames().map((f) => f.key)).toEqual(['one-sq', 'one-story', 'one-mpu'])
      change(withoutPageOne)
      view.update()
      expect(view.page()).toBe('two')
    })
  })

  describe('showPage', () => {
    it('shows a page, laying out its frames at once, even one just added, and fits them', () => {
      const { view, change } = harness()
      view.resize()
      change(withPageThree(true))
      view.showPage('three')
      expect(view.page()).toBe('three')
      expect(view.frames().map((f) => f.key)).toEqual(['three-sq'])
      expect(view.camera()).toEqual(fit({ x: 100, y: 200, width: 500, height: 400 }, { width: 1000, height: 800 }))
    })

    it('shows the first page for a page the design lacks', () => {
      const { view } = harness()
      view.showPage('two')
      view.showPage('gone')
      expect(view.page()).toBe('one')
    })
  })

  describe('paint', () => {
    it('draws nothing before the stage has a surface', () => {
      const { view } = harness()
      expect(view.paint(() => [])).toBe(false)
    })

    it('draws the pictures of the frames in view at the camera, each on its page, and shows them', () => {
      const { view, log } = harness()
      view.resize()
      view.setCamera({ x: 0, y: 0, zoom: 0.5 })
      log.length = 0
      let asked: string[] = []
      const painted = view.paint((inView) => {
        asked = inView.map((f) => f.key)
        return inView.slice(0, 1).map((frame) => ({ frame, picture: picture(frame.key) }))
      })
      expect(painted).toBe(true)
      expect(asked).toEqual(['one-sq', 'one-story'])
      expect(view.inView().map((f) => f.key)).toEqual(asked)
      expect(log).toEqual([
        'clear',
        'save',
        'scale 2 2',
        'translate 0 0',
        'scale 0.5 0.5',
        'rect',
        'save',
        'translate 0 0',
        'picture one-sq',
        'restore',
        'rect',
        'restore',
        'flush',
      ])
    })
  })

  describe('setCamera, zoomTo, zoomIn and zoomOut', () => {
    it('moves the camera and redraws, telling the zoom when it changes', () => {
      const { view, log } = harness()
      view.setCamera({ x: 10, y: 10, zoom: 1 })
      view.setCamera({ x: 20, y: 10, zoom: 1.5 })
      expect(view.camera()).toEqual({ x: 20, y: 10, zoom: 1.5 })
      expect(log).toEqual(['zoom 1.5'])
      expect(view.scheduled()).toBe(true)
    })

    it('zooms about the middle of the stage, or a point on it, in steps of two', () => {
      const { view } = harness()
      view.resize()
      view.setCamera({ x: 0, y: 0, zoom: 1 })
      view.zoomIn()
      expect(view.camera()).toEqual({ x: -500, y: -400, zoom: 2 })
      view.zoomOut()
      expect(view.camera()).toEqual({ x: 0, y: 0, zoom: 1 })
      view.zoomTo(4, { x: 0, y: 0 })
      expect(view.camera()).toEqual({ x: 0, y: 0, zoom: 4 })
    })
  })

  describe('fitAll and fitArea', () => {
    it("fits the shown page's frames, clear of the insets", () => {
      const { view } = harness()
      view.resize()
      const insets = { top: 40, right: 0, bottom: 72, left: 0 }
      view.setInsets(insets)
      view.fitAll()
      const viewport = { width: 1000, height: 800 }
      expect(view.camera()).toEqual(fit(pageFrames(design, 'one').bounds as Rect, viewport, undefined, insets))
      view.showPage('two')
      expect(view.camera()).toEqual(fit(pageFrames(design, 'two').bounds as Rect, viewport, undefined, insets))
    })

    it("puts the page's origin in the middle of the stage at 100% on a page with no frames", () => {
      const { view, change } = harness()
      view.resize()
      change(withPageThree(false))
      view.showPage('three')
      expect(view.camera()).toEqual({ x: 500, y: 400, zoom: 1 })
    })

    it('fits a part of the canvas, or leaves the camera without one', () => {
      const { view } = harness()
      view.resize()
      const area = { x: 100, y: 100, width: 200, height: 100 }
      view.fitArea(area)
      expect(view.camera()).toEqual(fit(area, { width: 1000, height: 800 }))
      view.fitArea(undefined)
      expect(view.camera()).toEqual(fit(area, { width: 1000, height: 800 }))
    })
  })

  describe('toggleRulers, viewChanged and onView', () => {
    it('turns the rulers on and off, and tells the view listeners until they stop listening', () => {
      const { view, log } = harness()
      const stop = view.onView(() => log.push(`listener ${view.rulers()}`))
      expect(view.rulers()).toBe(false)
      view.toggleRulers()
      expect(log).toEqual([])
      view.viewChanged()
      stop()
      view.toggleRulers()
      view.viewChanged()
      expect(log).toEqual(['listener true'])
      expect(view.rulers()).toBe(false)
    })
  })

  describe('resize', () => {
    it("matches the canvas's backing store to the screen's pixels, making the surface again only when they change", () => {
      const { view, log, canvas } = harness()
      expect(observed).toEqual(['observe'])
      view.resize()
      expect(canvas).toMatchObject({ width: 2000, height: 1600 })
      expect(view.viewport()).toEqual({ width: 1000, height: 800 })
      view.resize()
      expect(log).toEqual(['surface 2000×1600'])
      expect(view.scheduled()).toBe(true)
    })
  })

  describe('destroy', () => {
    it('stops watching the stage and the next frame, and frees what it made', () => {
      const { view, log } = harness()
      view.resize()
      view.destroy()
      runFrames()
      expect(observed).toEqual(['observe', 'disconnect'])
      expect(log).toEqual(['surface 2000×1600', 'delete surface', 'delete paint', 'delete paint', 'delete gl'])
    })
  })
})
