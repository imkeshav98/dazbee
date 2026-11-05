import * as Y from 'yjs'
import type { z } from 'zod'

import { type DesignInput, parseDesign, type Shape } from '@dazbee/schema'

import { type DesignDoc, loadDesign, snapshot } from './design-doc.ts'
import { repair } from './repair.ts'
import { openSession, type Session } from './session.ts'
import { expectInvariants } from './test-invariants.ts'

const white = [{ type: 'solid' as const, color: '#FFFFFFFF' }]

const boxProps = {
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  shape: { kind: 'rect' as const },
  fills: [{ type: 'solid' as const, color: '#FF5A36FF' }],
}

const headlineProps = {
  x: 60,
  y: 600,
  width: 960,
  height: 100,
  text: 'Summer sale',
  style: { fontFamily: 'Noto Sans', fontSize: 84, color: '#111111FF' },
  runs: [{ start: 7, end: 11, style: { fontWeight: 800 } }],
}

/**
 * A small design for tests: one page with a square and a banner frame, linked. The square holds a
 * box and a headline; the banner holds their copies, the headline's with its own text and place.
 */
export const testDesign = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Test' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: white, order: 'a0' },
    banner: { pageId: 'p1', name: 'Banner', width: 320, height: 50, x: 1280, y: 0, fills: white, order: 'a1' },
  },
  nodes: {
    box: { type: 'graphic', parentId: 'sq', link: 'box', index: 'a0', name: 'Box', props: boxProps },
    headline: {
      type: 'text',
      parentId: 'sq',
      link: 'headline',
      index: 'a1',
      name: 'Headline',
      role: 'headline',
      props: headlineProps,
    },
    'banner-box': { type: 'graphic', parentId: 'banner', link: 'box', index: 'a0', name: 'Box', props: boxProps },
    'banner-headline': {
      type: 'text',
      parentId: 'banner',
      link: 'headline',
      index: 'a1',
      name: 'Headline',
      role: 'headline',
      props: { ...headlineProps, text: 'Sale', x: 4, runs: [] },
    },
  },
})

/**
 * Three shapes (a rect with its own corners, a star, a triangle) and a text, in a square frame,
 * and their linked copies in a wide frame, where the star sits further right.
 */
export const shapesDesign = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Booleans' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    a: shape({ parentId: 'sq', link: 'a', index: 'a0' }, 100, { kind: 'rect', corners: [0, 10, 20, 30] }, '#FF0000FF'),
    b: shape({ parentId: 'sq', link: 'b', index: 'a1' }, 150, { kind: 'star', points: 6 }, '#00FF00FF'),
    c: shape({ parentId: 'sq', link: 'c', index: 'a2' }, 400, { kind: 'polygon', sides: 3 }, '#0000FFFF'),
    t: text({ parentId: 'sq', link: 't', index: 'a3' }),
    'wide-a': shape(
      { parentId: 'wide', link: 'a', index: 'a0' },
      100,
      { kind: 'rect', corners: [0, 10, 20, 30] },
      '#FF0000FF',
    ),
    'wide-b': shape({ parentId: 'wide', link: 'b', index: 'a1' }, 300, { kind: 'star', points: 6 }, '#00FF00FF'),
    'wide-c': shape({ parentId: 'wide', link: 'c', index: 'a2' }, 400, { kind: 'polygon', sides: 3 }, '#0000FFFF'),
    'wide-t': text({ parentId: 'wide', link: 't', index: 'a3' }),
  },
})

/**
 * Linked frames on one page, as Duplicate and Add size leave them, and one more of each kind. The
 * square holds a background, a group of a title and a price, and a badge; the story holds copies
 * of the background and of the group with the title only; the wide frame holds copies of the
 * background, title and price at its top level; the tall frame holds a copy of the background
 * only. The other frame on the page is linked to none of them, and a second page holds a layer
 * with the background's link id, which never counts.
 */
