import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasKit, SkPicture } from '@dazbee/canvaskit'
import type { Design } from '@dazbee/schema'

import { fit } from './camera.ts'
import { frameGrid } from './grid.ts'
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

describe('editorView', () => {
  describe('design, frames, frameOf and firstPage', () => {
    it('reads the design and lays out its frames as it opens', () => {
      const { view } = harness()
      expect(view.design()).toBe(design)
      expect(view.frames()).toEqual(frameGrid(design).frames)
      expect(view.frameOf('two/mpu')).toMatchObject({ pageId: 'two', formatId: 'mpu' })
      expect(view.frameOf('two/gone')).toBeUndefined()
      expect(view.firstPage()).toBe('one')
    })
  })

  describe('middleFrame', () => {
    it('finds the frame in the middle of the view', () => {
      const { view } = harness()
      view.resize()
      view.setCamera({ x: 500 - 540, y: 400 - 540, zoom: 1 })
      expect(view.middleFrame()?.key).toBe('one/sq')
      view.setCamera({ x: 500 - 1200, y: 0, zoom: 1 })
      expect(view.middleFrame()).toBeUndefined()
    })
  })

  describe('onStage, pointAt and spotAt', () => {
    it('reads a client point on the stage, and the frame and design pixel under it', () => {
      const { view } = harness()
      view.setCamera({ x: 100, y: 50, zoom: 2 })
      expect(view.onStage({ x: 110, y: 60 })).toEqual({ x: 100, y: 50 })
      expect(view.pointAt({ x: 130, y: 80 })).toMatchObject({ frame: { key: 'one/sq' }, p: { x: 10, y: 10 } })
      expect(view.spotAt({ x: 130, y: 80 })).toEqual({ frame: 'one/sq', x: 10, y: 10 })
      expect(view.spotAt({ x: 0, y: 0 })).toBeNull()
    })
  })

  describe('defaultFrame and screenPoint', () => {
    it('finds a page in a format, the first page in the primary format by default, and where its pixels are on screen', () => {
      const { view } = harness()
      expect(view.defaultFrame()).toMatchObject({ pageId: 'one', formatId: 'sq' })
      expect(view.defaultFrame('two', 'mpu').key).toBe('two/mpu')
      expect(() => view.defaultFrame('two', 'gone')).toThrow('no frame for page "two" in format "gone"')
      view.setCamera({ x: 100, y: 50, zoom: 2 })
      const { x, y } = view.defaultFrame('two', 'mpu')
      expect(view.screenPoint(5, 6, 'two', 'mpu')).toEqual({ x: 10 + 100 + (x + 5) * 2, y: 10 + 50 + (y + 6) * 2 })
      const first = view.defaultFrame()
      expect(view.screenPoint(0, 0)).toEqual({ x: 10 + 100 + first.x * 2, y: 10 + 50 + first.y * 2 })
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
      view.placeBox(el, view.frameOf('one/sq') as never, { x: 5, y: 5, width: 50, height: 25 })
      expect(el.style).toMatchObject({ left: '20px', top: '30px', width: '100px', height: '50px' })
    })
  })

  describe('update', () => {
    it('reads the design again, and shows every format when the one shown alone is gone', () => {
      const { view, change } = harness()
      view.focus('story')
      expect(view.frames().map((f) => f.key)).toEqual(['one/story', 'two/story'])
      const formats = Object.fromEntries(Object.entries(design.formats).filter(([id]) => id !== 'story'))
      const without = { ...design, formats }
      change(without)
      expect(view.design()).toBe(design)
      view.update()
      expect(view.design()).toBe(without)
      expect(view.focused()).toBeNull()
      expect(view.frames()).toHaveLength(4)
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
      expect(asked).toEqual(['one/sq', 'one/story'])
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
        'picture one/sq',
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

  describe('fitAll, fitArea and fitPage', () => {
    it('fits every frame, clear of the insets, with room for the chip when a format shows alone', () => {
      const { view } = harness()
      view.resize()
      const insets = { top: 40, right: 0, bottom: 72, left: 0 }
      view.setInsets(insets)
      view.fitAll()
      const viewport = { width: 1000, height: 800 }
      expect(view.camera()).toEqual(fit(frameGrid(design).bounds, viewport, undefined, insets))
      view.focus('mpu')
      view.fitAll()
      expect(view.camera()).toEqual(fit(frameGrid(design, 'mpu').bounds, viewport, 104, insets))
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

    it('fits every format of one page', () => {
      const { view } = harness()
      view.resize()
      view.fitPage('two')
      const row = frameGrid(design).frames.filter((f) => f.pageId === 'two')
      const last = row.at(-1)
      const first = row[0]
      if (!first || !last) throw new Error('no row')
      expect(view.camera()).toEqual(
        fit(
          { x: 0, y: first.y, width: last.x + last.width, height: Math.max(...row.map((f) => f.height)) },
          { width: 1000, height: 800 },
        ),
      )
      const before = view.camera()
      view.fitPage('gone')
      expect(view.camera()).toEqual(before)
    })
  })

  describe('focus and focused', () => {
    it('shows one format alone, or every one again', () => {
      const { view } = harness()
      view.focus('mpu')
      expect(view.focused()).toBe('mpu')
      expect(view.frames().map((f) => f.key)).toEqual(['one/mpu', 'two/mpu'])
      view.focus('gone')
      expect(view.focused()).toBeNull()
      expect(view.frames()).toHaveLength(6)
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
