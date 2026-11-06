import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Design } from '@dazbee/schema'

import type { Gesture } from '../gestures/pointer.ts'
import type { Box } from '../layers/transform.ts'
import type { Picked } from '../selection.ts'
import { pairsIn } from '../selection.ts'
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
  /** Its width as laid out: every part is 70 px wide. */
  offsetWidth: number
  append(...more: Fake[]): void
}
const fake = (name = ''): Fake => ({
  className: name,
  dataset: {},
  style: {},
  textContent: '',
  children: [],
  offsetWidth: 70,
  append(...more) {
    this.children.push(...more)
  },
})
const SQUARE: Frame = { id: 'one-sq', pageId: 'one', name: 'Sale', x: 0, y: 0, width: 1080, height: 1080 }
const STORY: Frame = { id: 'one-story', pageId: 'one', name: 'Story', x: 1280, y: 0, width: 1080, height: 1920 }
/** A layer whose link id the story, the MPU (off the stage) and a frame of page two hold too. */
const linkedDesign = (() => {
  const layer = (parentId: string) => ({
    type: 'graphic' as const,
    parentId,
    link: 'a',
    index: 'a0',
    name: 'A',
    props: { x: 10, y: 10, width: 100, height: 100, shape: { kind: 'rect' as const } },
  })
  const parsed = Design.parse({
    ...design,
    nodes: { a: layer('one-sq'), 'story-a': layer('one-story'), 'mpu-a': layer('one-mpu'), 'two-a': layer('two-sq') },
  })
  return parsed
})()
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
    lit?: boolean
    renaming?: boolean
    zoom?: number
    /** Where the page's origin is on the stage, across and down. */
    x?: number
    y?: number
    /** The stage's edges floating chrome covers. */
    insets?: { top: number; right: number; bottom: number; left: number }
    /** The design holds linked copies of the selected layer, and the story is in view too. */
    linked?: boolean
    /** The MPU's copy is selected too. */
    across?: boolean
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
      camera: () => ({ x: state.x ?? 0, y: state.y ?? 100, zoom: state.zoom ?? 1 }),
      viewport: () => ({ width: 1000, height: 800 }),
      insets: () => state.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
      design: () => (state.linked ? linkedDesign : design),
      inView: () => (state.linked ? [SQUARE, STORY] : [SQUARE]),
      frameOf: (key) => (key === SQUARE.id ? SQUARE : undefined),
      rulers: () => false,
      outline: (className) => fake(className) as unknown as HTMLElement,
    },
    selection: {
      current: () =>
        state.selected === false
          ? null
          : [...pairsIn('one-sq', ['a']), ...(state.across ? pairsIn('one-mpu', ['mpu-a']) : [])],
      entered: () => 'g',
      hovered: () => ({ id: 'h', frameId: 'one-sq' }),
      pickedFrame: () => (state.picked ? 'one-sq' : null),
      litFrame: () => (state.lit ? 'one-sq' : null),
      renamingFrame: () => (state.renaming ? 'one-sq' : null),
      cropping: () => null,
      pathEditing: () => null,
      tellListeners: () => log.push('tell listeners'),
    },
    boxes: {
      selectionBox: () =>
        state.selected === false ? null : { frame: SQUARE, box: BOX, drawn: BOX, around: [] as Box[] },
      selectionBoxes: () =>
        state.selected === false ? [] : [{ frame: SQUARE, box: BOX, drawn: BOX, around: [] as Box[] }],
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

    it('outlines the frame lit from outside the stage round the whole of it, after the labels, its own label lit', () => {
      const { overlay, drawn, part } = harness({ selected: false, lit: true })
      overlay.draw()
      expect(drawn().slice(0, 3)).toEqual(['frame-label', 'frame-lit', 'hover'])
      expect(part('frame-lit')?.dataset).toEqual({ frame: 'one-sq' })
      expect(part('frame-label')?.dataset).toEqual({ frame: 'one-sq', lit: '' })
      const unlit = harness({ selected: false })
      unlit.overlay.draw()
      expect(unlit.drawn()).not.toContain('frame-lit')
      expect(unlit.part('frame-label')?.dataset).toEqual({ frame: 'one-sq' })
    })

    it('leaves out the label of the frame the page renames in its place, outlining the frame still', () => {
      const { overlay, drawn } = harness({ selected: false, picked: true, renaming: true })
      overlay.draw()
      expect(drawn().slice(0, 2)).toEqual(['frame-picked', 'hover'])
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

    it('outlines the selected layer’s linked copies in the frames in view, dashed, before the selection', () => {
      const { overlay, drawn, part } = harness({ linked: true })
      overlay.draw()
      expect(drawn().filter((name) => name === 'linked-copy')).toHaveLength(1)
      expect(part('linked-copy')?.dataset).toEqual({ layer: 'story-a', frame: 'one-story' })
      expect(drawn().indexOf('linked-copy')).toBeLessThan(drawn().indexOf('selection'))
      // A copy selected too has none, and the copy of both selected layers has one.
      const across = harness({ linked: true, across: true })
      across.overlay.draw()
      expect(across.drawn().filter((name) => name === 'linked-copy')).toHaveLength(1)
      const none = harness({ linked: true, selected: false })
      none.overlay.draw()
      expect(none.drawn()).not.toContain('linked-copy')
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

    describe('the size', () => {
      type Insets = { top: number; right: number; bottom: number; left: number }
      /**
       * Where the size is on the stage, with the page's origin at `x`, `y`: the selection 100 px
       * square from 10 px in (times the zoom), its size 70 px wide; the stage 1000 × 800.
       */
      const sizeAt = ({ insets, ...camera }: { x?: number; y?: number; zoom?: number; insets?: Insets }) => {
        const { overlay, part } = harness({ ...camera, ...(insets && { insets }) })
        overlay.draw()
        return part('selection-size')?.style
      }
      const leftOf = (x: number, insets?: Insets) => sizeAt({ x, ...(insets && { insets }) })?.left
      const topOf = (y: number, rest: { zoom?: number; insets?: Insets } = {}) => sizeAt({ y, ...rest })?.top
      const NONE = { top: 0, right: 0, bottom: 0, left: 0 }

      it('centres under the selection, kept inside the stage by 8 px at either edge', () => {
        expect(leftOf(0)).toBe('25px')
        expect(leftOf(-50)).toBe('8px')
        expect(leftOf(900)).toBe('922px')
      })

      it('keeps clear of the chrome along either side', () => {
        expect(leftOf(0, { ...NONE, left: 72 })).toBe('72px')
        expect(leftOf(880, { ...NONE, right: 72 })).toBe('858px')
      })

      it('stays clear of the chrome while any of the selection is on the stage, and goes off the stage with it', () => {
        expect(leftOf(-80, { ...NONE, left: 72 })).toBe('72px')
        expect(leftOf(-200)).toBe('-175px')
        expect(leftOf(1000)).toBe('1025px')
      })

      it('goes wholly off the stage with a selection narrower than itself', () => {
        // 10 px wide at a tenth: from 1001 px, and up to -9 px.
        expect(sizeAt({ x: 1000, zoom: 0.1 })?.left).toBe('1000px')
        expect(sizeAt({ x: -20, zoom: 0.1 })?.left).toBe('-70px')
      })

      it('goes under the selection, over it when the chrome along the bottom would cover it', () => {
        // The selection's bottom at 680 px: room under it for the dock, not for a phone's dock and tab bar.
        expect(topOf(570)).toBe('688px')
        expect(topOf(570, { insets: { ...NONE, bottom: 121 } })).toBe('554px')
      })

      it('keeps over the chrome along the bottom when the selection is beside it, and under the chrome along the top', () => {
        // From 740 px, in a phone's dock and tab bar 121 px tall.
        expect(topOf(730, { insets: { ...NONE, bottom: 121 } })).toBe('655px')
        // Down to 16 px, under the islands 60 px tall.
        expect(topOf(-94, { insets: { ...NONE, top: 60 } })).toBe('60px')
      })

      it('stays on the stage, over the selection, when the selection is taller than the stage', () => {
        // From -40 px to 960 px at ten times.
        expect(topOf(-140, { zoom: 10 })).toBe('704px')
      })

      it('goes wholly off the stage with a selection above or below it', () => {
        expect(topOf(-115)).toBe('-20px')
        expect(topOf(800)).toBe('800px')
      })
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

  describe('labelRect', () => {
    it("is where a shown frame's label is drawn on the stage, none for a frame not shown", () => {
      const { overlay } = harness()
      expect(overlay.labelRect('one-sq')).toEqual({ x: 8, y: 76, width: 1072, height: 20 })
      expect(overlay.labelRect('gone')).toBeNull()
    })
  })
})
