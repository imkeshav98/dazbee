// A path in a box of another size than it was drawn in is drawn scaled to fit (#278): the same
// pixels as its data drawn at that size, in each format, on the CPU surface and in the PDF and SVG.
// A path with no box it was drawn in is drawn at its own size, as before.
import { afterAll, describe, expect, it } from 'vitest'

import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { comparePixels, fixtureResources } from './pixels.ts'
import { renderThreeWays, startPdfium, vectorDifference } from './vector.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()
const pdfium = await startPdfium(afterAll)

/** A blob with a hole, a gradient fill and a stroke, drawn in a 100 × 50 box. */
const D =
  'M0 25 C0 0 40 0 50 10 C60 0 100 0 100 25 C100 50 60 50 50 40 C40 50 0 50 0 25 Z M30 25 L50 15 L70 25 L50 35 Z'
/** The same outline drawn in a 300 × 100 box. */
const D_SCALED =
  'M0 50 C0 0 120 0 150 20 C180 0 300 0 300 50 C300 100 180 100 150 80 C120 100 0 100 0 50 Z M90 50 L150 30 L210 50 L150 70 Z'

const paint = {
  fills: [
    {
      type: 'linear',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
      stops: [
        { offset: 0, color: '#FF2E7EFF' },
        { offset: 1, color: '#2F6BFFFF' },
      ],
    },
  ],
  strokes: [{ paint: { type: 'solid', color: '#1F2329FF' }, width: 6 }],
}
const design = (
  shape: Record<string, unknown>,
  box: { width: number; height: number },
  wide?: { width: number; height: number },
) => ({
  meta: { designId: 'd', name: 'Path scale', kind: 'single', primaryFormatId: 'f' },
  formats: {
    f: { name: 'F', width: 400, height: 200, order: 'a0' },
    w: { name: 'W', width: 400, height: 200, order: 'a1' },
  },
  pages: { p1: { name: 'Page', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    blob: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Blob',
      props: { x: 50, y: 50, ...box, shape: { kind: 'path', fillRule: 'evenodd', ...shape }, ...paint },
    },
  },
  overrides: wide ? { 'format:w': { blob: wide } } : {},
})

describe('path scale', () => {
  it('draws a path scaled to its box as its data drawn at that size, on the CPU and in PDF and SVG', () => {
    const scaled = design({ d: D, drawnIn: { width: 100, height: 50 } }, { width: 300, height: 100 })
    const drawnAtSize = design({ d: D_SCALED }, { width: 300, height: 100 })
    const a = renderDesign(ck, scaled, 'p1', 'f', bytes)
    const b = renderDesign(ck, drawnAtSize, 'p1', 'f', bytes)
    expect(comparePixels(b, a).differing).toBe(0)
  })

  it('scales each format by its own box', () => {
    const json = design(
      { d: D, drawnIn: { width: 100, height: 50 } },
      { width: 100, height: 50 },
      { width: 300, height: 100 },
    )
    const base = renderDesign(ck, json, 'p1', 'f', bytes)
    const wide = renderDesign(ck, json, 'p1', 'w', bytes)
    expect(
      comparePixels(renderDesign(ck, design({ d: D }, { width: 100, height: 50 }), 'p1', 'f', bytes), base).differing,
    ).toBe(0)
    expect(
      comparePixels(renderDesign(ck, design({ d: D_SCALED }, { width: 300, height: 100 }), 'p1', 'f', bytes), wide)
        .differing,
    ).toBe(0)
  })

  it('exports a scaled path as it is drawn, in PDF and SVG', async () => {
    const json = design({ d: D, drawnIn: { width: 100, height: 50 } }, { width: 300, height: 100 })
    const { cpu, pdf, svg } = await renderThreeWays(ck, pdfium, json, 'p1', 'f', bytes)
    expect(vectorDifference(cpu, pdf)).toBeLessThan(1)
    expect(vectorDifference(cpu, svg)).toBeLessThan(1)
  })

  it('draws a path with no box it was drawn in at its own size, whatever its box', () => {
    const unsized = renderDesign(ck, design({ d: D }, { width: 300, height: 100 }), 'p1', 'f', bytes)
    const atOwnSize = renderDesign(ck, design({ d: D }, { width: 100, height: 50 }), 'p1', 'f', bytes)
    // The gradient spans the box, so only the outline is compared: where each draws anything at all.
    const ink = (r: { pixels: Uint8Array }) =>
      Array.from(
        { length: r.pixels.length / 4 },
        (_, i) => (r.pixels[i * 4] ?? 255) < 250 || (r.pixels[i * 4 + 2] ?? 255) < 250,
      )
    expect(ink(unsized)).toEqual(ink(atOwnSize))
  })
})
