import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LAYER_CLIPBOARD_TYPE, LayerClipboard, type LayerStyle } from '@dazbee/schema'

import {
  keepCopy,
  keepStyle,
  layersOnClipboard,
  putOnClipboard,
  rememberedLayers,
  rememberedStyle,
} from './clipboard.ts'

/** The `localStorage` key the copied layers are kept under; stored on people's devices, so it never changes. */
const KEY = 'dazbee.copiedLayers'

const rect = (name: string, index: string, link: string) => ({
  type: 'graphic',
  parentId: 'sq',
  link,
  index,
  name,
  props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' } },
})
/** Two layers copied from frame `sq` on page `p1`, each with its own link id. */
const copied = LayerClipboard.parse({
  kind: 'dazbee.layers',
  designId: 'd1',
  pageId: 'p1',
  frameId: 'sq',
  tree: { nodes: { a: rect('Logo', 'a0', 'a'), b: rect('', 'a1', 'b') }, roots: ['a', 'b'] },
})
const json = JSON.stringify(copied)
const plain = 'Logo\nLayer'

/** A `localStorage` held in a map; `failing` throws on every call, as a browser with storage off does. */
function storage(failing = false) {
  const items = new Map<string, string>()
  const check = () => {
    if (failing) throw new Error('storage is off')
  }
  return {
    items,
    getItem: (key: string) => (check(), items.get(key) ?? null),
    setItem: (key: string, value: string) => (check(), void items.set(key, value)),
  }
}
/** A clipboard's data with the given types on it; a type not there reads as '', as in a browser. */
function transfer(types: Record<string, string> = {}) {
  const items = new Map(Object.entries(types))
  const data = {
    items,
    getData: (type: string) => items.get(type) ?? '',
    setData: (type: string, value: string) => void items.set(type, value),
  }
  return data as typeof data & DataTransfer
}

let kept: ReturnType<typeof storage>
beforeEach(() => {
  kept = storage()
  vi.stubGlobal('localStorage', kept)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('keepCopy', () => {
  it('keeps the layers on this device as JSON with their names as plain text', () => {
    expect(keepCopy(copied)).toEqual({ json, plain, kept: true })
    expect([...kept.items]).toEqual([[KEY, JSON.stringify({ plain, json })]])
  })

  it('says so when the device keeps nothing', () => {
    vi.stubGlobal('localStorage', storage(true))
    expect(keepCopy(copied)).toEqual({ json, plain, kept: false })
  })
})

describe('putOnClipboard', () => {
  it('puts the layers on the clipboard in our type and their names as plain text, and keeps them', () => {
    const data = transfer()
    putOnClipboard(data, copied)
    expect([...data.items]).toEqual([
      [LAYER_CLIPBOARD_TYPE, json],
      ['text/plain', plain],
    ])
    expect(kept.items.get(KEY)).toBe(JSON.stringify({ plain, json }))
  })

  it('still fills the clipboard when the device keeps nothing', () => {
    vi.stubGlobal('localStorage', storage(true))
    const data = transfer()
    putOnClipboard(data, copied)
    expect(data.items.get(LAYER_CLIPBOARD_TYPE)).toBe(json)
  })
})

describe('layersOnClipboard', () => {
  it('reads layers in our type, with the design, page and frame they came from', () => {
    expect(layersOnClipboard(transfer({ [LAYER_CLIPBOARD_TYPE]: json }))).toEqual(copied)
  })

  it('reads the kept copy when the clipboard brings only the plain text it wrote', () => {
    keepCopy(copied)
    expect(layersOnClipboard(transfer({ 'text/plain': plain }))).toEqual(copied)
    expect(layersOnClipboard(transfer({ 'text/plain': 'something else' }))).toBeNull()
  })

  it('finds nothing on an empty clipboard, in text that isn’t layers or with storage off', () => {
    expect(layersOnClipboard(null)).toBeNull()
    expect(layersOnClipboard(transfer())).toBeNull()
    expect(layersOnClipboard(transfer({ [LAYER_CLIPBOARD_TYPE]: '{not json' }))).toBeNull()
    expect(layersOnClipboard(transfer({ [LAYER_CLIPBOARD_TYPE]: JSON.stringify({ kind: 'other' }) }))).toBeNull()
    vi.stubGlobal('localStorage', storage(true))
    expect(layersOnClipboard(transfer({ 'text/plain': plain }))).toBeNull()
  })
})

describe('rememberedLayers', () => {
  it('reads the layers last kept on this device', () => {
    expect(rememberedLayers()).toBeNull()
    keepCopy(copied)
    expect(rememberedLayers()).toEqual(copied)
  })

  it('finds nothing in a kept value it can’t read or with storage off', () => {
    kept.items.set(KEY, '{not json')
    expect(rememberedLayers()).toBeNull()
    kept.items.set(KEY, JSON.stringify({ plain, json: JSON.stringify({ kind: 'other' }) }))
    expect(rememberedLayers()).toBeNull()
    vi.stubGlobal('localStorage', storage(true))
    expect(rememberedLayers()).toBeNull()
  })
})

describe('keepStyle and rememberedStyle', () => {
  const style: LayerStyle = {
    fills: [{ type: 'solid', color: '#E0262BFF' }],
    effects: [],
    opacity: 0.5,
    blendMode: 'normal',
    bindings: { fill: 'brand:primary' },
  }

  it('keeps a copied style on this device and reads it back', () => {
    expect(rememberedStyle()).toBeNull()
    expect(keepStyle(style)).toBe(true)
    expect(kept.items.get('dazbee.copiedStyle')).toBe(JSON.stringify(style))
    expect(rememberedStyle()).toEqual(style)
  })

  it('finds nothing in a kept value it can’t read, and keeps nothing with storage off', () => {
    kept.items.set('dazbee.copiedStyle', '{"opacity": 7}')
    expect(rememberedStyle()).toBeNull()
    vi.stubGlobal('localStorage', storage(true))
    expect(keepStyle(style)).toBe(false)
    expect(rememberedStyle()).toBeNull()
  })
})
