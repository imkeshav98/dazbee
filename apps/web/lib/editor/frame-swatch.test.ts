import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import { swatchOf } from './frame-swatch.ts'

/** A design with one frame, `f`, filled with the paints given. */
const withFills = (fills: unknown[]) => ({ frames: { f: { fills } } }) as unknown as Design

describe('swatchOf', () => {
  it('gives the top fill that shows as it looks, its alpha and its opacity kept', () => {
    expect(swatchOf(withFills([{ type: 'solid', color: '#FF000080' }]), 'f')).toBe('#FF000080')
    expect(swatchOf(withFills([{ type: 'solid', color: '#218A5CFF', opacity: 0.5 }]), 'f')).toBe('#218A5C80')
    expect(
      swatchOf(
        withFills([
          { type: 'solid', color: '#218A5CFF' },
          { type: 'solid', color: '#FFFFFFFF', visible: false },
        ]),
        'f',
      ),
    ).toBe('#218A5CFF')
  })

  it('gives a gradient’s first stop, mixed for an image, and none for no fill that shows', () => {
    const stops = [
      { color: '#FFD23FFF', at: 0 },
      { color: '#000000FF', at: 1 },
    ]
    expect(swatchOf(withFills([{ type: 'linear', stops }]), 'f')).toBe('#FFD23FFF')
    expect(swatchOf(withFills([{ type: 'image', assetId: 'a' }]), 'f')).toBe('mixed')
    expect(swatchOf(withFills([{ type: 'solid', color: '#FFFFFFFF', visible: false }]), 'f')).toBe('none')
    expect(swatchOf(withFills([]), 'gone')).toBe('none')
  })
})
