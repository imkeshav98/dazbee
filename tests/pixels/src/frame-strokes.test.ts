// Frame strokes: they follow the frame's corners, sit inside, on or outside its edge, go over what
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
/** A 300 square page: a blue frame at 50,50, 200 square, clipping a red square that fills it and more, stroked in black. */
const design = (align: 'inside' | 'center' | 'outside', frame: Record<string, unknown> = {}) => ({
  meta: { designId: 'd', name: 'Outlines', kind: 'single', primaryFormatId: 'f' },
  formats: { f: { name: 'F', width: 300, height: 300, order: 'a0' } },
  pages: { p1: { name: 'Page', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes: {
    box: {
      type: 'frame',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        fills: solid('#2050E0FF'),
        strokes: [{ paint: { type: 'solid', color: '#000000FF' }, width: 10, align }],
        ...frame,
      },
    },
    inner: {
      type: 'graphic',
      parentId: 'box',
      index: 'a0',
      name: 'Inner',
      props: { x: 0, y: 0, width: 300, height: 300, shape: { kind: 'rect' }, fills: solid('#E02020FF') },
    },
  },
  overrides: {},
})
const WHITE = [255, 255, 255]
const RED = [224, 32, 32]
const BLACK = [0, 0, 0]

describe('frame strokes', () => {
  it('sit inside, on or outside the edge, over what is inside and past the clip', () => {
    const inside = renderDesign(ck, design('inside'), 'p1', 'f', bytes)
    expect(at(inside, 52, 150)).toEqual(BLACK)
    expect(at(inside, 58, 150)).toEqual(BLACK)
    expect(at(inside, 62, 150)).toEqual(RED)
    expect(at(inside, 47, 150)).toEqual(WHITE)
    const center = renderDesign(ck, design('center'), 'p1', 'f', bytes)
    expect(at(center, 46, 150)).toEqual(BLACK)
    expect(at(center, 53, 150)).toEqual(BLACK)
    expect(at(center, 57, 150)).toEqual(RED)
    // Outside the clip, the stroke shows whole.
    const outside = renderDesign(ck, design('outside'), 'p1', 'f', bytes)
    expect(at(outside, 42, 150)).toEqual(BLACK)
    expect(at(outside, 47, 150)).toEqual(BLACK)
    expect(at(outside, 52, 150)).toEqual(RED)
    expect(at(outside, 38, 150)).toEqual(WHITE)
  })

  it("follow the frame's corners", () => {
    const r = renderDesign(ck, design('inside', { cornerRadius: 60 }), 'p1', 'f', bytes)
    // The square corner's spot is outside the rounded frame; along the curve the stroke shows.
    expect(at(r, 53, 53)).toEqual(WHITE)
    expect(at(r, 150, 53)).toEqual(BLACK)
    const each = renderDesign(ck, design('outside', { cornerRadius: [0, 80, 0, 80] }), 'p1', 'f', bytes)
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
      // A paint SVG can't hold is drawn as a picture, on a turned frame too.
      ['outside', { cornerRadius: 20, rotation: 90, height: 100, strokes: [angular] }],
    ] as const
    for (const [align, frame] of cases) {
      const { cpu, pdf, svg } = await renderThreeWays(ck, pdfium, design(align, frame), 'p1', 'f', bytes)
      expect(vectorDifference(cpu, pdf), `PDF ${align} ${JSON.stringify(frame)}`).toBeLessThan(1)
      expect(vectorDifference(cpu, svg), `SVG ${align} ${JSON.stringify(frame)}`).toBeLessThan(1)
    }
  })
})
