import { describe, expect, it } from 'vitest'

import { lru } from './lru.ts'

/** A cache of `limit` strings, each made as its key in capitals, that records what it makes and frees. */
function cache(limit: number) {
  const made: string[] = []
  const freed: string[] = []
  const kept = lru<string, string>(limit, (value) => freed.push(value))
  const get = (key: string) =>
    kept.get(key, () => {
      made.push(key.toUpperCase())
      return key.toUpperCase()
    })
  return { get, clear: kept.clear, made, freed }
}

describe('lru', () => {
  it('makes a value once and hands it back while it is kept', () => {
    const { get, made } = cache(2)
    expect(get('a')).toBe('A')
    expect(get('a')).toBe('A')
    expect(made).toEqual(['A'])
  })

  it('frees the oldest value past the limit', () => {
    const { get, made, freed } = cache(2)
    get('a')
    get('b')
    get('c')
    expect(freed).toEqual(['A'])
    get('b')
    get('c')
    expect(made).toEqual(['A', 'B', 'C'])
  })

  it('counts a hit as a use, so the least recently used goes first', () => {
    const { get, freed } = cache(2)
    get('a')
    get('b')
    get('a')
    get('c')
    expect(freed).toEqual(['B'])
    get('d')
    expect(freed).toEqual(['B', 'A'])
  })

  it('frees every value on clear, oldest use first, and keeps none', () => {
    const { get, clear, made, freed } = cache(3)
    get('a')
    get('b')
    get('c')
    get('a')
    clear()
    expect(freed).toEqual(['B', 'C', 'A'])
    get('a')
    expect(made).toEqual(['A', 'B', 'C', 'A'])
  })
})
