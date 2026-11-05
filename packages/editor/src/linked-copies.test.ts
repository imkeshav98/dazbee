import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { copiesOf } from '@dazbee/doc'
import { type DesignInput, type Layer, styleOf } from '@dazbee/schema'

import { pageFrames } from './canvas/frames.ts'
import { sessionOf } from './layers/test-boxes.ts'
import { editorLinkedCopies, linkedMenu } from './linked-copies.ts'
import { editorSelection } from './selection.ts'

const RED = '#E0262BFF'
const BLUE = '#1F4FE0FF'
const rect = (parentId: string, link: string, index: string, color = RED) => ({
  type: 'graphic' as const,
  parentId,
  link,
  index,
  name: link,
  props: {
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    shape: { kind: 'rect' as const },
    fills: [{ type: 'solid' as const, color }],
  },
})
const words = (parentId: string, link: string, index: string, text: string, fontSize: number) => ({
  type: 'text' as const,
  parentId,
  link,
  index,
  name: link,
  props: {
    x: 100,
    y: 400,
    width: 600,
    height: 100,
    text,
    style: { fontFamily: 'Noto Sans', fontSize, color: '#111111FF' },
  },
})
/**
 * A square frame and a wide one linked to it on one page, and a frame linked to neither. The square
 * holds a background, a title with a bold first word and a badge; the wide frame holds copies of
 * the background and of the title, with its own shorter text at half the size.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
    other: { pageId: 'p1', name: 'Other', width: 500, height: 500, x: 2680, y: 0, order: 'a2' },
  },
  nodes: {
    bg: rect('sq', 'bg', 'a0'),
    title: {
      ...words('sq', 'title', 'a1', 'Big sale', 80),
      props: {
        ...words('sq', 'title', 'a1', 'Big sale', 80).props,
        runs: [{ start: 0, end: 3, style: { fontWeight: 800, fontSize: 80 } }],
      },
    },
    badge: { ...rect('sq', 'badge', 'a2', BLUE), props: { ...rect('sq', 'badge', 'a2', BLUE).props, x: 900, y: 40 } },
    'wide-bg': rect('wide', 'bg', 'a0'),
    'wide-title': words('wide', 'title', 'a1', 'Sale', 40),
    'other-bg': rect('other', 'x', 'a0'),
  },
}

/** A `localStorage` held in a map. */
function storage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

