import { describe, expect, it } from 'vitest'

import { comparePixels } from './pixels.ts'

describe('comparePixels', () => {
  const px = (...values: number[]) => ({ width: values.length / 4, height: 1, pixels: new Uint8Array(values) })

  it('counts a pixel that differs in any one channel', () => {
    expect(comparePixels(px(1, 2, 3, 255, 9, 9, 9, 255), px(1, 2, 3, 254, 9, 9, 9, 255)).differing).toBe(1)
  })

  it('marks differing pixels magenta in the diff image', () => {
    const { diff } = comparePixels(px(0, 0, 0, 255, 0, 0, 0, 255), px(0, 0, 0, 255, 1, 0, 0, 255))
    expect([...diff.pixels.subarray(4)]).toEqual([255, 0, 255, 255])
  })

  it('refuses images of different sizes', () => {
    expect(() => comparePixels(px(0, 0, 0, 0), px(0, 0, 0, 0, 0, 0, 0, 0))).toThrow('differs from the reference')
  })
})
