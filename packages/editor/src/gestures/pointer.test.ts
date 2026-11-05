import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SceneLayer } from '@dazbee/renderer'

import type { Camera } from '../canvas/camera.ts'
import type { Frame } from '../canvas/frames.ts'
import { design } from '../canvas/test-design.ts'
import { editorSelection } from '../selection.ts'
import type { Tool } from '../tools.ts'
import { editorPointer, type PointerDeps } from './pointer.ts'
import type { MoveDrag } from './select/transform-drag.ts'

const SQUARE: Frame = { id: 'one-sq', pageId: 'one', name: 'Square', x: 0, y: 0, width: 1080, height: 1080 }
/** A scene layer of a type over the first 100 pixels of the frame each way. */
const sceneLayer = (id: string, type: string) =>
  ({
    id,
    type,
    props: { x: 0, y: 0, width: 100, height: 100, rotation: 0, shape: { kind: 'rect' } },
  }) as unknown as SceneLayer
const UNDER = sceneLayer('under', 'graphic')

/** A pointer or wheel event at a client point, the left button, nothing held. */
const event = (x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
    detail: 1,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    preventDefault: () => {},
    ...extra,
  }) as unknown as PointerEvent & WheelEvent
/** A key event for a key, logging when its default is prevented. */
const key = (code: string, log: string[], extra: Record<string, unknown> = {}) =>
  ({ code, preventDefault: () => log.push(`prevent ${code}`), ...extra }) as unknown as KeyboardEvent

/** A box in client pixels, as getBoundingClientRect gives it, 24 to 4 pixels over the square's top. */
const labelBox = (left: number, width: number) => ({
  left,
  right: left + width,
  top: -24,
  bottom: -4,
  width,
  height: 20,
})
/** The square's label as the overlay draws it: its row across the frame, its name at 0–40 and its size at 1000–1080. */
const LABEL = {
  dataset: { frame: SQUARE.id },
  getBoundingClientRect: () => labelBox(0, 1080),
  children: [labelBox(0, 40), labelBox(1000, 80)].map((text) => ({ getBoundingClientRect: () => text })),
}

/**
 * The pointer on a canvas that keeps its listeners, over a stage where client points are design
 * pixels of the square frame at zoom 1, its label's name and size 24 to 4 pixels over its top, off
 * every frame past 1100 across or above it, with a real selection; every behaviour logs what it is
 * asked. With `handle`, a press anywhere is on a handle of the selection; with `editing`, that text
 * is being typed in, and a test that gives it its whole box picks it there.
 */