/** The linked-copy actions on a real session and selection, logging the texts they fit and the overlay draws. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const log: string[] = []
  const linked = editorLinkedCopies({
    session,
    selection,
    typing: { fitText: (id) => log.push(`fit ${id}`) },
    resources: { loadFamilies: (families) => families.map(() => undefined) },
    signal: new AbortController().signal,
    drawOverlay: () => log.push('overlay'),
  })
  const node = (id: string) => session.design().nodes[id]
  const fill = (id: string) => (node(id)?.props as { fills?: { color: string }[] }).fills?.[0]?.color
  const select = (...ids: string[]) => {
    const frameId = ids[0]?.startsWith('wide') ? 'wide' : ids[0]?.startsWith('other') ? 'other' : 'sq'
    selection.select(ids, frameId)
  }
  return { session, selection, linked, log, node, fill, select }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('editorLinkedCopies', () => {
  it('copies one layer’s style and pastes it on others, as one undo step', () => {
    const { linked, session, select, fill, node } = harness()
    select('bg', 'badge')
    expect(linked.perform('copyStyle')).toBe(false)
    select('badge')
    expect(linked.perform('copyStyle')).toBe(true)
    expect(linked.menu()?.pasteStyle).toBe('hasStyle')
    select('bg', 'title')
    expect(linked.menu()?.pasteStyle).toBe('ready')
    expect(linked.perform('pasteStyle')).toBe(true)
    expect(fill('bg')).toBe(BLUE)
    expect(node('bg')?.props).toMatchObject({ x: 100, width: 200 })
    expect(fill('wide-bg')).toBe(RED)
    session.undo()
    expect(fill('bg')).toBe(RED)
  })

  it('writes the selected layer’s style into every linked copy, as one undo step', () => {
    const { linked, session, select, fill } = harness()
    session.run('node.update', { ids: ['bg'], patch: { fills: [{ type: 'solid', color: BLUE }], visible: true } })
    session.run('node.update', { ids: ['wide-bg'], patch: { visible: false } })
    select('bg')
    expect(linked.perform('styleToLinked')).toBe(true)
    expect(fill('wide-bg')).toBe(BLUE)
    expect(linked.menu()?.style).toBe('copiesHaveStyle')
    expect(linked.perform('styleToLinked')).toBe(false)
    session.undo()
    expect(fill('wide-bg')).toBe(RED)
  })

  it('writes a text’s characters and runs into its copies, run sizes scaled to each copy, refitting them', () => {
    const { linked, session, select, node, log } = harness()
    select('title')
    expect(linked.perform('textToLinked')).toBe(true)
    expect(node('wide-title')?.props).toMatchObject({
      text: 'Big sale',
      runs: [{ start: 0, end: 3, style: { fontWeight: 800, fontSize: 40 } }],
      style: { fontSize: 40 },
    })
    expect(log).toContain('fit wide-title')
    expect(linked.menu()?.text).toBe('copiesHaveText')
    session.undo()
    expect(node('wide-title')?.props).toMatchObject({ text: 'Sale', runs: [] })
  })

  it('copies a layer into the linked frames that lack it, keeping the selection, as one undo step', () => {
    const { linked, session, select, selection } = harness()
    select('badge')
    expect(linked.perform('layerToLinked')).toBe(true)
    const copy = Object.entries(session.design().nodes).find(([, n]) => n.link === 'badge' && n.parentId === 'wide')
    expect(copy).toBeDefined()
    expect(selection.current()?.ids).toEqual(['badge'])
    expect(linked.menu()?.layer).toBe('everyFrame')
    expect(linked.perform('layerToLinked')).toBe(false)
    session.undo()
    expect(session.design().nodes[copy?.[0] ?? '']).toBeUndefined()
  })

  it('locks the layer and its copies in all frames, or unlocks them all once every one is locked', () => {
    const { linked, session, select, node } = harness()
    session.run('node.lock', { ids: ['wide-bg'], lock: { move: true } })
    select('bg')
    expect(linked.menu()?.lock).toBe('lock')
    expect(linked.perform('lockLinked')).toBe(true)
    expect(node('bg')?.lock).toMatchObject({ move: true, style: true, delete: true })
    expect(node('wide-bg')?.lock).toMatchObject({ move: true, style: true, delete: true })
    expect(linked.menu()?.lock).toBe('unlock')
    linked.perform('lockLinked')
    expect(node('bg')?.lock).toBeUndefined()
    expect(node('wide-bg')?.lock).toBeUndefined()
    session.undo()
    expect(node('wide-bg')?.lock).toMatchObject({ style: true })
  })

  it('hides the layer and its copies in all frames, or shows them all once every one is hidden', () => {
    const { linked, session, select, node } = harness()
    session.run('node.update', { ids: ['wide-title'], patch: { visible: false } })
    select('title')
    expect(linked.menu()?.hide).toBe('hide')
    linked.perform('hideLinked')
    expect([node('title')?.props.visible, node('wide-title')?.props.visible]).toEqual([false, false])
    expect(linked.menu()?.hide).toBe('show')
    linked.perform('hideLinked')
    expect([node('title')?.props.visible, node('wide-title')?.props.visible]).toEqual([true, true])
  })

  it('deletes the layer and its copies in all frames but a copy locked against it, as one undo step', () => {
    const { linked, session, select, node, selection } = harness()
    select('bg')
    expect(linked.perform('deleteLinked')).toBe(true)
    expect([node('bg'), node('wide-bg')]).toEqual([undefined, undefined])
    expect(selection.current()?.ids ?? []).toEqual([])
    session.undo()
    expect(node('bg')).toBeDefined()
    expect(node('wide-bg')).toBeDefined()
    session.run('node.lock', { ids: ['wide-bg'], lock: { delete: true } })
    select('bg')
    linked.perform('deleteLinked')
    expect([node('bg'), node('wide-bg')?.link]).toEqual([undefined, 'bg'])
    session.run('node.lock', { ids: ['badge'], lock: { delete: true } })
    select('badge')
    expect(linked.menu()?.delete).toBe('selectionLocked')
    expect(linked.perform('deleteLinked')).toBe(false)
  })

  it('deletes no copy while the selected layer itself is locked against deleting', () => {
    const { linked, session, select, node } = harness()
    session.run('node.lock', { ids: ['bg'], lock: { delete: true } })
    select('bg')
    expect(linked.perform('deleteLinked')).toBe(false)
    expect([node('bg')?.link, node('wide-bg')?.link]).toEqual(['bg', 'bg'])
  })
})

describe('linkedMenu', () => {
  it('says what each item would do for the selection, and why one has nothing to do', () => {
    const { session } = harness()
    const design = session.design()
    expect(linkedMenu(design, ['bg'], null)).toEqual({
      frames: 1,
      reach: 1,
      copyStyle: 'ready',
      pasteStyle: 'nothingCopied',
      style: 'copiesHaveStyle',
      text: 'hidden',
      layer: 'everyFrame',
      lock: 'lock',
      hide: 'hide',
      delete: 'ready',
    })
    expect(linkedMenu(design, ['title'], null)).toMatchObject({
      style: 'copiesHaveStyle',
      text: 'ready',
      layer: 'everyFrame',
    })
    expect(linkedMenu(design, ['badge'], null)).toMatchObject({ style: 'noCopies', layer: 'ready' })
    expect(linkedMenu(design, ['other-bg'], null)).toMatchObject({
      frames: 0,
      reach: 0,
      style: 'noCopies',
      layer: 'noFrames',
    })
    expect(linkedMenu(design, ['bg', 'badge'], null)).toMatchObject({ copyStyle: 'several', layer: 'ready' })
  })

  it('reaches the linked frames that hold a copy, or every linked frame when none does', () => {
    const { session } = harness()
    session.run('frame.duplicate', { frameId: 'sq' })
    const design = session.design()
    expect(linkedMenu(design, ['badge'], null)).toMatchObject({ frames: 2, reach: 1 })
    expect(linkedMenu(design, ['bg'], null)).toMatchObject({ frames: 2, reach: 2 })
    session.run('node.delete', { ids: copiesOf(session.design(), 'badge') })
    expect(linkedMenu(session.design(), ['badge'], null)).toMatchObject({ frames: 2, reach: 2 })
  })

  it('greys Style when the copies that lack it are locked, and Paste style when the layers have it', () => {
    const { session } = harness()
    session.run('node.update', { ids: ['bg'], patch: { fills: [{ type: 'solid', color: BLUE }] } })
    expect(linkedMenu(session.design(), ['bg'], null).style).toBe('ready')
    session.run('node.lock', { ids: ['wide-bg'], lock: { style: true } })
    expect(linkedMenu(session.design(), ['bg'], null).style).toBe('copiesLocked')
    const design = session.design()
    expect(linkedMenu(design, ['badge'], null).pasteStyle).toBe('nothingCopied')
    expect(linkedMenu(design, ['badge'], styleOf(design.nodes.badge as Layer)).pasteStyle).toBe('hasStyle')
    session.run('node.lock', { ids: ['bg'], lock: { style: true } })
    expect(linkedMenu(session.design(), ['bg'], styleOf(design.nodes['wide-bg'] as Layer)).pasteStyle).toBe(
      'styleLocked',
    )
  })

  it('says a copied style doesn’t apply to a layer of another kind, unless one of them has it already', () => {
    const { session } = harness()
    const design = session.design()
    const textStyle = styleOf(design.nodes.title as Layer)
    const shapeStyle = styleOf(design.nodes.badge as Layer)
    expect(linkedMenu(design, ['badge'], textStyle).pasteStyle).toBe('textStyleOnShape')
    expect(linkedMenu(design, ['title'], shapeStyle).pasteStyle).toBe('shapeStyleOnText')
    expect(linkedMenu(design, ['badge', 'title'], textStyle).pasteStyle).toBe('hasStyle')
    session.run('node.group', { ids: ['badge'] })
    const group = session.design().nodes.badge?.parentId ?? ''
    session.run('node.update', { ids: [group], patch: { blendMode: 'normal' } })
    expect(linkedMenu(session.design(), [group], textStyle).pasteStyle).toBe('textStyleOnGroup')
    expect(linkedMenu(session.design(), [group, 'bg'], textStyle).pasteStyle).toBe('textStyleOnLayers')
  })

  it('greys Delete from all frames when the selection is locked against deleting, and says where', () => {
    const { session } = harness()
    session.run('node.lock', { ids: ['bg'], lock: { delete: true } })
    expect(linkedMenu(session.design(), ['bg'], null).delete).toBe('selectionLocked')
    session.run('node.lock', { ids: ['wide-bg'], lock: { delete: true } })
    expect(linkedMenu(session.design(), ['bg'], null).delete).toBe('deleteLocked')
    session.run('node.lock', { ids: ['bg'], lock: { delete: false } })
    expect(linkedMenu(session.design(), ['bg'], null).delete).toBe('ready')
  })
})
