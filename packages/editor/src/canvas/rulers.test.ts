import { describe, expect, it } from 'vitest'

import { rulerStep } from './rulers.ts'

describe('rulerStep', () => {
  it('number every 1, 2 or 5 times a power of ten that keeps numbers 64 screen pixels apart', () => {
    expect(rulerStep(0.8)).toBe(100)
    expect(rulerStep(1)).toBe(100)
    expect(rulerStep(4)).toBe(20)
    expect(rulerStep(0.1)).toBe(1000)
    expect(rulerStep(32)).toBe(2)
  })
})
