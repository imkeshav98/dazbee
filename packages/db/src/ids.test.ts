import { describe, expect, it } from 'vitest'

import { newId } from './ids.ts'

describe('newId', () => {
  it('makes 12 characters of lowercase letters and digits', () => {
    for (let i = 0; i < 1000; i++) expect(newId()).toMatch(/^[0-9a-z]{12}$/)
  })

  it('repeats no id in 100,000 made in a row', () => {
    const ids = new Set(Array.from({ length: 100_000 }, () => newId()))
    expect(ids.size).toBe(100_000)
  })
})
