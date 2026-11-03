// Rounded boxes: a frame's fills, its clip and its shadow follow its corners, one radius or each
// corner's own, on the CPU surface and in the PDF and SVG exports alike.
import { afterAll, describe, expect, it } from 'vitest'

import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { at, fixtureResources } from './pixels.ts'
import { renderThreeWays, startPdfium, vectorDifference } from './vector.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()
const pdfium = await startPdfium(afterAll)

const solid = (color: string) => [{ type: 'solid', color }]
/** A 300 square page: a blue box at 20,20, 160 square, holding a red square that reaches past it. */
const design = (frame: Record<string, unknown>) => ({
  meta: { schemaVersion: 4, designId: 'd', name: 'Corners', kind: 'single', primaryFormatId: 'f' },
  formats: { f: { name: 'F', width: 300, height: 300, order: 'a0' } },
  pages: { p1: { name: 'Page', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes: {
    box: {
      type: 'frame',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: { x: 20, y: 20, width: 160, height: 160, fills: solid('#2050E0FF'), ...frame },
    },
    inner: {
      type: 'graphic',
      parentId: 'box',
      index: 'a0',
      name: 'Inner',
      props: { x: 0, y: 0, width: 200, height: 200, shape: { kind: 'rect' }, fills: solid('#E02020FF') },
    },
  },
  overrides: {},
})
const WHITE = [255, 255, 255]
const RED = [224, 32, 32]

describe('rounded boxes', () => {
  it("cut what is inside to the rounded corners, and not with Hide what's outside off", () => {
    const clipped = renderDesign(ck, design({ cornerRadius: 40 }), 'p1', 'f', bytes)
    expect(at(clipped, 22, 22)).toEqual(WHITE)
    expect(at(clipped, 100, 22)).toEqual(RED)
    expect(at(clipped, 100, 100)).toEqual(RED)
    const open = renderDesign(ck, design({ cornerRadius: 40, clip: false }), 'p1', 'f', bytes)
    expect(at(open, 22, 22)).toEqual(RED)
  })

  it('give each corner its own radius, from the top left clockwise', () => {
    const r = renderDesign(ck, design({ cornerRadius: [0, 60, 0, 60] }), 'p1', 'f', bytes)
    expect(at(r, 22, 22)).toEqual(RED)
    expect(at(r, 177, 22)).toEqual(WHITE)
    expect(at(r, 177, 177)).toEqual(RED)
    expect(at(r, 22, 177)).toEqual(WHITE)
  })

  it('cast a shadow with the same corners', () => {
    const shadow = { type: 'dropShadow', x: 100, y: 100, blur: 0, spread: 0, color: '#000000FF' }
    const r = renderDesign(ck, design({ cornerRadius: 60, clip: true, effects: [shadow] }), 'p1', 'f', bytes)
    // The shadow falls 120,120 to 280,280, under the box at its top left: its other corners are
    // rounded off, its edges dark.
    expect(at(r, 277, 277)).toEqual(WHITE)
    expect(at(r, 277, 124)).toEqual(WHITE)
    expect(at(r, 277, 200)).toEqual([0, 0, 0])
    expect(at(r, 200, 277)).toEqual([0, 0, 0])
  })

  it('draw the same in the PDF and the SVG as on the CPU', async () => {
    for (const frame of [{ cornerRadius: 40 }, { cornerRadius: [0, 60, 10, 80] }, { cornerRadius: 40, clip: false }]) {
      const { cpu, pdf, svg } = await renderThreeWays(ck, pdfium, design(frame), 'p1', 'f', bytes)
      expect(vectorDifference(cpu, pdf), `PDF ${JSON.stringify(frame)}`).toBeLessThan(1)
      expect(vectorDifference(cpu, svg), `SVG ${JSON.stringify(frame)}`).toBeLessThan(1)
    }
  })
})
