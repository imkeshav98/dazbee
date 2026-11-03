import { describe, expect, it } from 'vitest'

import { boundsOf, type Box, normalAngle } from './geometry.ts'

const near = (b: Box) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))

describe('angles and bounds', () => {
  it('keeps angles in (-180, 180] and snaps to 15° steps', () => {
    expect(normalAngle(190)).toBe(-170)
    expect(normalAngle(-180)).toBe(180)
  })

  it('bounds turned boxes as they are drawn', () => {
    const b = boundsOf([
      { x: 0, y: 0, width: 100, height: 100, rotation: 45 },
      { x: 200, y: 0, width: 10, height: 10, rotation: 0 },
    ])
    expect(near(b)).toEqual({ x: -20.711, y: -20.711, width: 230.711, height: 141.421, rotation: 0 })
  })
})
