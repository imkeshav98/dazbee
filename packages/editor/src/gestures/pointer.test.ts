import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SceneLayer } from '@dazbee/renderer'

import type { Camera } from '../canvas/camera.ts'
import type { Frame } from '../canvas/grid.ts'
import { design } from '../canvas/test-design.ts'
import { editorSelection } from '../selection.ts'
import type { Tool } from '../tools.ts'
import { editorPointer, type PointerDeps } from './pointer.ts'
import type { MoveDrag } from './transform-drag.ts'

const SQUARE = { key: 'one/sq', pageId: 'one', formatId: 'sq', x: 0, y: 0, width: 1080, height: 1080 } as Frame
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

/**
 * The pointer on a canvas that keeps its listeners, over a stage where client points are design
 * pixels of the square frame at zoom 1, with a real selection; every behaviour logs what it is asked.
 */
function harness(tool: Tool = 'select', under: SceneLayer = UNDER) {
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
    session: { design: () => design },
    view: {
      camera: () => camera,
      design: () => design,
      onStage: (client) => client,
      pointAt: (client) => ({ frame: SQUARE, p: client }),
      setCamera: (next) => {
        camera = next
        log.push(`camera ${next.x} ${next.y}`)
      },
      viewport: () => ({ width: 1000, height: 800 }),
      zoomTo: (zoom, at) => log.push(`zoom ${zoom.toFixed(3)} at ${at?.x} ${at?.y}`),
    },
    tools: { tool: () => tool, imageToPlace: () => null, snapping: () => true },
    selection,
    scenes: { scene: () => ({ layers: [under] }) as unknown as ReturnType<PointerDeps['scenes']['scene']> },
    boxes: {
      pickable: () => true,
      selectionBox: () => null,
      cropTarget: () => null,
      target: (id) => `${id} picked`,
      lockedAt: () => null,
    },
    typing: {
      editing: () => null,
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
      drag: () => {},
      release: () => {},
    },
    transformDrag: {
      handleUnder: () => null,
      marquee: () => {},
      drag: (_g, p, _shift, _alt, snap) => log.push(`drag ${p.x} ${p.y}${snap ? ' snapped' : ''}`),
      release: () => log.push('release move'),
      clearGuides: () => {},
    },
    autoLayoutDrag: { drag: () => {}, release: () => {} },
    selectPress: {
      press: (_e, screen) => {
        log.push(`press ${screen.x} ${screen.y}`)
        // Far along, a press starts no drag, as a Shift click that takes a layer out does.
        if (screen.x > 500) return null
        pressed = { kind: 'move', frame: SQUARE, around: [] } as unknown as MoveDrag
        return pressed
      },
      moved: (screen) => screen.x > 20,
      release: (marquee) => log.push(`release press${marquee ? ' marquee' : ''}`),
      cancel: () => log.push('cancel press'),
    },
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
        'release press',
        'draw overlay',
      ])
    })

    it("holds the select tool's drag from its press until the pointer goes up", () => {
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
  })

  describe('pointerAt and rehover', () => {
    it('keeps where the pointer is over the stage and outlines what a press there would pick', () => {
      const { pointer, selection, send, log } = harness()
      expect(pointer.pointerAt()).toBeNull()
      send('pointermove', event(5, 6))
      expect(pointer.pointerAt()).toEqual({ x: 5, y: 6 })
      expect(selection.hovered()).toEqual({ id: 'under picked', frame: 'one/sq' })
      expect(log).toEqual(['draw overlay'])
      expect(pointer.rehover()).toBe(false)
      send('pointerleave')
      expect(pointer.pointerAt()).toBeNull()
      expect(selection.hovered()).toBeNull()
    })
  })

  describe('endDrag', () => {
    it('ends the drag on the stage as a pointerup does', () => {
      const { pointer, send, log } = harness()
      send('pointerdown', event(10, 10))
      pointer.endDrag()
      expect(pointer.gesture()).toBeNull()
      expect(log.slice(2)).toEqual(['release move', 'release press', 'draw overlay'])
    })

    it('cancels a press whose pointer capture goes, and nothing once the press has ended', () => {
      const { send, log } = harness()
      send('pointerdown', event(10, 10))
      send('lostpointercapture')
      expect(log.slice(2)).toEqual(['cancel press', 'release move', 'release press', 'draw overlay'])
      log.length = 0
      send('lostpointercapture')
      expect(log).toEqual([])
    })
  })

  describe('selectAt', () => {
    it('selects what a press under a client point picks, keeping a selection it is in', () => {
      const { pointer, selection } = harness()
      expect(pointer.selectAt({ x: 5, y: 5 })).toEqual(['under picked'])
      selection.select(['under picked', 'other'], 'one/sq')
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
      expect(selection.current()).toEqual({ ids: ['words'], frame: 'one/sq' })
      expect(log).toEqual(['type into words in one/sq', 'draw overlay'])
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
