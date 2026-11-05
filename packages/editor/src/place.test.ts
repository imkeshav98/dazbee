import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { type DesignInput, LAYER_CLIPBOARD_TYPE } from '@dazbee/schema'

import { type Frame, frameAt, pageFrames } from './canvas/frames.ts'
import { hitTest } from './canvas/hit-test.ts'
import { testLooks } from './canvas/test-looks.ts'
import { measure, sessionOf, testBoxes } from './layers/test-boxes.ts'
import { editorPlace, type PlaceDeps } from './place.ts'
import { editorSelection } from './selection.ts'

const ck = await loadCanvasKit()
const looks = testLooks()

const RED = { type: 'solid' as const, color: '#FF0000FF' }
const rect = (parentId: string, index: string, box: { x: number; y: number; width: number; height: number }) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { ...box, shape: { kind: 'rect' as const }, fills: [RED] },
})
const BLUE = { type: 'solid' as const, color: '#0000FFFF' }
/** The square frame's layers: a square, a square whose style is locked, a line, a text and a box holding a square. */
const SQUARE_LAYERS: DesignInput['nodes'] = {
  a: { ...rect('sq', 'a0', { x: 100, y: 100, width: 100, height: 100 }), link: 'a' },
  styled: { ...rect('sq', 'a1', { x: 300, y: 100, width: 100, height: 100 }), link: 'styled', lock: { style: true } },
  line: {
    type: 'graphic',
    parentId: 'sq',
    link: 'line',
    index: 'a2',
    name: 'Line',
    props: { x: 500, y: 100, width: 100, height: 100, shape: { kind: 'line' } },
  },
  words: {
    type: 'text',
    parentId: 'sq',
    link: 'words',
    index: 'a3',
    name: 'Words',
    props: {
      x: 700,
      y: 100,
      width: 200,
      height: 40,
      text: 'Hello',
      boxMode: 'fixed',
      style: { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' },
    },
  },
  box: {
    type: 'box',
    parentId: 'sq',
    link: 'box',
    index: 'a4',
    name: 'Box',
    props: { x: 100, y: 500, width: 300, height: 300 },
  },
  inside: { ...rect('box', 'a0', { x: 0, y: 0, width: 50, height: 50 }), link: 'inside' },
}
/**
 * One page with a square frame holding SQUARE_LAYERS and a wide one holding a copy of each,
 * `wide-<id>`, linked to it, the first square's copy filled blue.
 */
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
    'wide-a': {
      ...rect('wide', 'a0', { x: 100, y: 100, width: 100, height: 100 }),
      link: 'a',
      props: { x: 100, y: 100, width: 100, height: 100, shape: { kind: 'rect' }, fills: [BLUE] },
    },
  },
}
const PHOTO = { id: 'photo', name: 'Photo', width: 400, height: 200 }
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>'

/** A `localStorage` held in a map. */
function storage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}
/** A clipboard's data with the given types on it; a type not there reads as '', as in a browser. */
function transfer(types: Record<string, string> = {}) {
  const items = new Map(Object.entries(types))
  const data = {
    items,
    files: [] as File[],
    getData: (type: string) => items.get(type) ?? '',
    setData: (type: string, value: string) => void items.set(type, value),
  }
  return data as typeof data & DataTransfer
}
/** A clipboard event over the stage, which records whether the editor took it. */
function clipboardEvent(data: DataTransfer) {
  const event = {
    target: null,
    clipboardData: data,
    taken: false,
    preventDefault() {
      event.taken = true
    },
  }
  return event as typeof event & ClipboardEvent
}

/**
 * Placing on a real session and selection over the two frames, a client point being a world point
 * (the stage at the page's corner, zoom 1), logging what it asks of the tools, typing and the page.
 * With `emptyPage`, the page shown has no frames.
 */
