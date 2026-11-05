import { describe, expect, it } from 'vitest'

import type { CanvasKit } from '@dazbee/canvaskit'
import { loadDesign, openSession } from '@dazbee/doc'
import type { Scene } from '@dazbee/renderer'
import { type DesignInput, parseDesign } from '@dazbee/schema'

import type { Frame } from '../canvas/frames.ts'
import type { RunStyle } from './text-edit.ts'
import { editorTyping, type TypingDeps } from './typing.ts'

const STYLE = { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' }
const TITLE = { x: 10, y: 10, width: 200, height: 40, text: 'Hello', boxMode: 'fixed' as const, style: STYLE }
const LABEL = { x: 10, y: 80, width: 20, height: 24, text: 'Hi', boxMode: 'autoWidth' as const, style: STYLE }
/**
 * One page with a square frame and a wide one, each with its copy of a text in a fixed box and of
 * one that grows with its words, twice as big in the wide frame.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    title: { type: 'text', parentId: 'sq', link: 'title', index: 'a0', name: 'Title', props: TITLE },
    label: { type: 'text', parentId: 'sq', link: 'label', index: 'a1', name: 'Label', props: LABEL },
    'wide-title': { type: 'text', parentId: 'wide', link: 'title', index: 'a0', name: 'Title', props: TITLE },
    'wide-label': {
      type: 'text',
      parentId: 'wide',
      link: 'label',
      index: 'a1',
      name: 'Label',
      props: { ...LABEL, style: { ...STYLE, fontSize: 40 } },
    },
  },
}
const FRAMES: Frame[] = [
  { id: 'sq', pageId: 'p1', name: 'Square', x: 0, y: 0, width: 1080, height: 1080 },
  { id: 'wide', pageId: 'p1', name: 'Wide', x: 1280, y: 0, width: 1200, height: 628 },
]

/** A key as the keyboard sends it, which records whether the editor took it. */
function keyEvent(key: string, mods: { mod?: boolean; shift?: boolean } = {}) {
  const event = {
    key,
    code: '',
    metaKey: false,
    ctrlKey: mods.mod ?? false,
    shiftKey: mods.shift ?? false,
    altKey: false,
    taken: false,
    preventDefault() {
      event.taken = true
    },
  }
  return event
}

/** A clipboard event holding `pasted` as plain text, which records what was put on it. */
function clipboardEvent(pasted = '') {
  const data = new Map([['text/plain', pasted]])
  const event = {
    taken: false,
    clipboardData: {
      getData: (type: string) => data.get(type) ?? '',
      setData: (type: string, value: string) => data.set(type, value),
    },
    preventDefault() {
      event.taken = true
    },
    put: () => data.get('text/plain'),
  }
  return event
}

/** Typing over the design on a real session, its scenes the document's layers, logging what it tells. */
function harness() {
  const parsed = parseDesign(DESIGN)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  const doc = loadDesign(parsed.design)
  const session = openSession(doc)
  const log: string[] = []
  const deps: TypingDeps = {
    ck: {} as CanvasKit,
    doc,
    session,
    resources: { bytes: () => ({ fonts: [], fallbackFamilies: [], images: {} }) },
    scenes: {
      scene: () =>
        ({
          layers: Object.entries(session.design().nodes).map(([id, node]) => ({ ...node, id, children: [] })),
        }) as unknown as Scene,
      // Half the font size a character, a line 1.2 times it.
      measure: () => (props) => ({
        width: (props.text.length * props.style.fontSize) / 2,
        height: props.style.fontSize * 1.2,
      }),
      layout: () => {
        throw new Error('nothing is laid out in these tests')
      },
    },
    frameOf: (key) => FRAMES.find((f) => f.id === key),
    hug: (ids) => log.push(`hug ${ids.join(',')}`),
    placeBox: () => {},
    textSelectionChanged: () => log.push('text selection'),
    drawOverlay: () => log.push('draw'),
  }
  const typing = editorTyping(deps)
  const textOf = (id: string) => {
    const node = session.design().nodes[id]
    return node?.type === 'text' ? node.props.text : undefined
  }
  /** Presses keys in turn. */
  const type = (...keys: string[]) => keys.map((key) => typing.key(keyEvent(key) as unknown as KeyboardEvent))
  return { typing, session, log, textOf, type }
}

describe('editorTyping', () => {
  it('types into nothing until typing starts', () => {
    const { typing, log } = harness()
    expect(typing.editing()).toBeNull()
    expect(typing.selectedText()).toBeNull()
    expect(typing.selectionStyles()).toBeNull()
    expect(typing.styleSelectedText({ fontWeight: 700 })).toBe(false)
    expect(log).toEqual([])
  })

  describe('start and stop', () => {
    it('starts typing into a text layer in a frame, and tells the text selection listeners', () => {
      const { typing, log } = harness()
      typing.start('title', 'sq', 2)
      expect(typing.editing()).toMatchObject({ id: 'title', frameId: 'sq' })
      // The caret alone selects nothing.
      expect(typing.selectedText()).toBeNull()
      expect(log).toEqual(['text selection'])
      typing.stop()
      expect(typing.editing()).toBeNull()
      expect(log).toEqual(['text selection', 'text selection'])
    })

    it('makes everything typed until typing stops one undo step', () => {
      const { typing, session, textOf, type } = harness()
      typing.start('title', 'sq', 5)
      type('!', '!', '?')
      expect(textOf('title')).toBe('Hello!!?')
      typing.stop()
      session.undo()
      expect(textOf('title')).toBe('Hello')
      expect(session.canUndo()).toBe(false)
    })

    it('takes away an empty text the text tool made, in the same undo step, and keeps any other', () => {
      const { typing, session, textOf } = harness()
      const end = session.beginGesture()
      const id = session.run('node.create', {
        parentId: 'sq',
        layer: { type: 'text', name: 'New', props: { x: 0, y: 0, width: 100, height: 24, text: '', style: STYLE } },
      })
      typing.start(id, 'sq', 0, end, true)
      typing.stop()
      expect(session.design().nodes[id]).toBeUndefined()
      session.run('text.edit', { id: 'title', op: { kind: 'delete', at: 0, length: 5 } })
      typing.start('title', 'sq', 0)
      typing.stop()
      expect(textOf('title')).toBe('')
    })

    it('stops when the text being edited is gone, and not while it is there', () => {
      const { typing, session } = harness()
      typing.start('title', 'sq', 0)
      typing.stopWhenGone()
      expect(typing.editing()).not.toBeNull()
      session.run('node.delete', { ids: ['title'] })
      typing.stopWhenGone()
      expect(typing.editing()).toBeNull()
    })

    it('stops when the frame typed in is gone', () => {
      const { typing } = harness()
      typing.start('title', 'story', 0)
      typing.stopWhenGone()
      expect(typing.editing()).toBeNull()
    })
  })

  describe('the caret and the range', () => {
    it('selects a range, which a caret moved with extend changes and one moved without lets go', () => {
      const { typing, log } = harness()
      typing.start('title', 'sq', 0)
      typing.selectText({ start: 1, end: 4 })
      expect(typing.selectedText()).toEqual({ id: 'title', range: { start: 1, end: 4 } })
      typing.caretTo(2, true)
      expect(typing.selectedText()).toEqual({ id: 'title', range: { start: 1, end: 2 } })
      typing.caretTo(3)
      expect(typing.selectedText()).toBeNull()
      expect(log.filter((l) => l === 'text selection')).toHaveLength(4)
    })

    it('follows edits made elsewhere in the text', () => {
      const { typing, session } = harness()
      typing.start('title', 'sq', 0)
      typing.selectText({ start: 1, end: 3 })
      session.run('text.edit', { id: 'title', op: { kind: 'insert', at: 0, text: 'Oh ' } })
      expect(typing.selectedText()).toEqual({ id: 'title', range: { start: 4, end: 6 } })
    })

    it("reads each character's style in the range of the layer typed into, not its copy's", () => {
      const { typing, session } = harness()
      session.run('node.update', { ids: ['wide-title'], patch: { style: { ...STYLE, fontSize: 30 } } })
      typing.start('wide-title', 'wide', 0)
      typing.selectText({ start: 0, end: 2 })
      expect(typing.selectionStyles()?.map((s) => s.fontSize)).toEqual([30, 30])
      typing.start('title', 'sq', 0)
      typing.selectText({ start: 0, end: 2 })
      expect(typing.selectionStyles()?.map((s) => s.fontSize)).toEqual([20, 20])
    })
  })

  describe('styleRange', () => {
    it('styles a range as one undo step of its own, between the typing before and after it', () => {
      const { typing, session, textOf, type } = harness()
      typing.start('title', 'sq', 5)
      type('!')
      typing.selectText({ start: 0, end: 2 })
      expect(typing.styleSelectedText({ fontWeight: 700 })).toBe(true)
      typing.caretTo(6)
      type('?')
      typing.stop()
      const weights = () => {
        const node = session.design().nodes.title
        return node?.type === 'text' ? node.props.runs.map((r) => r.style.fontWeight) : []
      }
      expect(textOf('title')).toBe('Hello!?')
      expect(weights()).toEqual([700])
      session.undo()
      expect(textOf('title')).toBe('Hello!')
      expect(weights()).toEqual([700])
      session.undo()
      expect(weights()).toEqual([])
      session.undo()
      expect(textOf('title')).toBe('Hello')
    })

    it('styles a text that is not being typed into, and changes nothing with no style', () => {
      const { typing, session, log } = harness()
      // A panel can leave a key it doesn't set undefined.
      const unset = { fontWeight: undefined } as unknown as RunStyle
      typing.styleRange({ id: 'title', range: { start: 0, end: 1 } }, unset)
      expect(session.canUndo()).toBe(false)
      expect(log).toEqual([])
      typing.styleRange({ id: 'title', range: { start: 0, end: 1 } }, { fontWeight: 700 })
      expect(session.canUndo()).toBe(true)
      expect(log).toEqual(['draw'])
    })
  })

  describe('fitText', () => {
    it('sizes text that grows with its words, and the groups around it; its copy keeps its own size', () => {
      const { typing, session, log } = harness()
      session.run('text.edit', { id: 'label', op: { kind: 'insert', at: 2, text: '!' } })
      typing.fitText('label')
      const design = session.design()
      expect(design.nodes.label?.props).toMatchObject({ width: 30, height: 24 })
      expect(design.nodes['wide-label']?.props).toMatchObject({ width: 20, height: 24 })
      expect(log).toEqual(['hug label'])
    })

    it('sizes the copy in its own style, and leaves a fixed box be', () => {
      const { typing, session, log } = harness()
      typing.fitText('wide-label')
      expect(session.design().nodes['wide-label']?.props).toMatchObject({ width: 40, height: 48 })
      expect(session.design().nodes.label?.props).toMatchObject({ width: 20, height: 24 })
      typing.fitText('title')
      expect(log).toEqual(['hug wide-label'])
    })
  })

  describe('key', () => {
    it('types at the caret, deletes either side of it, and breaks lines', () => {
      const { typing, textOf, type } = harness()
      typing.start('title', 'sq', 5)
      type('!')
      expect(textOf('title')).toBe('Hello!')
      type('Backspace', 'Backspace')
      expect(textOf('title')).toBe('Hell')
      typing.caretTo(0)
      type('Delete', 'Enter')
      expect(textOf('title')).toBe('\nell')
    })

    it('moves the caret by a character, Shift extending the range, and to the near end of a range', () => {
      const { typing, type } = harness()
      typing.start('title', 'sq', 2)
      typing.key(keyEvent('ArrowRight', { shift: true }) as unknown as KeyboardEvent)
      typing.key(keyEvent('ArrowRight', { shift: true }) as unknown as KeyboardEvent)
      expect(typing.selectedText()?.range).toEqual({ start: 2, end: 4 })
      type('ArrowLeft')
      expect(typing.selectedText()).toBeNull()
      typing.key(keyEvent('ArrowLeft', { shift: true }) as unknown as KeyboardEvent)
      expect(typing.selectedText()?.range).toEqual({ start: 1, end: 2 })
    })

    it('selects all with Mod+A, and typing replaces the range', () => {
      const { typing, textOf, type } = harness()
      typing.start('title', 'sq', 0)
      typing.key(keyEvent('a', { mod: true }) as unknown as KeyboardEvent)
      expect(typing.selectedText()?.range).toEqual({ start: 0, end: 5 })
      type('X')
      expect(textOf('title')).toBe('X')
      expect(typing.selectedText()).toBeNull()
    })

    it('toggles bold on the range with Mod+B', () => {
      const { typing } = harness()
      typing.start('title', 'sq', 0)
      typing.selectText({ start: 0, end: 3 })
      typing.key(keyEvent('b', { mod: true }) as unknown as KeyboardEvent)
      expect(typing.selectionStyles()?.map((s) => s.fontWeight)).toEqual([700, 700, 700])
      typing.key(keyEvent('b', { mod: true }) as unknown as KeyboardEvent)
      expect(typing.selectionStyles()?.map((s) => s.fontWeight)).toEqual([400, 400, 400])
    })

    it('fits the text after a key that changed it, then draws; leaves the page its other keys', () => {
      const { typing, textOf, log } = harness()
      typing.start('label', 'sq', 2)
      const typed = keyEvent('!')
      typing.key(typed as unknown as KeyboardEvent)
      expect(typed.taken).toBe(true)
      expect(textOf('label')).toBe('Hi!')
      expect(log.slice(-2)).toEqual(['hug label', 'draw'])
      const copy = keyEvent('c', { mod: true })
      typing.key(copy as unknown as KeyboardEvent)
      expect(copy.taken).toBe(false)
    })

    it('stops typing with Escape', () => {
      const { typing, type } = harness()
      typing.start('title', 'sq', 0)
      type('Escape')
      expect(typing.editing()).toBeNull()
    })
  })

  describe('copy, cut and paste', () => {
    it('copies the range as plain text, and says it took the copy while typing even with none', () => {
      const { typing } = harness()
      const idle = clipboardEvent()
      expect(typing.copy(idle as unknown as ClipboardEvent)).toBe(false)
      typing.start('title', 'sq', 1)
      const empty = clipboardEvent()
      expect(typing.copy(empty as unknown as ClipboardEvent)).toBe(true)
      expect(empty.taken).toBe(false)
      typing.selectText({ start: 1, end: 4 })
      const copied = clipboardEvent()
      expect(typing.copy(copied as unknown as ClipboardEvent)).toBe(true)
      expect(copied.put()).toBe('ell')
      expect(copied.taken).toBe(true)
    })

    it('cuts the range, the caret where it was', () => {
      const { typing, textOf, type } = harness()
      typing.start('title', 'sq', 1)
      typing.selectText({ start: 1, end: 4 })
      const cut = clipboardEvent()
      typing.cut(cut as unknown as ClipboardEvent)
      expect(cut.put()).toBe('ell')
      expect(textOf('title')).toBe('Ho')
      type('i')
      expect(textOf('title')).toBe('Hio')
    })

    it('pastes plain text over the range, its line breaks as paragraphs', () => {
      const { typing, textOf, type } = harness()
      typing.start('title', 'sq', 0)
      typing.selectText({ start: 0, end: 4 })
      const paste = clipboardEvent('A\r\nB')
      typing.paste(paste as unknown as ClipboardEvent)
      expect(paste.taken).toBe(true)
      expect(textOf('title')).toBe('A\nBo')
      type('!')
      expect(textOf('title')).toBe('A\nB!o')
    })
  })
})
