import { describe, expect, it } from 'vitest'

import { nameFromWebsite } from './brand-start.ts'

describe('nameFromWebsite', () => {
  it('names a brand from its website', () => {
    expect(nameFromWebsite('harbourcoffee.com')).toBe('Harbourcoffee')
    expect(nameFromWebsite('https://www.harbour-coffee.com/menu?x=1')).toBe('Harbour Coffee')
    expect(nameFromWebsite('northline-cycles.co.uk')).toBe('Northline Cycles')
    expect(nameFromWebsite('http://shop.kite_studio.io')).toBe('Kite Studio')
    expect(nameFromWebsite('localhost')).toBe('Localhost')
    expect(nameFromWebsite('')).toBeNull()
    expect(nameFromWebsite('not a site at all')).toBeNull()
  })
})
