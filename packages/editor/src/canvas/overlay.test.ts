import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Gesture } from '../gestures/pointer.ts'
import type { Box } from '../layers/transform.ts'
import type { Picked } from '../selection.ts'
import type { Frame } from './frames.ts'
import { editorOverlay, type OverlayDeps } from './overlay.ts'
import { design } from './test-design.ts'

/** An element as the overlay builds one: its class, data, style and what it holds. */
interface Fake {
  className: string
  dataset: Record<string, string>
  style: Record<string, string>
  textContent: string
  children: Fake[]
  append(...more: Fake[]): void
}
const fake = (name = ''): Fake => ({
  className: name,
  dataset: {},
  style: {},
  textContent: '',
  children: [],
  append(...more) {
    this.children.push(...more)
  },
})
const SQUARE: Frame = { id: 'one-sq', pageId: 'one', name: 'Sale', x: 0, y: 0, width: 1080, height: 1080 }
const BOX: Box = { x: 10, y: 10, width: 100, height: 100, rotation: 0 }

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => fake() })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * The overlay at zoom 1 on a stage 1000 × 800 showing the square frame 100 px down, with a layer
 * selected (or the frame picked instead), a group gone into, a layer hovered and a drop target; each
 * module's parts are one element named for it. Logs what the overlay tells the selection, and keeps
 * what it drew.
 */
function harness(
  state: {
    gesture?: Gesture | null
    editing?: Picked | null
    selected?: boolean
    picked?: boolean
    zoom?: number
  } = {},
) {
  const log: string[] = []
  let drawn: Fake[] = []
  const editing = state.editing ?? null
  const deps: OverlayDeps = {
    overlay: {
      replaceChildren: (...parts: Fake[]) => {
        drawn = parts
        log.push('replace')
      },
    } as unknown as HTMLElement,
    view: {
      camera: () => ({ x: 0, y: 100, zoom: state.zoom ?? 1 }),
      viewport: () => ({ width: 1000, height: 800 }),
      design: () => design,
      inView: () => [SQUARE],
      frameOf: (key) => (key === SQUARE.id ? SQUARE : undefined),
      rulers: () => false,
      outline: (className) => fake(className) as unknown as HTMLElement,
    },
    selection: {
      current: () => (state.selected === false ? null : { ids: ['a'], frameId: 'one-sq' }),
      entered: () => 'g',
      hovered: () => ({ id: 'h', frameId: 'one-sq' }),
      pickedFrame: () => (state.picked ? 'one-sq' : null),
      cropping: () => null,
      pathEditing: () => null,
      tellListeners: () => log.push('tell listeners'),
    },
    boxes: {
      selectionBox: () =>
        state.selected === false ? null : { frame: SQUARE, box: BOX, drawn: BOX, around: [] as Box[] },
      drawnBoxOf: () => BOX,
      handlesFor: () => ['nw'],
    },
    typing: { editing: () => editing, parts: () => [fake('caret') as unknown as HTMLElement] },
    pen: { parts: () => [fake('pen') as unknown as HTMLElement] },
    cropping: { parts: () => [fake('crop') as unknown as HTMLElement] },
    drawing: { parts: () => [fake('drawing') as unknown as HTMLElement] },
    transformDrag: { parts: (g) => [fake(g ? 'marquee' : 'guides') as unknown as HTMLElement] },
    autoLayoutDrag: { parts: (g) => [fake(g ? 'reorder' : 'flow') as unknown as HTMLElement] },
    place: { dropTarget: () => ({ id: 't', frameId: 'one-sq' }) },
    pointer: { gesture: () => state.gesture ?? null },
  }
  const overlay = editorOverlay(deps)
  /** The part drawn with a class. */
  const part = (className: string) => drawn.find((p) => p.className === className)
  return { overlay, log, drawn: () => drawn.map((p) => p.className), part }
}