function harness(tool: Tool = 'select', under: SceneLayer = UNDER, handle = false, editing: string | null = null) {
  const log: string[] = []
  const listeners = new Map<string, (e: Event) => void>()
  const canvas = {
    style: { cursor: '' },
    setPointerCapture: () => {},
    addEventListener: (type: string, listener: (e: Event) => void) => listeners.set(type, listener),
  }
  let camera: Camera = { x: 0, y: 0, zoom: 1 }
  let pressed: MoveDrag | null = null
  const selection = editorSelection({ drawn: () => design, frames: () => [SQUARE], changed: () => {} })
  const deps: PointerDeps = {
    canvas: canvas as unknown as HTMLCanvasElement,
    overlay: { querySelectorAll: () => [LABEL] } as unknown as ParentNode,
    session: { design: () => design },
    view: {
      camera: () => camera,
      design: () => design,
      onStage: (client) => client,
      pointAt: (client) => (client.x > 1100 || client.y < 0 ? null : { frame: SQUARE, p: client }),
      setCamera: (next) => {
        camera = next
        log.push(`camera ${next.x} ${next.y}`)
      },
      viewport: () => ({ width: 1000, height: 800 }),
      zoomTo: (zoom, at) => log.push(`zoom ${zoom.toFixed(3)} at ${at?.x} ${at?.y}`),
      redraw: () => log.push('redraw'),
    },
    tools: { tool: () => tool, imageToPlace: () => null, snapping: () => true },
    selection,
    boxes: {
      pickAt: (_frame, p, options) => {
        if (p.x < 0 || p.y < 0 || p.x > 100 || p.y > 100) return null
        return options?.wholeBox ? sceneLayer(options.wholeBox, 'text') : under
      },
      pickable: () => true,
      selectionBox: () => null,
      cropTarget: () => null,
      target: (id) => `${id} picked`,
      lockedAt: () => null,
    },
    typing: {
      editing: () => (editing ? { id: editing, frameId: SQUARE.id } : null),
      caretFromPoint: () => 0,
      caretTo: () => {},
      selectText: () => {},
      start: (id, frame) => log.push(`type into ${id} in ${frame}`),
      stop: () => {},
    },
    pen: {
      drawing: () => false,
      down: (_e, at) => log.push(`pen down ${at.p.x} ${at.p.y}`),
      move: () => {},
      up: () => {},
      pressPoints: () => null,
      dragPoints: () => {},
      releasePoints: () => {},
    },
    cropping: { press: () => null, drag: () => {}, release: () => {} },
    drawing: {
      pressShape: () => null,
      pressImage: () => ({ kind: 'imageBox' }) as ReturnType<PointerDeps['drawing']['pressImage']>,
      pressText: () => ({ kind: 'textBox' }) as ReturnType<PointerDeps['drawing']['pressText']>,
      pressFrame: (_e, world) => {
        log.push(`frame from ${world.x} ${world.y}`)
        return { kind: 'frameDraw', from: world, to: world }
      },
      drag: (g, p) => {
        if (g.kind === 'frameDraw') log.push(`frame to ${p.x} ${p.y}`)
      },
      release: (g) => {
        if (g.kind === 'frameDraw') log.push('frame drawn')
      },
    },
    transformDrag: {
      handleUnder: () => (handle ? { kind: 'resize', handle: 'n' } : null),
      marquee: () => {},
      drag: (_g, p, _shift, _alt, snap) => log.push(`drag ${p.x} ${p.y}${snap ? ' snapped' : ''}`),
      release: () => log.push('release move'),
      clearGuides: () => {},
    },
    autoLayoutDrag: { drag: () => {}, release: () => {} },
    frameMove: {
      drag: (_g, _screen, world, shift) =>
        log.push(`move frame to ${world.x} ${world.y}${shift ? ' along one axis' : ''}`),
      release: () => log.push('release frame move'),
    },
    selectPress: {
      press: (_e, screen) => {
        log.push(`press ${screen.x} ${screen.y}`)
        // Far along, a press starts no drag, as a Shift click that takes a layer out does.
        if (screen.x > 500) return null
        pressed = { kind: 'move', frame: SQUARE, around: [] } as unknown as MoveDrag
        return pressed
      },
      pressLabel: (_e, screen, frameId) => {
        log.push(`press label of ${frameId} at ${screen.x} ${screen.y}`)
        return { kind: 'frameMove', frame: SQUARE, pressedAt: screen, from: screen, end: null }
      },
      moved: (screen) => screen.x > 20,
      clicked: () => {},
      textBeforeClicks: () => undefined,
      release: (marquee) => log.push(`release press${marquee ? ' marquee' : ''}`),
      cancel: () => log.push('cancel press'),
    },
    renameFrame: (frameId) => log.push(`rename ${frameId}`),
    signal: new AbortController().signal,
    drawOverlay: () => log.push('draw overlay'),
  }
  const pointer = editorPointer(deps)
  /** Sends the canvas an event of a type, as the browser does. */
  const send = (type: string, e: Event | PointerEvent = event(0, 0)) => listeners.get(type)?.(e)
  return { pointer, selection, log, send, cursor: () => canvas.style.cursor, pressed: () => pressed }
}

