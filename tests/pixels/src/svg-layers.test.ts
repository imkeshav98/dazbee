// SVG files turned into layers (#225) draw as resvg draws the files themselves: each logo, written
// the way a design tool or icon set writes it, is converted, placed in a frame its own size and
// drawn by the CPU renderer, then compared with resvg's drawing of the original file.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'

import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { svgToLayers } from '@dazbee/svg'

import { ASSETS_DIR, encodePng, fixtureResources, OUTPUT_DIR } from './pixels.ts'
import { vectorDifference } from './vector.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()
const LOGOS = join(ASSETS_DIR, 'svg')
/** The share of pixels, in percent, that may differ from resvg's drawing: curves are flattened and anti-aliased differently. */
const LIMIT = 1

/** The file drawn by resvg over white, as the frame is. */
function rasterise(text: string) {
  const image = new Resvg(text, {
    background: '#FFFFFF',
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: false },
  }).render()
  return { width: image.width, height: image.height, pixels: new Uint8Array(image.pixels) }
}

function draw(text: string) {
  const { tree, root, width, height, skipped } = svgToLayers(ck, text)
  const nodes = Object.fromEntries(
    Object.entries(tree.nodes).map(([id, node]) => [id, id === root ? { ...node, parentId: 'f', index: 'a0' } : node]),
  )
  const design = {
    meta: { designId: 'd', name: 'Logo' },
    pages: { p1: { name: 'Page', order: 'a0' } },
    frames: {
      f: {
        pageId: 'p1',
        name: 'Logo',
        width: Math.round(width),
        height: Math.round(height),
        x: 0,
        y: 0,
        fills: [{ type: 'solid', color: '#FFFFFFFF' }],
        order: 'a0',
      },
    },
    nodes,
  }
  return { drawn: renderDesign(ck, design, 'f', bytes), skipped, layers: Object.keys(nodes).length }
}

describe('SVG files as layers', () => {
  const files = readdirSync(LOGOS)
    .filter((f) => f.endsWith('.svg'))
    .sort()
  it('has the logos to check', () => expect(files.length).toBeGreaterThanOrEqual(8))

  for (const file of files) {
    it(`${file} draws as resvg draws it`, () => {
      const text = readFileSync(join(LOGOS, file), 'utf8')
      const { drawn, skipped, layers } = draw(text)
      const expected = rasterise(text)
      mkdirSync(join(OUTPUT_DIR, 'svg-layers'), { recursive: true })
      writeFileSync(join(OUTPUT_DIR, 'svg-layers', file.replace('.svg', '.layers.png')), encodePng(ck, drawn))
      writeFileSync(join(OUTPUT_DIR, 'svg-layers', file.replace('.svg', '.resvg.png')), encodePng(ck, expected))
      const percent = vectorDifference(expected, drawn)
      console.log(
        `${file}: ${layers} layers, ${percent.toFixed(3)}% differ${skipped.length ? `, left out: ${skipped.join(', ')}` : ''}`,
      )
      expect(skipped).toEqual([])
      expect(percent).toBeLessThan(LIMIT)
    })
  }
})
