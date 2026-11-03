import { describe, expect, it } from 'vitest'

import { SNAP_DISTANCE, snapMove, snapResize, snapTargets } from './snap.ts'
import { boundsOf } from './transform.ts'

const format = { x: 0, y: 0, width: 1080, height: 1080 }
const a = { x: 100, y: 100, width: 200, height: 100 }
const b = { x: 600, y: 400, width: 100, height: 100 }

describe('snapping a move', () => {
  it('lines up edges and centres with other layers and the format, showing why', () => {
    const targets = snapTargets([a, b], format)
    // Its left edge 4 px past A's: it snaps back onto it, and a guide spans both.
    const s = snapMove({ x: 104, y: 300, width: 80, height: 80 }, targets, 6)
    expect(s.dx).toBe(-4)
    expect(s.guides).toContainEqual({ axis: 'x', at: 100, from: 100, to: 380 })
    // Its centre near the format's centre lines up with it.
    const c = snapMove({ x: 497, y: 700, width: 80, height: 80 }, targets, 6)
    expect(c.dx).toBe(3)
    expect(c.guides.some((g) => g.axis === 'x' && g.at === 540)).toBe(true)
  })

  it('reaches as many screen pixels at any zoom', () => {
    const targets = snapTargets([a], format)
    const moving = { x: 112, y: 600, width: 60, height: 60 }
    // 12 design pixels away: out of reach at 100%, in reach at 50% where they are 6 on screen.
    expect(snapMove(moving, targets, SNAP_DISTANCE / 1).dx).toBe(0)
    expect(snapMove(moving, targets, SNAP_DISTANCE / 0.5).dx).toBe(-12)
    expect(snapMove(moving, targets, SNAP_DISTANCE / 4).dx).toBe(0)
  })

  it('snaps a turned layer by the box around it as drawn', () => {
    const turned = boundsOf([{ x: 300, y: 600, width: 100, height: 100, rotation: 45 }])
    const s = snapMove(turned, snapTargets([a], format), 6)
    // Its drawn left edge is at 279.3: 20.7 from A's right edge, so out of reach; its centre 350
    // is not near A's lines either. Moved so its drawn left edge is 3 past A's right, it snaps.
    expect(s.dx).toBe(0)
    const near = { ...turned, x: 303 }
    expect(snapMove(near, snapTargets([a], format), 6).dx).toBeCloseTo(-3)
  })

  it('keeps an axis held still by shift', () => {
    const s = snapMove({ x: 104, y: 103, width: 80, height: 80 }, snapTargets([a], format), 6, { y: true })
    expect(s).toMatchObject({ dx: -4, dy: 0 })
  })

  it('snaps to equal spacing: centred between neighbours, or as far as two others are apart', () => {
    const left = { x: 100, y: 500, width: 100, height: 100 }
    const right = { x: 500, y: 500, width: 100, height: 100 }
    const targets = snapTargets([left, right], format)
    // Centred between them, 100 from each.
    const centred = snapMove({ x: 297, y: 520, width: 100, height: 60 }, targets, 6)
    expect(centred.dx).toBe(3)
    expect(centred.gaps.map((g) => [g.from, g.to])).toEqual([
      [200, 300],
      [400, 500],
    ])
    // Past the right one at the same 300 gap the other two have.
    const after = snapMove({ x: 896, y: 520, width: 100, height: 60 }, targets, 6)
    expect(after.dx).toBe(4)
    expect(after.gaps.map((g) => [g.from, g.to])).toEqual([
      [200, 500],
      [600, 900],
    ])
  })

  it('stays put with nothing in reach', () => {
    expect(snapMove({ x: 830, y: 820, width: 50, height: 50 }, snapTargets([a, b], format), 6)).toEqual({
      dx: 0,
      dy: 0,
      guides: [],
      gaps: [],
    })
  })
})

describe('snapping a resize', () => {
  it('snaps only the edges the handle moves', () => {
    const targets = snapTargets([a], format)
    // Dragging the east edge to 297: it snaps to A's right edge at 300.
    const s = snapResize({ x: 200, y: 400, width: 97, height: 103 }, 'e', targets, 6)
    expect(s).toMatchObject({ dx: 3, dy: 0 })
    expect(s.guides.every((g) => g.axis === 'x' && g.at === 300)).toBe(true)
    // The south-west corner moves the west and south edges: west to A's left, south to the format's centre.
    const sw = snapResize({ x: 98, y: 400, width: 200, height: 138 }, 'sw', targets, 6)
    expect(sw).toMatchObject({ dx: 2, dy: 2 })
  })

  it('with the shape kept, snaps the corner edge nearest a guide and leaves the other to follow', () => {
    const targets = snapTargets([a], format)
    // The same corner, the west edge 2 off a guide and the south edge 2 off one: only the nearer, by its axis order, snaps.
    const sw = snapResize({ x: 97, y: 400, width: 200, height: 139 }, 'sw', targets, 6, true)
    expect(sw.dx !== 0 && sw.dy !== 0).toBe(false)
    expect(Math.abs(sw.dx) + Math.abs(sw.dy)).toBeGreaterThan(0)
    // Its guides are the snapped axis's only.
    const axis = sw.dx !== 0 ? 'x' : 'y'
    expect(sw.guides.every((g) => g.axis === axis)).toBe(true)
  })
})
