import { describe, expect, it } from 'vitest'

import { alphaOf, byCodeUnits, inOrder, withAlpha, withHex } from './primitives.ts'

const pages = {
  p3: { name: 'Three', order: 'a2' },
  p1: { name: 'One', order: 'a0' },
  p2b: { name: 'Two b', order: 'a1' },
  p2a: { name: 'Two a', order: 'a1' },
}

describe('byCodeUnits', () => {
  it('orders strings by UTF-16 code units, not by locale', () => {
    expect(['b', 'a', 'B', 'A'].sort(byCodeUnits)).toEqual(['A', 'B', 'a', 'b'])
    expect(byCodeUnits('a0', 'a0')).toBe(0)
    expect(byCodeUnits('a0', 'a1')).toBe(-1)
    expect(byCodeUnits('a1', 'a0')).toBe(1)
    // An emoji starts with a surrogate (0xD83D), which comes before U+FFFF though its code point is larger.
    expect(byCodeUnits('😀', '￿')).toBe(-1)
  })
})

describe('inOrder', () => {
  it('lists a record by order, ties broken by id', () => {
    expect(inOrder(pages).map(([id]) => id)).toEqual(['p1', 'p2a', 'p2b', 'p3'])
    expect(inOrder(pages)[0]).toEqual(['p1', pages.p1])
  })

  it('compares orders and ids by code units', () => {
    const items = { b: { order: 'a' }, a: { order: 'B' }, Z: { order: 'a' } }
    expect(inOrder(items).map(([id]) => id)).toEqual(['a', 'Z', 'b'])
  })

  it('leaves the record as it was', () => {
    const before = Object.keys(pages)
    inOrder(pages)
    expect(Object.keys(pages)).toEqual(before)
  })
})

describe('alphaOf', () => {
  it('reads a colour’s alpha from 0 to 1, opaque when it has none', () => {
    expect(alphaOf('#FF000080')).toBeCloseTo(128 / 255)
    expect(alphaOf('#ff0000ff')).toBe(1)
    expect(alphaOf('#FF000000')).toBe(0)
    expect(alphaOf('#FF0000')).toBe(1)
  })
})

describe('withAlpha', () => {
  it('sets a colour’s alpha, kept from 0 to 1', () => {
    expect(withAlpha('#12AB34FF', 0.5)).toBe('#12AB3480')
    expect(withAlpha('#12ab34', 0)).toBe('#12ab3400')
    expect(withAlpha('#12AB3400', 2)).toBe('#12AB34FF')
    expect(withAlpha('#12AB34FF', -1)).toBe('#12AB3400')
  })
})

describe('withHex', () => {
  it('sets a colour’s red, green and blue, keeping its alpha', () => {
    expect(withHex('#12AB3480', '#FFFFFF')).toBe('#FFFFFF80')
    expect(withHex('#12AB34', '#000000')).toBe('#000000FF')
  })
})
