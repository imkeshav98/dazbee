import { describe, expect, it } from 'vitest'

import { mergedProps } from '@dazbee/doc'
import type { DesignInput } from '@dazbee/schema'

import type { Frame } from './canvas/frames.ts'
import { editorLayerEdits, type LayerEditsDeps } from './layer-edits.ts'
import { sessionOf } from './layers/test-boxes.ts'
import { editorSelection } from './selection.ts'

const STYLE = { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' }
const rect = (parentId: string, index: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { x, y, width: 30, height: 40, shape: { kind: 'rect' as const }, fills: [], ...extra },
})
/**
 * One page in a square and a wide format: a group holding a dot and a tag, a box filled with the
 * brand's colour, a text, and an empty box.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    wide: { name: 'Wide', width: 1200, height: 628, order: 'a1' },
  },
  pages: { p1: { name: 'One', order: 'a0' } },
  nodes: {
    pair: {
      type: 'group',
      parentId: 'p1',
      index: 'a0',
      name: 'Pair',
      props: { x: 100, y: 100, width: 230, height: 140 },
    },
    dot: rect('pair', 'a0', 100, 100),
    tag: rect('pair', 'a1', 300, 200),
    box: {
      ...rect('p1', 'a1', 500, 500, { fills: [{ type: 'solid', color: '#FF0000FF' }] }),
      bindings: { fill: 'brand:primary' },
    },
    words: {
      type: 'text',
      parentId: 'p1',
      index: 'a2',
      name: 'Words',
      props: { x: 0, y: 700, width: 200, height: 40, text: 'Hello', boxMode: 'fixed', style: STYLE },
    },
    holder: {
      type: 'box',
      parentId: 'p1',
      index: 'a3',
      name: 'Holder',
      props: { x: 700, y: 100, width: 300, height: 300 },
    },
  },
}
const frame = (formatId: string) =>
  ({ key: `p1/${formatId}`, pageId: 'p1', formatId, x: 0, y: 0, width: 1080, height: 1080 }) as Frame

/** The layer edits on a real session and selection, logging the text they fit and the families they load. */
function harness() {
  const session = sessionOf(DESIGN)
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => [], changed: () => {} })
  const done = new AbortController()
  const deps: LayerEditsDeps = {
    session,
    view: { defaultFrame: (_pageId, formatId) => frame(formatId ?? 'sq') },
    selection,
    resources: {
      loadFamilies: (families) => {
        log.push(`load ${families.join(',')}`)
        return families.map(() => Promise.resolve())
      },
    },
    typing: {
      fitText: (id, only) => log.push(`fit ${id}${only ? ` in ${only}` : ''}`),
      selectedText: () => null,
      styleRange: () => {},
    },
    actions: {
      hideInEveryFormat: (ids, hidden) => {
        log.push(`hide ${ids.join(' ')} everywhere ${hidden}`)
        return true
      },
    },
    signal: done.signal,
  }
  const edits = editorLayerEdits(deps)
  /** A layer's properties in a format. */
  const props = (id: string, formatId = 'sq') => mergedProps(session.design(), `format:${formatId}`, id)
  return { edits, session, selection, log, props, destroy: () => done.abort() }
}