function harness(typed = false, { emptyPage = false } = {}) {
  const session = sessionOf(DESIGN)
  const all = pageFrames(session.design(), 'p1').frames
  const [square, wide] = all as [Frame, Frame]
  const frames = emptyPage ? [] : all
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const boxes = testBoxes(session, selection, frames)
  const frameOf = (id: string | undefined) => frames.find((f) => f.id === id)
  const pointAt = (client: { x: number; y: number }) => {
    const frame = frameAt(frames, client)
    return frame ? { frame, p: { x: client.x - frame.x, y: client.y - frame.y } } : null
  }
  const deps: PlaceDeps = {
    ck,
    session,
    designId: 'd',
    view: {
      design: () => session.design(),
      frames: () => frames,
      frameOf,
      inView: () => (emptyPage ? [] : [wide]),
      middleFrame: () => (emptyPage ? undefined : wide),
      pointAt,
      spotAt: (client) => {
        const at = pointAt(client)
        return at ? { frameId: at.frame.id, x: at.p.x, y: at.p.y } : null
      },
    },
    tools: { setTool: (tool) => log.push(`tool ${tool}`) },
    selection,
    scenes: {
      hit: (f, p, options) => hitTest(render(session.design(), f.id, undefined, measure).layers, p, looks, options),
    },
    boxes,
    typing: {
      editing: () => (typed ? { id: 'words', frameId: square.id } : null),
      stop: () => log.push('typing stop'),
      fitText: (id) => log.push(`fit ${id}`),
      copy: () => typed,
      cut: () => log.push('typing cut'),
      paste: () => log.push('typing paste'),
    },
    actions: { perform: (action) => (log.push(action), true) },
    notify: (notice, parts) => log.push(parts?.length ? `${notice} ${parts.length}` : notice),
    signal: new AbortController().signal,
    drawOverlay: () => log.push('overlay'),
  }
  const place = editorPlace(deps)
  /** A layer's box. */
  const boxOf = (id: string) => {
    const p = session.design().nodes[id]?.props as unknown as Record<string, number>
    return { x: p.x, y: p.y, width: p.width, height: p.height }
  }
  /** A layer's fills. */
  const fillsOf = (id: string) => (session.design().nodes[id]?.props as { fills?: unknown }).fills
  /** A client point over a point of a frame. */
  const client = (frame: Frame, x: number, y: number) => ({ x: frame.x + x, y: frame.y + y })
  return { place, session, selection, square, wide, log, boxOf, fillsOf, client }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage())
  // A clipboard event on the stage comes from none of the page's own fields.
  vi.stubGlobal('HTMLElement', function HTMLElement() {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('editorPlace', () => {
  describe('dropTarget and imageTarget', () => {
    it('outlines the shape or box an image dragged over the stage would go into', () => {
      const { place, square, log, client } = harness()
      expect(place.imageTarget(client(square, 150, 150))).toBe('a')
      expect(place.dropTarget()).toEqual({ id: 'a', frameId: square.id })
      expect(place.imageTarget(client(square, 160, 160))).toBe('a')
      expect(log).toEqual(['overlay'])
      expect(place.imageTarget(client(square, 380, 780))).toBe('box')
      expect(place.imageTarget(null)).toBeNull()
      expect(place.dropTarget()).toBeNull()
      expect(log).toEqual(['overlay', 'overlay', 'overlay'])
    })

    it('finds none over text, a line, a layer whose style is locked or empty space', () => {
      const { place, square, client } = harness()
      expect(place.imageTarget(client(square, 750, 110))).toBeNull()
      expect(place.imageTarget(client(square, 550, 150))).toBeNull()
      expect(place.imageTarget(client(square, 350, 150))).toBeNull()
      expect(place.imageTarget(client(square, 900, 900))).toBeNull()
    })
  })

  describe('copy, cut and paste', () => {
    it('copies the selected layers onto the clipboard as they are, with their link ids and the page and frame they came from', () => {
      const { place, selection, wide } = harness()
      selection.select(['wide-a'], wide.id)
      const data = transfer()
      const e = clipboardEvent(data)
      place.copy(e)
      expect(e.taken).toBe(true)
      const copied = JSON.parse(data.getData(LAYER_CLIPBOARD_TYPE))
      expect(copied).toMatchObject({
        kind: 'dazbee.layers',
        designId: 'd',
        pageId: 'p1',
        frameId: 'wide',
        tree: { roots: ['wide-a'] },
      })
      expect(copied.tree.nodes['wide-a']).toMatchObject({ link: 'a', props: { fills: [BLUE] } })
      expect(data.getData('text/plain')).toBe('Rect')
    })

    it('leaves the copy to the text being typed into', () => {
      const { place, selection, square } = harness(true)
      selection.select(['words'], square.id)
      const data = transfer()
      place.copy(clipboardEvent(data))
      expect(data.items.size).toBe(0)
    })

    it('cuts the selected layers: copied, then deleted', () => {
      const { place, selection, square, log } = harness()
      selection.select(['a'], square.id)
      const data = transfer()
      place.cut(clipboardEvent(data))
      expect(data.getData('text/plain')).toBe('Rect')
      expect(log).toEqual(['delete'])
    })

    it('pastes copied layers where they were, in the selection’s frame, selected, as one undo step', () => {
      const { place, session, selection, square, boxOf } = harness()
      selection.select(['a'], square.id)
      const data = transfer()
      place.copy(clipboardEvent(data))
      const e = clipboardEvent(data)
      place.paste(e, () => null)
      expect(e.taken).toBe(true)
      const [pasted] = selection.current()?.ids ?? []
      expect(pasted).toBeDefined()
      expect(pasted).not.toBe('a')
      expect(boxOf(pasted ?? '')).toEqual(boxOf('a'))
      // A new layer in the frame, with a link id of its own.
      expect(session.design().nodes[pasted ?? '']?.parentId).toBe('sq')
      expect(session.design().nodes[pasted ?? '']?.link).not.toBe('a')
      session.undo()
      expect(session.design().nodes[pasted ?? '']).toBeUndefined()
    })

    it('pastes onto another frame of the page as linked copies, keeping link ids the frame doesn’t hold', () => {
      const { place, session, selection, square, wide } = harness()
      session.run('node.delete', { ids: ['wide-a'] })
      selection.select(['a', 'line'], square.id)
      const data = transfer()
      place.copy(clipboardEvent(data))
      selection.select(['wide-words'], wide.id)
      place.paste(clipboardEvent(data), () => null)
      const pasted = selection.current()?.ids ?? []
      const links = pasted.map((id) => session.design().nodes[id]?.link)
      // The wide frame lacks the square's first square, so its copy is linked; it holds the line already.
      expect(links[0]).toBe('a')
      expect(links[1]).not.toBe('line')
      expect(pasted.map((id) => session.design().nodes[id]?.parentId)).toEqual(['wide', 'wide'])
      session.undo()
      expect(session.design().nodes[pasted[0] ?? '']).toBeUndefined()
    })

    it('pastes as new layers into the frame the layers came from, and from another design', () => {
      const { place, session, selection, square, wide } = harness()
      session.run('node.delete', { ids: ['wide-a'] })
      selection.select(['a'], square.id)
      const data = transfer()
      place.copy(clipboardEvent(data))
      session.run('node.delete', { ids: ['a'] })
      selection.select(['words'], square.id)
      place.paste(clipboardEvent(data), () => null)
      const [own] = selection.current()?.ids ?? []
      expect(session.design().nodes[own ?? '']?.link).not.toBe('a')
      const other = JSON.stringify({ ...JSON.parse(data.getData(LAYER_CLIPBOARD_TYPE)), designId: 'other' })
      selection.select(['wide-words'], wide.id)
      place.paste(clipboardEvent(transfer({ [LAYER_CLIPBOARD_TYPE]: other })), () => null)
      const [fromOther] = selection.current()?.ids ?? []
      expect(session.design().nodes[fromOther ?? '']?.link).not.toBe('a')
    })

    it('pastes centred on the pointer after Mod+Shift+V, and where the layers were after Mod+V', () => {
      const { place, selection, square, boxOf, client } = harness()
      selection.select(['a'], square.id)
      const data = transfer()
      place.copy(clipboardEvent(data))
      place.aimPaste(true)
      place.paste(clipboardEvent(data), () => client(square, 600, 600))
      const [centred] = selection.current()?.ids ?? []
      expect(boxOf(centred ?? '')).toMatchObject({ x: 550, y: 550 })
      place.aimPaste(false)
      place.paste(clipboardEvent(data), () => client(square, 600, 600))
      const [inPlace] = selection.current()?.ids ?? []
      expect(boxOf(inPlace ?? '')).toMatchObject({ x: 100, y: 100 })
    })

    it('pastes SVG markup as layers', () => {
      const { place, session, selection, wide } = harness()
      const e = clipboardEvent(transfer({ 'text/plain': SVG }))
      place.paste(e, () => null)
      expect(e.taken).toBe(true)
      const [group] = selection.current()?.ids ?? []
      expect(selection.current()?.frameId).toBe(wide.id)
      expect(session.design().nodes[group ?? '']?.type).toBe('group')
    })

    it('says to add a frame first, and pastes nothing, on a page with no frames', () => {
      const copied = harness()
      copied.selection.select(['a'], copied.square.id)
      const data = transfer()
      copied.place.copy(clipboardEvent(data))
      const { place, session, log } = harness(false, { emptyPage: true })
      const e = clipboardEvent(data)
      place.paste(e, () => null)
      expect(e.taken).toBe(true)
      expect(log).toEqual(['pasteNeedsFrame'])
      place.paste(clipboardEvent(transfer({ 'text/plain': SVG })), () => null)
      expect(log).toEqual(['pasteNeedsFrame', 'pasteNeedsFrame'])
      // Paste in a menu, with the copy kept on this device.
      expect(copied.place.copyLayers()).toBe(true)
      expect(place.pasteLayers(() => null)).toBe(false)
      expect(log).toEqual(['pasteNeedsFrame', 'pasteNeedsFrame', 'pasteNeedsFrame'])
      expect(session.canUndo()).toBe(false)
    })

    it('leaves the paste to the text being typed into, and anything else on the clipboard be', () => {
      const typed = harness(true)
      typed.place.paste(clipboardEvent(transfer({ 'text/plain': 'Hi' })), () => null)
      expect(typed.log).toEqual(['typing paste'])
      const { place, session } = harness()
      const e = clipboardEvent(transfer({ 'text/plain': 'Hi' }))
      place.paste(e, () => null)
      expect(e.taken).toBe(false)
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('copyLayers, canPasteLayers and pasteLayers', () => {
    it('keeps the copy on this device for Paste in a menu', () => {
      const { place, selection, square, boxOf } = harness()
      expect(place.canPasteLayers()).toBe(false)
      expect(place.pasteLayers(() => null)).toBe(false)
      expect(place.copyLayers()).toBe(false)
      selection.select(['a'], square.id)
      expect(place.copyLayers()).toBe(true)
      expect(place.canPasteLayers()).toBe(true)
      expect(place.pasteLayers(() => null)).toBe(true)
      const [pasted] = selection.current()?.ids ?? []
      expect(pasted).not.toBe('a')
      expect(boxOf(pasted ?? '')).toEqual(boxOf('a'))
    })
  })

  describe('placeSvg', () => {
    it('places a file as a group centred on a spot, selected, with the select tool back', () => {
      const { place, session, selection, square, boxOf, log } = harness()
      const id = place.placeSvg(SVG, 'Logo', { frameId: square.id, x: 500, y: 500 })
      expect(id).not.toBeNull()
      expect(session.design().nodes[id ?? '']).toMatchObject({ type: 'group', name: 'Logo', parentId: 'sq' })
      expect(boxOf(id ?? '')).toEqual({ x: 450, y: 475, width: 100, height: 50 })
      expect(selection.current()).toEqual({ ids: [id], frameId: square.id })
      expect(log).toEqual(['typing stop', 'tool select'])
    })

    it('goes in the middle of the frame in view with no point', () => {
      const { place, selection, wide } = harness()
      place.placeSvg(SVG, 'Logo')
      expect(selection.current()?.frameId).toBe(wide.id)
    })

    it('says so and places nothing when the file can’t be read', () => {
      const { place, session, log } = harness()
      expect(place.placeSvg('<html></html>', 'Page')).toBeNull()
      expect(log).toEqual(['svgUnreadable'])
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('placeImage', () => {
    it('places an image centred on a point, selected, with the select tool back', () => {
      const { place, session, selection, square, boxOf, client } = harness()
      const id = place.placeImage(PHOTO, client(square, 500, 500))
      expect(session.design().nodes[id ?? '']?.props).toMatchObject({
        fills: [{ type: 'image', assetId: 'photo', fit: 'fill' }],
      })
      expect(boxOf(id ?? '')).toEqual({ x: 300, y: 400, width: 400, height: 200 })
      expect(selection.current()).toEqual({ ids: [id], frameId: square.id })
    })

    it('places nothing off every frame, and in the middle of the frame in view with no point', () => {
      const { place, selection, wide } = harness()
      expect(place.placeImage(PHOTO, { x: -500, y: -500 })).toBeNull()
      const id = place.placeImage(PHOTO)
      expect(selection.current()).toEqual({ ids: [id], frameId: wide.id })
    })
  })

  describe('fillWithImage', () => {
    it("puts the image on top of the layer's fills, as one undo step, selected in its frame; its copy keeps its own", () => {
      const { place, session, selection, wide, fillsOf, client } = harness()
      expect(place.imageTarget(client(wide, 150, 150))).toBe('wide-a')
      expect(place.fillWithImage('wide-a', PHOTO)).toBe(true)
      const image = { type: 'image', assetId: 'photo', fit: 'fill', opacity: 1 }
      expect(fillsOf('wide-a')).toEqual([BLUE, image])
      expect(fillsOf('a')).toEqual([RED])
      expect(selection.current()).toEqual({ ids: ['wide-a'], frameId: wide.id })
      expect(place.dropTarget()).toBeNull()
      session.undo()
      expect(fillsOf('wide-a')).toEqual([BLUE])
    })

    it('can’t fill a layer whose style is locked', () => {
      const { place, session } = harness()
      expect(place.fillWithImage('styled', PHOTO)).toBe(false)
      expect(session.canUndo()).toBe(false)
    })

    it('selects the layer in its own frame when it was dropped nowhere', () => {
      const { place, selection, square } = harness()
      place.fillWithImage('inside', PHOTO)
      expect(selection.current()).toEqual({ ids: ['inside'], frameId: square.id })
    })
  })
})
