import { describe, expect, it } from 'vitest'

import { needsWelcome, openingBrand, showsBrandList } from './home.ts'

const brand = (id: string) => ({ id, name: id })

describe('where the app opens (#84)', () => {
  it('opens a workspace with one brand on that brand', () => {
    expect(openingBrand([brand('a')])?.id).toBe('a')
    expect(showsBrandList([brand('a')])).toBe(false)
  })

  it('keeps the list for a second brand, or none', () => {
    expect(openingBrand([brand('a'), brand('b')])).toBeNull()
    expect(openingBrand([])).toBeNull()
    expect(showsBrandList([brand('a'), brand('b')])).toBe(true)
  })
})

describe('onboarding (#109)', () => {
  it('opens on onboarding until there is a brand', () => {
    expect(needsWelcome([])).toBe(true)
    expect(needsWelcome([brand('a')])).toBe(false)
  })
})
