import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { png } from '../test-files.ts'
import { readImageHeader } from './images.ts'

describe('image headers', () => {
  it('reads a PNG', () => {
    expect(readImageHeader(png(37, 12, 'x'))).toEqual({ contentType: 'image/png', width: 37, height: 12 })
  })

  it('reads a JPEG past its other markers', () => {
    const jpeg = new Uint8Array(readFileSync(join(import.meta.dirname, '../../../../tests/pixels/assets/sneaker.jpg')))
    expect(readImageHeader(jpeg)).toMatchObject({
      contentType: 'image/jpeg',
      width: expect.any(Number),
      height: expect.any(Number),
    })
  })

  it('reads each kind of WebP', () => {
    const riff = (chunkName: string, body: number[]) =>
      new Uint8Array([
        ...Buffer.from('RIFF'),
        0,
        0,
        0,
        0,
        ...Buffer.from('WEBP'),
        ...Buffer.from(chunkName),
        0,
        0,
        0,
        0,
        ...body,
        ...new Array(20).fill(0),
      ])
    // VP8X: 24-bit width and height minus one at bytes 24 and 27.
    expect(readImageHeader(riff('VP8X', [0, 0, 0, 0, 99, 0, 0, 49, 0, 0]))).toEqual({
      contentType: 'image/webp',
      width: 100,
      height: 50,
    })
    // VP8L: signature byte, then 14-bit width and height minus one.
    const bits = (300 - 1) | ((200 - 1) << 14)
    expect(
      readImageHeader(riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff])),
    ).toEqual({ contentType: 'image/webp', width: 300, height: 200 })
  })

  it('refuses what is not an image, or claims an absurd size', () => {
    expect(readImageHeader(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0x00]))).toBeNull()
    expect(readImageHeader(png(20_000, 1, 'x'))).toBeNull()
  })
})
