import { describe, expect, it } from 'vitest'

import type { DesignInput } from '@dazbee/schema'

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
/** The square frame's layers: a group holding a dot and a tag, a box filled with the brand's colour, a text, and an empty box. */
const SQUARE_LAYERS: DesignInput['nodes'] = {
  pair: {
    type: 'group',
    parentId: 'sq',
    link: 'pair',
    index: 'a0',
    name: 'Pair',
    props: { x: 100, y: 100, width: 230, height: 140 },
  },
  dot: { ...rect('pair', 'a0', 100, 100), link: 'dot' },
  tag: { ...rect('pair', 'a1', 300, 200), link: 'tag' },
  box: {
    ...rect('sq', 'a1', 500, 500, { fills: [{ type: 'solid', color: '#FF0000FF' }] }),
    link: 'box',
    bindings: { fill: 'brand:primary' },
  },
  words: {
    type: 'text',
    parentId: 'sq',
    link: 'words',
    index: 'a2',
    name: 'Words',
    props: { x: 0, y: 700, width: 200, height: 40, text: 'Hello', boxMode: 'fixed', style: STYLE },
  },
  holder: {
    type: 'box',
    parentId: 'sq',
    link: 'holder',
    index: 'a3',
    name: 'Holder',
    props: { x: 700, y: 100, width: 300, height: 300 },
  },
}
/** One page with a square frame holding SQUARE_LAYERS and a wide one holding a copy of each, `wide-<id>`, linked to it. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    ...SQUARE_LAYERS,
    ...Object.fromEntries(
      Object.entries(SQUARE_LAYERS).map(([id, node]) => [
        `wide-${id}`,
        { ...node, parentId: node.parentId === 'sq' ? 'wide' : `wide-${node.parentId}` },
      ]),
    ),
  },
}

/** The layer edits on a real session and selection, logging the text they fit and the families they load. */
function harness() {
  const session = sessionOf(DESIGN)
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => [], changed: () => {} })
  const done = new AbortController()
  const deps: LayerEditsDeps = {
    session,
    selection,
    resources: {
      loadFamilies: (families) => {
        log.push(`load ${families.join(',')}`)
        return families.map(() => Promise.resolve())
      },
    },
    typing: {
      fitText: (id) => log.push(`fit ${id}`),
      selectedText: () => null,
      styleRange: () => {},
    },
    signal: done.signal,
  }
  const edits = editorLayerEdits(deps)
  /** A layer's properties. */
  const props = (id: string) => session.design().nodes[id]?.props
  /** The wide frame's copies as they are now. */
  const copies = () => Object.entries(session.design().nodes).filter(([id]) => id.startsWith('wide-'))
  return { edits, session, selection, log, props, copies, destroy: () => done.abort() }
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
    it('writes on the layers given, carrying what a group holds along; their copies in the other frame stay', () => {
      const { edits, props, copies } = harness()
      const before = copies()
      expect(edits.setProps(['pair'], () => ({ x: 120 }))).toBe(true)
      expect(props('pair')).toMatchObject({ x: 120 })
      expect(props('dot')).toMatchObject({ x: 120 })
      expect(props('tag')).toMatchObject({ x: 320 })
      expect(copies()).toEqual(before)
    })

    it('skips a layer locked against the change, still writing the rest, as one undo step', () => {
      const { edits, session, props } = harness()
      session.run('node.lock', { ids: ['dot'], lock: { move: true } })
      expect(edits.setProps(['dot', 'wide-dot'], () => ({ y: 150, opacity: 0.5 }))).toBe(false)
      expect(props('dot')).toMatchObject({ y: 100, opacity: 0.5 })
      expect(props('wide-dot')).toMatchObject({ y: 150, opacity: 0.5 })
      session.undo()
      expect(props('wide-dot')).toMatchObject({ y: 100 })
      expect(props('dot')?.opacity).toBe(1)
    })

    it("gives the change each layer's own props", () => {
      const { edits, props } = harness()
      edits.setProps(['wide-dot'], () => ({ y: 150 }))
      edits.setProps(['dot', 'wide-dot'], (_id, now) => ({ y: Number(now.y) + 10 }))
      expect(props('dot')).toMatchObject({ y: 110 })
      expect(props('wide-dot')).toMatchObject({ y: 160 })
    })

    it("unbinds a fill set by hand from the brand's colour, and fits text whose words change size", () => {
      const { edits, session, log } = harness()
      edits.setProps(['box'], () => ({ fills: [{ type: 'solid', color: '#00FF00FF' }] }))
      expect(session.design().nodes.box?.bindings?.fill).toBeUndefined()
      expect(session.design().nodes['wide-box']?.bindings?.fill).toBe('brand:primary')
      edits.setProps(['words'], () => ({ style: { ...STYLE, fontSize: 30 } }))
      expect(log).toEqual(['fit words'])
    })

    it('writes nothing, and makes no undo step, for values a change leaves as they are', () => {
      const { edits, session } = harness()
      edits.setProps(['dot'], (_id, now) => ({ x: now.x }))
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('renameLayer, setLocked and setHidden', () => {
    it('renames, locks, hides and shows layers, their copies in the other frame left as they are', () => {
      const { edits, session, props, copies } = harness()
      const before = copies()
      expect(edits.renameLayer('dot', 'Spot')).toBe(true)
      expect(edits.setLocked(['dot'], true)).toBe(true)
      expect(edits.setHidden(['tag'], true)).toBe(true)
      const { nodes } = session.design()
      expect(nodes.dot?.name).toBe('Spot')
      expect(nodes.dot?.lock).toMatchObject({ move: true })
      expect(props('tag')).toMatchObject({ visible: false })
      expect(copies()).toEqual(before)
      expect(edits.setHidden(['tag'], false)).toBe(true)
      expect(props('tag')).toMatchObject({ visible: true })
    })
  })

  describe('setFont', () => {
    it('loads the family, then sets it on the selected text layers and fits them', async () => {
      const { edits, selection, props, log } = harness()
      selection.select(['words', 'dot'], 'sq')
      await edits.setFont('Inter', 700)
      expect(props('words')).toMatchObject({ style: { fontFamily: 'Inter', fontWeight: 700 } })
      expect(log).toEqual(['load Inter', 'fit words'])
    })

    it('sets nothing once the editor is gone before the family arrives, or with no text selected', async () => {
      const { edits, selection, props, log, destroy } = harness()
      await edits.setFont('Inter')
      selection.select(['words'], 'sq')
      const setting = edits.setFont('Inter')
      destroy()
      await setting
      expect(props('words')).toMatchObject({ style: { fontFamily: 'Noto Sans' } })
      expect(log).toEqual(['load Inter'])
    })
  })
})