describe('editorPointer', () => {
  describe('gesture', () => {
    it('keeps the drag held when another press starts none', () => {
      const { pointer, send, log, pressed } = harness()
      send('pointerdown', event(10, 10))
      send('pointerdown', event(600, 10))
      expect(pointer.gesture()).toBe(pressed())
      send('pointerup')
      expect(log).toEqual([
        'press 10 10',
        'draw overlay',
        'press 600 10',
        'release move',
        'redraw',
        'release press',
        'draw overlay',
      ])
    })

    it("holds the select tool's drag from its press until the pointer goes up, then draws the canvas again", () => {
      const { pointer, send, log, pressed } = harness()
      send('pointerdown', event(10, 10))
      expect(pointer.gesture()).toBe(pressed())
      send('pointermove', event(15, 10))
      send('pointermove', event(30, 12))
      send('pointerup')
      expect(pointer.gesture()).toBeNull()
      expect(log).toEqual([
        'press 10 10',
        'draw overlay',
        'drag 30 12 snapped',
        'release move',
        'redraw',
        'release press',
        'draw overlay',
      ])
    })

    it('sends the press of a drawing tool to what draws with it', () => {
      const { pointer, send, log } = harness('pen')
      send('pointerdown', event(40, 50))
      expect(log).toEqual(['pen down 40 50'])
      const text = harness('text')
      text.send('pointerdown', event(40, 50))
      expect(text.pointer.gesture()).toEqual({ kind: 'textBox' })
      expect(pointer.gesture()).toBeNull()
    })

    it('sends a press of the Frame tool anywhere on the stage to drawing a frame, the drag in world units', () => {
      const { pointer, send, log, cursor } = harness('frame')
      send('wheel', event(0, 0, { deltaX: -100, deltaY: -50 }))
      pointer.showCursor()
      expect(cursor()).toBe('crosshair')
      send('pointerdown', event(1300, 70))
      expect(pointer.gesture()).toMatchObject({ kind: 'frameDraw' })
      send('pointermove', event(1500, 250))
      send('pointerup')
      expect(pointer.gesture()).toBeNull()
      expect(log).toEqual(['camera 100 50', 'frame from 1200 20', 'frame to 1400 200', 'frame drawn', 'draw overlay'])
    })
  })

  describe("a frame's label", () => {
    it('picks and moves the frame from a press on it, the drag in world units, until the pointer goes up', () => {
      const { pointer, send, log } = harness()
      send('pointerdown', event(20, -10))
      expect(pointer.gesture()).toMatchObject({ kind: 'frameMove', frame: SQUARE })
      send('pointermove', event(70, -20, { shiftKey: true }))
      send('pointerup')
      expect(pointer.gesture()).toBeNull()
      expect(log).toEqual([
        'press label of one-sq at 20 -10',
        'draw overlay',
        'move frame to 70 -20 along one axis',
        'release frame move',
        'release press',
        'draw overlay',
      ])
    })

    it('asks to rename the frame on a double click, unless panning', () => {
      const { send, log } = harness()
      send('dblclick', event(20, -10))
      expect(log).toEqual(['rename one-sq'])
      const panning = harness('hand')
      panning.send('dblclick', event(20, -10))
      expect(panning.log).toEqual([])
    })

    it('takes a press on its size too, and leaves one on its row beside its text to what is under it, so a marquee can start there', () => {
      const { pointer, send, log } = harness()
      send('pointerdown', event(1040, -10))
      expect(pointer.gesture()).toMatchObject({ kind: 'frameMove', frame: SQUARE })
      send('pointerup')
      log.length = 0
      send('pointerdown', event(600, -10))
      send('dblclick', event(600, -10))
      expect(log).toEqual(['press 600 -10'])
    })

    it("leaves a press on the selection's handles to the selection where the label is over them", () => {
      const { selection, send, log } = harness('select', UNDER, true)
      selection.select(['under'], SQUARE.id)
      send('pointerdown', event(20, -10))
      expect(log).toEqual(['press 20 -10', 'draw overlay'])
    })

    it('is left to the drawing tools, which draw nothing off a frame', () => {
      const { pointer, send, log } = harness('text')
      send('pointerdown', event(20, -10))
      expect(pointer.gesture()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('pointerAt and rehover', () => {
    it('keeps where the pointer is over the stage and outlines what a press there would pick', () => {
      const { pointer, selection, send, log } = harness()
      expect(pointer.pointerAt()).toBeNull()
      send('pointermove', event(5, 6))
      expect(pointer.pointerAt()).toEqual({ x: 5, y: 6 })
      expect(selection.hovered()).toEqual({ id: 'under picked', frameId: 'one-sq' })
      expect(log).toEqual(['draw overlay'])
      expect(pointer.rehover()).toBe(false)
      send('pointerleave')
      expect(pointer.pointerAt()).toBeNull()
      expect(selection.hovered()).toBeNull()
    })

    it('outlines the text being typed in where a press puts the caret in it, below its lines too', () => {
      const { selection, send } = harness('select', UNDER, false, 'words')
      send('pointermove', event(5, 90))
      expect(selection.hovered()).toEqual({ id: 'words picked', frameId: 'one-sq' })
    })
  })

  describe('endDrag', () => {
    it('ends the drag on the stage as a pointerup does', () => {
      const { pointer, send, log } = harness()
      send('pointerdown', event(10, 10))
      pointer.endDrag()
      expect(pointer.gesture()).toBeNull()
      expect(log.slice(2)).toEqual(['release move', 'redraw', 'release press', 'draw overlay'])
    })

    it('cancels a press whose pointer capture goes, and nothing once the press has ended', () => {
      const { send, log } = harness()
      send('pointerdown', event(10, 10))
      send('lostpointercapture')
      expect(log.slice(2)).toEqual(['cancel press', 'release move', 'redraw', 'release press', 'draw overlay'])
      log.length = 0
      send('lostpointercapture')
      expect(log).toEqual([])
    })
  })

  describe('selectAt', () => {
    it('selects what a press under a client point picks, keeping a selection it is in', () => {
      const { pointer, selection } = harness()
      expect(pointer.selectAt({ x: 5, y: 5 })).toEqual(['under picked'])
      selection.select(['under picked', 'other'], 'one-sq')
      expect(pointer.selectAt({ x: 5, y: 5 })).toEqual(['under picked', 'other'])
    })
  })

  describe('keyDown, keyUp, blur and input', () => {
    /** The page's own elements, of which the fields take keys. */
    class Element {
      readonly tagName: string
      readonly role: string | null
      readonly isContentEditable = false
      constructor(tagName: string, role: string | null = null) {
        this.tagName = tagName
        this.role = role
      }
      getAttribute(name: string) {
        return name === 'role' ? this.role : null
      }
    }
    beforeEach(() => {
      vi.stubGlobal('HTMLElement', Element)
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    /** The focus moving to a control after a key press, as Tab moves it, or after a pointer press. */
    const focusAfter = (pointer: ReturnType<typeof harness>['pointer'], by: 'keydown' | 'pointerdown') => {
      pointer.input({ type: by } as Event)
      pointer.input({ type: 'focusin' } as Event)
    }

    it('holds space to pan with a drag, until it is let go or the window loses focus', () => {
      const { pointer, send, log, cursor } = harness()
      expect(pointer.keyDown(key('KeyA', log))).toBe(false)
      expect(pointer.keyDown(key('Space', log, { ctrlKey: true }))).toBe(false)
      expect(pointer.keyDown(key('Space', log))).toBe(true)
      expect(cursor()).toBe('grab')
      send('pointerdown', event(10, 10))
      expect(cursor()).toBe('grabbing')
      send('pointermove', event(30, 25))
      send('pointerup')
      expect(cursor()).toBe('grab')
      pointer.keyUp(key('KeyA', log))
      expect(cursor()).toBe('grab')
      pointer.keyUp(key('Space', log))
      expect(cursor()).toBe('')
      pointer.keyDown(key('Space', log))
      pointer.blur()
      expect(cursor()).toBe('')
      expect(log).toEqual(['prevent Space', 'camera 20 15', 'release press', 'draw overlay', 'prevent Space'])
    })

    it('leaves space to a field, and to a control the keys moved the focus to, which it presses', () => {
      const { pointer, log, cursor } = harness()
      expect(pointer.keyDown(key('Space', log, { target: new Element('INPUT') }))).toBe(false)
      focusAfter(pointer, 'keydown')
      expect(pointer.keyDown(key('Space', log, { target: new Element('BUTTON') }))).toBe(false)
      expect(pointer.keyDown(key('Space', log, { target: new Element('DIV', 'treeitem') }))).toBe(false)
      expect(cursor()).toBe('')
      expect(log).toEqual([])
    })

    it('pans with space from a control a pointer press moved the focus to, as a menu gives its button back after a pick', () => {
      const { pointer, log, cursor } = harness()
      focusAfter(pointer, 'pointerdown')
      // A key pressed since does not move the focus.
      pointer.input({ type: 'keydown' } as Event)
      expect(pointer.keyDown(key('Space', log, { target: new Element('BUTTON') }))).toBe(true)
      expect(cursor()).toBe('grab')
      expect(log).toEqual(['prevent Space'])
    })

    it('pans with space from the edit panel, which takes the focus as it opens and is no control', () => {
      const { pointer, log, cursor } = harness()
      focusAfter(pointer, 'keydown')
      expect(pointer.keyDown(key('Space', log, { target: new Element('SECTION', 'dialog') }))).toBe(true)
      expect(cursor()).toBe('grab')
    })
  })

  describe('wheel', () => {
    it('pans with a scroll, sideways with Shift, and zooms about the pointer with Ctrl', () => {
      const { send, log } = harness()
      send('wheel', event(100, 200, { deltaX: 3, deltaY: 4 }))
      send('wheel', event(100, 200, { deltaY: 10, shiftKey: true }))
      send('wheel', event(100, 200, { deltaY: -10, ctrlKey: true }))
      expect(log).toEqual(['camera -3 -4', 'camera -13 -4', `zoom ${Math.exp(0.1).toFixed(3)} at 100 200`])
    })
  })

  describe('dblclick', () => {
    it('starts typing into the text under the pointer, selecting it', () => {
      const { selection, send, log } = harness('select', sceneLayer('words', 'text'))
      send('dblclick', event(10, 10))
      expect(selection.current()).toEqual({ ids: ['words'], frameId: 'one-sq' })
      expect(log).toEqual(['type into words in one-sq', 'draw overlay'])
    })

    it('does nothing while panning', () => {
      const { pointer, selection, send, log } = harness('hand', sceneLayer('words', 'text'))
      send('dblclick', event(10, 10))
      expect(selection.current()).toBeNull()
      expect(pointer.gesture()).toBeNull()
      expect(log).toEqual([])
    })
  })
})
