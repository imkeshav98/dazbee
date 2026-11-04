// Box strokes: they follow the box's corners, sit inside, on or outside its edge, go over what
// is inside it and are never cut by its clip, on the CPU surface and in the PDF and SVG.
import { afterAll, describe, expect, it } from 'vitest'

import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { at, fixtureResources } from './pixels.ts'
import { renderThreeWays, startPdfium, vectorDifference } from './vector.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()
const pdfium = await startPdfium(afterAll)

const solid = (color: string) => [{ type: 'solid', color }]
/** A 300 square frame: a blue box at 50,50, 200 square, clipping a red square that fills it and more, stroked in black. */
const design = (align: 'inside' | 'center' | 'outside', boxProps: Record<string, unknown> = {}) => ({
  meta: { designId: 'd', name: 'Outlines' },
  pages: { p1: { name: 'Page', order: 'a0' } },
  frames: {
    f: { pageId: 'p1', name: 'F', width: 300, height: 300, x: 0, y: 0, fills: solid('#FFFFFFFF'), order: 'a0' },
  },
  nodes: {
    box: {
      type: 'box',
      parentId: 'f',
      link: 'box',
      index: 'a0',
      name: 'Box',
      props: {
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        fills: solid('#2050E0FF'),
        strokes: [{ paint: { type: 'solid', color: '#000000FF' }, width: 10, align }],
        ...boxProps,
      },
    },
    inner: {
      type: 'graphic',
      parentId: 'box',
      link: 'inner',
      index: 'a0',
      name: 'Inner',
      props: { x: 0, y: 0, width: 300, height: 300, shape: { kind: 'rect' }, fills: solid('#E02020FF') },
    },
  },
})
const WHITE = [255, 255, 255]
const RED = [224, 32, 32]
const BLACK = [0, 0, 0]

describe('box strokes', () => {
  it('sit inside, on or outside the edge, over what is inside and past the clip', () => {
    const inside = renderDesign(ck, design('inside'), 'f', bytes)
    expect(at(inside, 52, 150)).toEqual(BLACK)
    expect(at(inside, 58, 150)).toEqual(BLACK)
    expect(at(inside, 62, 150)).toEqual(RED)
    expect(at(inside, 47, 150)).toEqual(WHITE)
    const center = renderDesign(ck, design('center'), 'f', bytes)
    expect(at(center, 46, 150)).toEqual(BLACK)
    expect(at(center, 53, 150)).toEqual(BLACK)
    expect(at(center, 57, 150)).toEqual(RED)
    // Outside the clip, the stroke shows whole.
    const outside = renderDesign(ck, design('outside'), 'f', bytes)
    expect(at(outside, 42, 150)).toEqual(BLACK)
    expect(at(outside, 47, 150)).toEqual(BLACK)
    expect(at(outside, 52, 150)).toEqual(RED)
    expect(at(outside, 38, 150)).toEqual(WHITE)
  })

  it("follow the box's corners", () => {
    const r = renderDesign(ck, design('inside', { cornerRadius: 60 }), 'f', bytes)
    // The square corner's spot is outside the rounded box; along the curve the stroke shows.
    expect(at(r, 53, 53)).toEqual(WHITE)
    expect(at(r, 150, 53)).toEqual(BLACK)
    const each = renderDesign(ck, design('outside', { cornerRadius: [0, 80, 0, 80] }), 'f', bytes)
    expect(at(each, 46, 46)).toEqual(BLACK)
    expect(at(each, 254, 46)).toEqual(WHITE)
  })

  it('draw the same in the PDF and the SVG as on the CPU', async () => {
    const angular = {
      paint: {
        type: 'angular',
        center: { x: 0.5, y: 0.5 },
        angle: 0,
        stops: [
          { offset: 0, color: '#E0157FFF' },
          { offset: 1, color: '#3D6BFFFF' },
        ],
      },
      width: 12,
      align: 'outside',
    }
    const cases = [
      ['inside', { cornerRadius: 40 }],
      ['center', { cornerRadius: [0, 60, 10, 80] }],
      ['outside', { cornerRadius: 40 }],
      ['outside', { cornerRadius: 40, clip: false }],
      // A paint SVG can't hold is drawn as a picture, on a turned box too.
      ['outside', { cornerRadius: 20, rotation: 90, height: 100, strokes: [angular] }],
    ] as const
    for (const [align, boxProps] of cases) {
      const { cpu, pdf, svg } = await renderThreeWays(ck, pdfium, design(align, boxProps), 'f', bytes)
      expect(vectorDifference(cpu, pdf), `PDF ${align} ${JSON.stringify(boxProps)}`).toBeLessThan(1)
      expect(vectorDifference(cpu, svg), `SVG ${align} ${JSON.stringify(boxProps)}`).toBeLessThan(1)
    }
  })
})
