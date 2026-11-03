// The colours a design already uses, for the Colour panel's "In this design" row.
import { describe, expect, it } from 'vitest'

import { DESIGN_COLOURS_SHOWN, designColours } from './design-colours.ts'

const solid = (color: string) => ({ type: 'solid', color })

describe('the colours a design uses', () => {
  it('takes the pages’ and layers’ solid fills, outlines and text, each once, as #RRGGBB', () => {
    const colours = designColours({
      pages: { p1: { fills: [solid('#fff8f0ff')] } },
      nodes: {
        a: {
          props: {
            fills: [solid('#C2106CFF'), { type: 'image', assetId: 'x' }],
            strokes: [{ paint: solid('#15121AFF') }],
          },
        },
        b: { props: { style: { color: '#c2106c80' } } },
        c: { props: { fills: [{ type: 'linear', stops: [] }] } },
      },
    })
    expect(colours).toEqual(['#FFF8F0', '#C2106C', '#15121A'])
  })

  it('keeps the first few only', () => {
    const nodes = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `n${i}`,
        { props: { fills: [solid(`#0000${String(i).padStart(2, '0')}FF`)] } },
      ]),
    )
    expect(designColours({ pages: {}, nodes })).toHaveLength(DESIGN_COLOURS_SHOWN)
  })
})
