import { describe, expect, it } from 'vitest'

import { align, distribute } from './arrange.ts'

const format = { x: 0, y: 0, width: 1080, height: 1080 }

const boxes = [
  { x: 100, y: 100, width: 100, height: 50 },
  { x: 300, y: 220, width: 50, height: 100 },
  { x: 600, y: 160, width: 80, height: 80 },
]

describe('align', () => {
  it('lines several layers up with the box around them', () => {
    expect(align(boxes, 'left', format).map((o) => o.dx)).toEqual([0, -200, -500])
    expect(align(boxes, 'right', format).map((o) => o.dx)).toEqual([480, 330, 0])
    expect(align(boxes, 'centre', format).map((o) => o.dx)).toEqual([240, 65, -250])
    expect(align(boxes, 'bottom', format).map((o) => o.dy)).toEqual([170, 0, 80])
    expect(align(boxes, 'middle', format).map((o) => o.dy)).toEqual([85, -60, 10])
  })

  it('lines one layer up with what holds it', () => {
    expect(align([boxes[0] as never], 'centre', format)).toEqual([{ dx: 390, dy: 0 }])
    expect(align([boxes[0] as never], 'bottom', { x: 0, y: 0, width: 500, height: 400 })).toEqual([{ dx: 0, dy: 250 }])
  })
})

describe('distribute', () => {
  it('spaces three or more out evenly between the first and the last', () => {
    // 680 - 100 = 580 across, 230 of it boxes: gaps of 175.
    expect(distribute(boxes, 'horizontal')).toEqual([
      { dx: 0, dy: 0 },
      { dx: 75, dy: 0 },
      { dx: 0, dy: 0 },
    ])
    expect(distribute(boxes.slice(0, 2), 'vertical')).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ])
  })
})