describe('editorLayerEdits', () => {
  describe('moveLayer', () => {
    it('moves a layer into a box as one undo step, the group it left fitting what it holds again', () => {
      const { edits, session } = harness()
      expect(edits.moveLayer('tag', 'holder')).toBe(true)
      const { nodes } = session.design()
      expect(nodes.tag?.parentId).toBe('holder')
      expect(nodes.pair?.props).toMatchObject({ x: 100, y: 100, width: 30, height: 40 })
      session.undo()
      expect(session.design().nodes.tag?.parentId).toBe('pair')
    })

    it('refuses a move into the layer itself', () => {
      const { edits } = harness()
      expect(edits.moveLayer('pair', 'dot')).toBe(false)
    })
  })

  describe('setProps', () => {
    it('writes in this format only, as overrides, carrying what a group holds along', () => {
      const { edits, props } = harness()
      expect(edits.setProps(['pair'], () => ({ x: 120 }), false)).toBe(true)
      expect(props('pair')).toMatchObject({ x: 120 })
      expect(props('dot')).toMatchObject({ x: 120 })
      expect(props('tag')).toMatchObject({ x: 320 })
      expect(props('dot', 'wide')).toMatchObject({ x: 100 })
    })

    it("writes in every format, taking the layers' own values of those properties away", () => {
      const { edits, session, props } = harness()
      edits.setProps(['dot'], () => ({ y: 150 }), false, 'p1', 'wide')
      expect(props('dot', 'wide')).toMatchObject({ y: 150 })
      edits.setProps(['dot'], () => ({ y: 160 }), true)
      expect(props('dot')).toMatchObject({ y: 160 })
      expect(props('dot', 'wide')).toMatchObject({ y: 160 })
      expect(session.design().overrides['format:wide']?.dot?.y).toBeUndefined()
    })

    it("unbinds a fill set by hand from the brand's colour, and fits text whose words change size", () => {
      const { edits, session, log } = harness()
      edits.setProps(['box'], () => ({ fills: [{ type: 'solid', color: '#00FF00FF' }] }), true)
      expect(session.design().nodes.box?.bindings?.fill).toBeUndefined()
      edits.setProps(['words'], () => ({ text: 'Hello there' }), false)
      expect(log).toEqual(['fit words in sq'])
    })

    it('writes nothing, and makes no undo step, for values a change leaves as they are', () => {
      const { edits, session } = harness()
      edits.setProps(['dot'], (_id, now) => ({ x: now.x }), false)
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('renameLayer, setLocked and setHidden', () => {
    it('renames, locks and hides layers, in one format or every one', () => {
      const { edits, session, props, log } = harness()
      expect(edits.renameLayer('dot', 'Spot')).toBe(true)
      expect(edits.setLocked(['dot'], true)).toBe(true)
      expect(edits.setHidden(['tag'], true, 'p1', 'wide')).toBe(true)
      expect(edits.setHidden(['tag'], true, undefined, undefined, true)).toBe(true)
      const { nodes } = session.design()
      expect(nodes.dot?.name).toBe('Spot')
      expect(nodes.dot?.lock).toMatchObject({ move: true })
      expect(props('tag', 'wide')).toMatchObject({ visible: false })
      expect(props('tag')).not.toMatchObject({ visible: false })
      expect(log).toEqual(['hide tag everywhere true'])
    })
  })

  describe('resetOwn', () => {
    it("gives layers back every format's values in one format, fitting their text there", () => {
      const { edits, props, log } = harness()
      edits.setProps(['words'], () => ({ y: 10 }), false, 'p1', 'wide')
      log.length = 0
      expect(edits.resetOwn(['words'], 'format:wide')).toBe(true)
      expect(props('words', 'wide')).toMatchObject({ y: 700 })
      expect(log).toEqual(['fit words in wide'])
    })
  })

  describe('setFont', () => {
    it('loads the family, then sets it on the selected text layers and fits them', async () => {
      const { edits, selection, props, log } = harness()
      selection.select(['words', 'dot'], 'p1/sq')
      await edits.setFont('Inter', 700)
      expect(props('words')).toMatchObject({ style: { fontFamily: 'Inter', fontWeight: 700 } })
      expect(log).toEqual(['load Inter', 'fit words'])
    })

    it('sets nothing once the editor is gone before the family arrives, or with no text selected', async () => {
      const { edits, selection, props, log, destroy } = harness()
      await edits.setFont('Inter')
      selection.select(['words'], 'p1/sq')
      const setting = edits.setFont('Inter')
      destroy()
      await setting
      expect(props('words')).toMatchObject({ style: { fontFamily: 'Noto Sans' } })
      expect(log).toEqual(['load Inter'])
    })
  })
})