export const linkedDesign = (): DesignInput => {
  type At = { parentId: string; link: string; index: string }
  type Area = { x: number; y: number; width: number; height: number }
  const rect = (at: At, box: Area) => ({
    type: 'graphic' as const,
    ...at,
    name: at.link,
    props: { ...box, shape: { kind: 'rect' as const }, fills: [{ type: 'solid' as const, color: '#FF5A36FF' }] },
  })
  const words = (at: At, box: Area, size = 60) => ({
    type: 'text' as const,
    ...at,
    name: at.link,
    props: { ...box, text: at.link, style: { fontFamily: 'Noto Sans', fontSize: size, color: '#111111FF' } },
  })
  const group = (at: At, box: Area) => ({
    type: 'group' as const,
    ...at,
    name: 'Group',
    props: box,
  })
  const frame = (name: string, order: string, width: number, height: number, x: number, pageId = 'p1') => ({
    pageId,
    name,
    width,
    height,
    x,
    y: 0,
    order,
  })
  const full = (width: number, height: number) => ({ x: 0, y: 0, width, height })
  return {
    meta: { designId: 'd1', name: 'Linked' },
    pages: { p1: { name: 'Page 1', order: 'a0' }, p2: { name: 'Page 2', order: 'a1' } },
    frames: {
      sq: frame('Square', 'a0', 1080, 1080, 0),
      story: frame('Story', 'a1', 1080, 1920, 1280),
      wide: frame('Wide', 'a2', 1200, 628, 2560),
      tall: frame('Tall', 'a3', 300, 600, 3960),
      other: frame('Other', 'a4', 500, 500, 4460),
      far: frame('Far', 'a0', 1080, 1080, 0, 'p2'),
    },
    nodes: {
      bg: rect({ parentId: 'sq', link: 'bg', index: 'a0' }, full(1080, 1080)),
      grp: group({ parentId: 'sq', link: 'grp', index: 'a1' }, { x: 100, y: 100, width: 600, height: 300 }),
      title: words({ parentId: 'grp', link: 'title', index: 'a0' }, { x: 100, y: 100, width: 600, height: 100 }),
      price: words({ parentId: 'grp', link: 'price', index: 'a1' }, { x: 100, y: 300, width: 200, height: 100 }),
      badge: rect({ parentId: 'sq', link: 'badge', index: 'a2' }, { x: 900, y: 40, width: 120, height: 120 }),
      'story-bg': rect({ parentId: 'story', link: 'bg', index: 'a0' }, full(1080, 1920)),
      'story-grp': group({ parentId: 'story', link: 'grp', index: 'a1' }, { x: 100, y: 400, width: 600, height: 100 }),
      'story-title': words(
        { parentId: 'story-grp', link: 'title', index: 'a0' },
        { x: 100, y: 400, width: 600, height: 100 },
      ),
      'wide-bg': rect({ parentId: 'wide', link: 'bg', index: 'a0' }, full(1200, 628)),
      'wide-title': words(
        { parentId: 'wide', link: 'title', index: 'a1' },
        { x: 40, y: 40, width: 400, height: 60 },
        40,
      ),
      'wide-price': words(
        { parentId: 'wide', link: 'price', index: 'a2' },
        { x: 40, y: 200, width: 150, height: 60 },
        40,
      ),
      'tall-bg': rect({ parentId: 'tall', link: 'bg', index: 'a0' }, full(300, 600)),
      'other-x': rect({ parentId: 'other', link: 'x', index: 'a0' }, full(500, 500)),
      'far-bg': rect({ parentId: 'far', link: 'bg', index: 'a0' }, full(1080, 1080)),
    },
  }
}

/** A shape to add with node.create. */
export const badge = {
  type: 'graphic',
  name: 'Badge',
  props: {
    x: 900,
    y: 40,
    width: 120,
    height: 120,
    shape: { kind: 'ellipse' },
    fills: [{ type: 'solid', color: '#FFC400FF' }],
  },
} as const

/** A document holding `design`, the test design unless given. */
export function testDoc(design: DesignInput = testDesign()) {
  const result = parseDesign(design)
  if (!result.success) throw new Error(result.errors.join('\n'))
  return loadDesign(result.design)
}

/**
 * A session whose run, undo, redo, batch and gesture check the invariants on the design after
 * each. A command run on a document that needs no repair must leave one that needs none, too:
 * repair is for what concurrent edits break, never for what a command writes.
 */
export function openTestSession(doc: DesignDoc): Session {
  const session = openSession(doc)
  const check = () => expectInvariants(session.design())
  const needsRepair = () => repair(snapshot(doc)).repairs.length > 0
  /** Whether the document needed no repair after this session's last command, with nothing changed since. */
  let knownClean = false
  let running = false
  const changed = () => {
    if (!running) knownClean = false
  }
  doc.on('afterTransaction', changed)
  const run: Session['run'] = (name, input) => {
    // Inside a batch every command reads the design from before it, so only the batch as a whole counts.
    const checkRepair = !doc._transaction && (knownClean || !needsRepair())
    running = true
    const result = (() => {
      try {
        return session.run(name, input)
      } finally {
        running = false
      }
    })()
    check()
    if (checkRepair) {
      const repairs = repair(snapshot(doc)).repairs
      if (repairs.length > 0) throw new Error(`${name} left a document that needs repair:\n${repairs.join('\n')}`)
      knownClean = true
    }
    return result
  }
  const checked =
    <A extends unknown[], R>(f: (...args: A) => R) =>
    (...args: A): R => {
      const result = f(...args)
      check()
      return result
    }
  return {
    ...session,
    run,
    undo: checked(session.undo),
    redo: checked(session.redo),
    batch: (steps) => checked(session.batch)(steps),
    gesture: (steps) => checked(session.gesture)(steps),
    beginGesture: () => checked(session.beginGesture()),
    destroy: () => {
      doc.off('afterTransaction', changed)
      session.destroy()
    },
  }
}

/** A session on a document holding shapesDesign(). */
export function openShapes() {
  const doc = testDoc(shapesDesign())
  return { doc, tab: openTestSession(doc) }
}

/**
 * Two tabs on one design (the test design unless given), each with its own doc, exchanging
 * updates like the sync server would. `sync` checks both tabs' designs after the exchange.
 */
export function twoTabs(design?: DesignInput) {
  const a = testDoc(design)
  const b = new Y.Doc()
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  const tabA = openTestSession(a)
  const tabB = openTestSession(b)
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
    expectInvariants(tabA.design())
    expectInvariants(tabB.design())
  }
  return { a, b, tabA, tabB, sync }
}

/** A shape in its frame at `x`, filled with one colour. */
function shape(
  at: { parentId: string; link: string; index: string },
  x: number,
  kind: z.input<typeof Shape>,
  color: string,
) {
  return {
    type: 'graphic' as const,
    ...at,
    name: `Shape ${at.index}`,
    props: { x, y: 100, width: 100, height: 100, shape: kind, fills: [{ type: 'solid' as const, color }] },
  }
}

/** A short text at the frame's corner. */
function text(at: { parentId: string; link: string; index: string }) {
  return {
    type: 'text' as const,
    ...at,
    name: 'Text',
    props: {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: 'Hi',
      style: { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' },
    },
  }
}
