import { describe, expect, it } from 'vitest'

import { TextProps } from '@dazbee/schema'

import { loadCanvasKit } from '../node.ts'
import { paragraphCache, type TextLayout } from './layout.ts'

const ck = await loadCanvasKit()
const resources = () => ({ fonts: ck.FontCollection.Make(), fallbackFamilies: [] })
const text = (value: string) =>
  TextProps.parse({
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    text: value,
    style: { fontFamily: 'Noto Sans', fontSize: 16, color: '#000000FF' },
  })
const freed = (laid: TextLayout) => laid.blocks.every((b) => b.paragraph.isDeleted())

describe('paragraphCache', () => {
  it('lays a text out once and hands back the same layout while it is kept', () => {
    const cache = paragraphCache(2)
    const fonts = resources()
    const first = cache.layout(ck, text('a'), fonts)
    expect(cache.layout(ck, text('a'), fonts)).toBe(first)
    cache.delete()
  })

  it('frees the least recently used layout past the limit', () => {
    const cache = paragraphCache(2)
    const fonts = resources()
    const a = cache.layout(ck, text('a'), fonts)
    const b = cache.layout(ck, text('b'), fonts)
    cache.layout(ck, text('a'), fonts)
    const c = cache.layout(ck, text('c'), fonts)
    expect([freed(a), freed(b), freed(c)]).toEqual([false, true, false])
    expect(cache.layout(ck, text('a'), fonts)).toBe(a)
    expect(cache.layout(ck, text('c'), fonts)).toBe(c)
    expect(cache.layout(ck, text('b'), fonts)).not.toBe(b)
    expect(freed(a)).toBe(true)
    cache.delete()
  })

  it('frees every layout when the fonts change, and on delete', () => {
    const cache = paragraphCache(4)
    const before = cache.layout(ck, text('a'), resources())
    const after = cache.layout(ck, text('a'), resources())
    expect(freed(before)).toBe(true)
    cache.delete()
    expect(freed(after)).toBe(true)
  })
})
