import { describe, expect, it } from 'vitest'

import { FORMAT_PRESETS, FORMAT_SHAPES, formatSizeProblem, shapeOf } from './formats.ts'

describe('format sizes', () => {
  it('offers presets inside the limits, at least one of every shape', () => {
    for (const preset of FORMAT_PRESETS)
      expect(formatSizeProblem(preset.width, preset.height), preset.id).toBeUndefined()
    expect(new Set(FORMAT_PRESETS.map((p) => shapeOf(p.width, p.height)))).toEqual(new Set(FORMAT_SHAPES))
  })

  it('runs from 1:3 to 3:1 with a short side of at least 100 px', () => {
    expect(formatSizeProblem(1500, 500)).toBeUndefined()
    expect(formatSizeProblem(500, 1500)).toBeUndefined()
    expect(formatSizeProblem(1501, 500)).toMatch(/1:3 to 3:1/)
    expect(formatSizeProblem(320, 50)).toMatch(/short side/)
    expect(formatSizeProblem(8001, 8000)).toMatch(/at most 8000/)
    expect(formatSizeProblem(100.5, 200)).toMatch(/whole number/)
  })
})
