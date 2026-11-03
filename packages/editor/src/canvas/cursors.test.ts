import { describe, expect, it } from 'vitest'

import { resizeCursor } from './cursors.ts'

describe('resizeCursor', () => {
  it('points along the handle on an upright box', () => {
    expect(resizeCursor('e', 0)).toBe('ew-resize')
    expect(resizeCursor('w', 0)).toBe('ew-resize')
    expect(resizeCursor('n', 0)).toBe('ns-resize')
    expect(resizeCursor('se', 0)).toBe('nwse-resize')
    expect(resizeCursor('ne', 0)).toBe('nesw-resize')
  })

  it('turns with the box, to the nearest of the four', () => {
    expect(resizeCursor('e', 90)).toBe('ns-resize')
    expect(resizeCursor('e', -45)).toBe('nesw-resize')
    expect(resizeCursor('e', 170)).toBe('ew-resize')
    expect(resizeCursor('s', 400)).toBe('nesw-resize')
  })
})
