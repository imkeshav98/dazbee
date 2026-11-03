// Outside strokes on shapes and booleans (#270) export to SVG and PDF as the CPU draws them: the
// stroke lies outside the edge only, never on a band inside it.
import { afterAll, describe, expect, it } from 'vitest'

import { renderDesign, renderVector } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { at, fixtureResources } from './pixels.ts'
import { rasteriseSvg, renderThreeWays, startPdfium, vectorDifference } from './vector.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()
const pdfium = await startPdfium(afterAll)

const solid = (color: string) => [{ type: 'solid', color }]
const stroke = (align: 'inside' | 'center' | 'outside') => [
  { paint: { type: 'solid', color: '#000000FF' }, width: 10, align },
]
/** A 300 square page holding a 200 rounded rect, or a boolean of two overlapping squares, stroked 10 wide. */
const design = (align: 'inside' | 'center' | 'outside', kind: 'shape' | 'boolean') => ({
  meta: { schemaVersion: 5, designId: 'd', name: 'Outside strokes', kind: 'single', primaryFormatId: 'f' },
  formats: { f: { name: 'F', width: 300, height: 300, order: 'a0' } },
  pages: { p1: { name: 'Page', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes:
    kind === 'shape'
      ? {
          box: {
            type: 'graphic',
            parentId: 'p1',
            index: 'a0',
            name: 'Box',
            props: {
              x: 50,
              y: 50,
              width: 200,
              height: 200,
              shape: { kind: 'rect', cornerRadius: 24 },
              fills: solid('#2050E0FF'),
              strokes: stroke(align),
            },
          },
        }
      : {
          both: {
            type: 'boolean',
            parentId: 'p1',
            index: 'a0',
            name: 'Both',
            props: {
              x: 50,
              y: 50,
              width: 200,
              height: 200,
              op: 'union',
              fills: solid('#E02020FF'),
              strokes: stroke(align),
            },
          },
          a: {
            type: 'graphic',
            parentId: 'both',
            index: 'a0',
            name: 'A',
            props: { x: 50, y: 50, width: 140, height: 140, shape: { kind: 'rect' }, fills: solid('#000000FF') },
          },
          b: {
            type: 'graphic',
            parentId: 'both',
            index: 'a1',
            name: 'B',
            props: { x: 110, y: 110, width: 140, height: 140, shape: { kind: 'ellipse' }, fills: solid('#000000FF') },
          },
        },
  overrides: {},
})

describe('outside strokes', () => {
  for (const kind of ['shape', 'boolean'] as const) {
    for (const align of ['inside', 'center', 'outside'] as const) {
      it(`a ${kind} with a stroke ${align} exports to SVG and PDF as drawn`, async () => {
        const { cpu, pdf, svg } = await renderThreeWays(ck, pdfium, design(align, kind), 'p1', 'f', bytes)
        const svgPercent = vectorDifference(cpu, svg)
        const pdfPercent = vectorDifference(cpu, pdf)
        console.log(`${kind} ${align}: SVG ${svgPercent.toFixed(3)}%, PDF ${pdfPercent.toFixed(3)}%`)
        expect(svgPercent).toBeLessThan(1)
        expect(pdfPercent).toBeLessThan(1)
      })
    }
  }

  it('keeps out of a path that crosses itself, filled by the nonzero rule, on the CPU and in SVG and PDF', async () => {
    // A star drawn as one crossing line: its middle winds twice, and is filled.
    const star = 'M100 0 L159 181 L4 69 L196 69 L41 181 Z'
    const json = {
      ...design('outside', 'shape'),
      nodes: {
        star: {
          type: 'graphic',
          parentId: 'p1',
          index: 'a0',
          name: 'Star',
          props: {
            x: 50,
            y: 50,
            width: 200,
            height: 190,
            shape: { kind: 'path', d: star },
            fills: [{ type: 'solid', color: '#2050E0FF' }],
            strokes: stroke('outside'),
          },
        },
      },
    }
    const { cpu, pdf, svg } = await renderThreeWays(ck, pdfium, json, 'p1', 'f', bytes)
    // Just inside the star's middle, which winds twice, 5 px below a line crossing it: the fill shows.
    expect(at(cpu, 150, 124)).toEqual([32, 80, 224])
    expect(at(svg, 150, 124)).toEqual([32, 80, 224])
    expect(vectorDifference(cpu, svg)).toBeLessThan(1)
    expect(vectorDifference(cpu, pdf)).toBeLessThan(1)
  })

  it('lies outside the edge only: inside it the fill shows, past it the stroke', () => {
    const r = renderDesign(ck, design('outside', 'shape'), 'p1', 'f', bytes)
    // The left edge is at x 50; the stroke runs from 40 to 50.
    expect(at(r, 45, 150)).toEqual([0, 0, 0])
    expect(at(r, 55, 150)).toEqual([32, 80, 224])
    const svg = rasteriseSvg(renderVector(ck, design('outside', 'shape'), 'p1', 'f', bytes, 'svg'))
    expect(at(svg, 55, 150)).toEqual([32, 80, 224])
  })
})