describe('editorOverlay', () => {
  describe('draw', () => {
    it("draws each module's parts in order, then tells the selection's listeners", () => {
      const { overlay, log, drawn } = harness()
      overlay.draw()
      expect(drawn()).toEqual([
        'frame-label',
        'entered',
        'hover',
        'drop-target',
        'selection',
        'selection-size',
        'pen',
        'crop',
        'flow',
        'guides',
        'caret',
      ])
      expect(log).toEqual(['replace', 'tell listeners'])
    })

    it('outlines the picked frame after the labels, its own label lit', () => {
      const { overlay, drawn, part } = harness({ selected: false, picked: true })
      overlay.draw()
      expect(drawn().slice(0, 3)).toEqual(['frame-label', 'frame-picked', 'hover'])
      expect(part('frame-picked')?.dataset).toEqual({ frame: 'one-sq' })
      expect(part('frame-label')?.dataset).toEqual({ frame: 'one-sq', active: '' })
    })

    it("outlines no hovered layer while a gesture runs, and shows a drawing's parts before the marquee's", () => {
      const { overlay, drawn } = harness({ gesture: { kind: 'textBox' } as Gesture })
      overlay.draw()
      expect(drawn()).toEqual([
        'frame-label',
        'entered',
        'drop-target',
        'selection',
        'selection-size',
        'pen',
        'crop',
        'flow',
        'drawing',
        'guides',
        'caret',
      ])
    })

    it('labels each frame in view over its top with its own name and size, by its id, lit while its layer is selected', () => {
      const { overlay, part } = harness()
      overlay.draw()
      const label = part('frame-label')
      expect(label?.dataset).toEqual({ frame: 'one-sq', active: '' })
      expect(label?.style).toEqual({ left: '8px', top: '76px', width: '1072px' })
      expect(label?.children.map((c) => `${c.className} ${c.textContent}`)).toEqual([
        'frame-name Sale',
        'frame-size 1080 × 1080',
      ])
    })

    it('keeps a narrow frame its name, without the size, however narrow it is on screen', () => {
      for (const zoom of [0.1, 0.02]) {
        const { overlay, part } = harness({ zoom })
        overlay.draw()
        expect(part('frame-label')?.children.map((c) => `${c.className} ${c.textContent}`)).toEqual(['frame-name Sale'])
      }
    })

    it('gives the selection its handles and size, and leaves them off while text is typed into', () => {
      const shown = harness()
      shown.overlay.draw()
      expect(shown.part('selection')?.dataset).toEqual({ frame: 'one-sq', count: '1', layer: 'a' })
      expect(shown.part('selection')?.children.map((h) => `${h.className} ${h.dataset.handle}`)).toEqual(['handle nw'])
      expect(shown.part('selection-size')?.textContent).toBe('100 × 100')
      const typing = harness({ editing: { id: 'a', frameId: 'one-sq' } })
      typing.overlay.draw()
      expect(typing.part('selection')?.children).toEqual([])
      expect(typing.drawn()).not.toContain('selection-size')
    })
  })

  describe('labelRect', () => {
    it("is where a shown frame's label is drawn on the stage, none for a frame not shown", () => {
      const { overlay } = harness()
      expect(overlay.labelRect('one-sq')).toEqual({ x: 8, y: 76, width: 1072, height: 20 })
      expect(overlay.labelRect('gone')).toBeNull()
    })
  })

  describe('selectionRect', () => {
    it('is the box round the selection and the size label under it, the box alone while typing, none with nothing selected', () => {
      expect(harness().overlay.selectionRect()).toEqual({ x: 10, y: 110, width: 100, height: 128 })
      expect(harness({ editing: { id: 'a', frameId: 'one-sq' } }).overlay.selectionRect()).toEqual({
        x: 10,
        y: 110,
        width: 100,
        height: 100,
      })
      expect(harness({ selected: false }).overlay.selectionRect()).toBeNull()
    })
  })
})
