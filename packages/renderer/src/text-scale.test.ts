import { describe, expect, it } from 'vitest'
import { scaled, scaleText, smallestSize } from './text-scale.ts'

const style = { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 800, fontStyle: 'normal' as const, color: '#111111FF', letterSpacing: 2, lineHeight: 1.2, outline: { width: 3, color: '#000000FF' } }

describe('scaling text', () => {
  it('scales a style\'s font size, letter spacing and outline width, and leaves line height, a multiple of the size', () => {
    expect(scaled(style, 1.5)).toMatchObject({ fontSize: 96, letterSpacing: 3, lineHeight: 1.2, outline: { width: 4.5 } })
    expect(scaled(style, 1)).toBe(style)
  })

  it('scales the style, each run, paragraph spacing and shrink to fit\'s sizes, each to the nearest 0.1', () => {
    const props = {
      style,
      runs: [{ start: 0, end: 6, style: { fontSize: 120 } }, { start: 7, end: 11, style: { color: '#FF3D6EFF' } }],
      paragraphSpacing: 10,
      shrinkToFit: { min: 12, max: 64 },
    }
    expect(scaleText(props, 1.25)).toEqual({
      style: { ...style, fontSize: 80, letterSpacing: 2.5, outline: { width: 3.8, color: '#000000FF' } },
      runs: [{ start: 0, end: 6, style: { fontSize: 150 } }, { start: 7, end: 11, style: { color: '#FF3D6EFF' } }],
      paragraphSpacing: 12.5,
      shrinkToFit: { min: 15, max: 80 },
    })
    // Without paragraph spacing or shrink to fit, none is added.
    expect(scaleText({ style, runs: [] }, 0.5)).toEqual({ style: { ...style, fontSize: 32, letterSpacing: 1, outline: { width: 1.5, color: '#000000FF' } }, runs: [] })
  })

  it('finds the smallest size the text has: its own, a run\'s or shrink to fit\'s smallest', () => {
    expect(smallestSize({ style, runs: [] })).toBe(64)
    expect(smallestSize({ style, runs: [{ start: 0, end: 2, style: { fontSize: 20 } }] })).toBe(20)
    expect(smallestSize({ style, runs: [], shrinkToFit: { min: 8, max: 64 } })).toBe(8)
  })
})
