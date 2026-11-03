import { describe, expect, it } from 'vitest'

import { lru } from './lru.ts'

/** A cache of `limit` strings that records each value it frees, in order. */
function cache(limit: number) {
  const freed: string[] = []
  return { kept: lru<string, string>(limit, (value) => freed.push(value)), freed }
}

describe('lru', () => {
  it('hands back what was set under a key, and nothing for a key never set', () => {
    const { kept } = cache(2)
    kept.set('a', 'A')
    expect(kept.get('a')).toBe('A')
    expect(kept.get('b')).toBeUndefined()
  })

  it('frees the oldest value past the limit', () => {
    const { kept, freed } = cache(2)
    kept.set('a', 'A')
    kept.set('b', 'B')
    kept.set('c', 'C')
    expect(freed).toEqual(['A'])
    expect([kept.get('a'), kept.get('b'), kept.get('c')]).toEqual([undefined, 'B', 'C'])
  })

  it('counts a get as a use, so the least recently used goes first', () => {
    const { kept, freed } = cache(2)
    kept.set('a', 'A')
    kept.set('b', 'B')
    kept.get('a')
    kept.set('c', 'C')
    expect(freed).toEqual(['B'])
    kept.set('d', 'D')
    expect(freed).toEqual(['B', 'A'])
    expect([kept.get('c'), kept.get('d')]).toEqual(['C', 'D'])
  })

  it('keeps a miss from counting as a use', () => {
    const { kept, freed } = cache(2)
    kept.set('a', 'A')
    kept.set('b', 'B')
    kept.get('c')
    kept.set('c', 'C')
    expect(freed).toEqual(['A'])
  })

  it('frees every value on clear, oldest use first, and keeps none', () => {
    const { kept, freed } = cache(3)
    kept.set('a', 'A')
    kept.set('b', 'B')
    kept.set('c', 'C')
    kept.get('a')
    kept.clear()
    expect(freed).toEqual(['B', 'C', 'A'])
    expect(kept.get('a')).toBeUndefined()
  })
})
