// What the hit test reads, for tests: CanvasKit in Node, text laid out with the shipped fonts, and
// the alpha maps of the images a test draws.
import type { Image, Path } from '@dazbee/canvaskit'
import { loadFontFiles } from '@dazbee/fonts/node'
import { makeResources, outlineOf, paragraphCache, type SceneLayer } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { alphaMap } from './alpha-map.ts'
import { lineBoxes, type Looks, outlineBand } from './hit-test.ts'

const ck = await loadCanvasKit()
const fonts = makeResources(ck, {
  fonts: loadFontFiles().map(({ family, bytes }) => ({ family, bytes })),
  fallbackFamilies: [],
  images: {},
})
const paragraphs = paragraphCache()
/** Outlines and their bands by reach made for tests, kept for as long as the test file runs. */
const outlines = new WeakMap<SceneLayer, Path>()
const bands = new WeakMap<SceneLayer, Map<number, Path | null>>()

/** A test's looks: the alpha maps of `images` by asset id, and text laid out with the shipped fonts. */
export function testLooks(images: Record<string, Image> = {}): Looks {
  const maps = new Map(Object.entries(images).map(([id, image]) => [id, alphaMap(ck, image)]))
  const outline = (layer: SceneLayer) => {
    let path = outlines.get(layer)
    if (!path) outlines.set(layer, (path = outlineOf(ck, layer)))
    return path
  }
  const band = (layer: SceneLayer, reach: number) => {
    let made = bands.get(layer)
    if (!made) bands.set(layer, (made = new Map()))
    let path = made.get(reach)
    if (path === undefined) made.set(reach, (path = outlineBand(ck, outline(layer), reach)))
    return path
  }
  return {
    outline,
    band,
    alpha: (assetId) => maps.get(assetId),
    lines: (props) => lineBoxes(paragraphs.layout(ck, props, fonts)),
  }
}
