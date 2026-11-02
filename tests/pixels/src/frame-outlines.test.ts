// Box outlines: a frame's strokes follow its corners, sit inside, on or outside its edge, go over
// what is inside it and are never cut by its clip, on the CPU surface and in the PDF and SVG.
import { PDFiumLibrary } from '@hyzyla/pdfium'
import { renderDesign, renderVector } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { afterAll, describe, expect, it } from 'vitest'
import { fixtureResources } from './pixels.ts'
import { overWhite, rasterisePdf, rasteriseSvg, vectorDifference } from './vector.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()
const pdfium = await PDFiumLibrary.init()
afterAll(() => pdfium.destroy())

const solid = (color: string) => [{ type: 'solid', color }]
/** A 300 square page: a blue box at 50,50, 200 square, clipping a red square that fills it and more, outlined in black. */
const design = (align: 'inside' | 'center' | 'outside', frame: Record<string, unknown> = {}) => ({
  meta: { schemaVersion: 5, designId: 'd', name: 'Outlines', kind: 'single', primaryFormatId: 'f' },
  formats: { f: { name: 'F', width: 300, height: 300, order: 'a0' } },
  pages: { p1: { name: 'Page', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes: {
    box: {
      type: 'frame', parentId: 'p1', index: 'a0', name: 'Box',
      props: { x: 50, y: 50, width: 200, height: 200, fills: solid('#2050E0FF'), strokes: [{ paint: { type: 'solid', color: '#000000FF' }, width: 10, align }], ...frame },
    },
    inner: { type: 'graphic', parentId: 'box', index: 'a0', name: 'Inner', props: { x: 0, y: 0, width: 300, height: 300, shape: { kind: 'rect' }, fills: solid('#E02020FF') } },
  },
  overrides: {},
})
const at = (r: { pixels: Uint8Array; width: number }, x: number, y: number) => [...r.pixels.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 3)]
const WHITE = [255, 255, 255]
const RED = [224, 32, 32]
const BLACK = [0, 0, 0]

describe('box outlines', () => {
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
    // Outside the clip, the outline shows whole.
    const outside = renderDesign(ck, design('outside'), 'p1', 'f', bytes)
    expect(at(outside, 42, 150)).toEqual(BLACK)
    expect(at(outside, 47, 150)).toEqual(BLACK)
    expect(at(outside, 52, 150)).toEqual(RED)
    expect(at(outside, 38, 150)).toEqual(WHITE)
  })

  it('follow the box\'s corners', () => {
    const r = renderDesign(ck, design('inside', { cornerRadius: 60 }), 'p1', 'f', bytes)
    // The square corner's spot is outside the rounded box; along the curve the outline shows.
    expect(at(r, 53, 53)).toEqual(WHITE)
    expect(at(r, 150, 53)).toEqual(BLACK)
    const each = renderDesign(ck, design('outside', { cornerRadius: [0, 80, 0, 80] }), 'p1', 'f', bytes)
    expect(at(each, 46, 46)).toEqual(BLACK)
    expect(at(each, 254, 46)).toEqual(WHITE)
  })

  it('draw the same in the PDF and the SVG as on the CPU', async () => {
    for (const [align, frame] of [['inside', { cornerRadius: 40 }], ['center', { cornerRadius: [0, 60, 10, 80] }], ['outside', { cornerRadius: 40, clip: false }]] as const) {
      const json = design(align, frame)
      const cpu = overWhite(renderDesign(ck, json, 'p1', 'f', bytes))
      const pdf = await rasterisePdf(pdfium, renderVector(ck, json, 'p1', 'f', bytes, 'pdf'))
      const svg = rasteriseSvg(renderVector(ck, json, 'p1', 'f', bytes, 'svg'))
      expect(vectorDifference(cpu, pdf), `PDF ${align}`).toBeLessThan(1)
      expect(vectorDifference(cpu, svg), `SVG ${align}`).toBeLessThan(1)
    }
  })
})
