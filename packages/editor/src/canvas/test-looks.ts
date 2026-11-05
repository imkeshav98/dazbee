// What the hit test reads, for tests: CanvasKit in Node, text laid out with the shipped fonts, and
// the alpha maps of the images a test draws.
import type { Image } from '@dazbee/canvaskit'
import { loadFontFiles } from '@dazbee/fonts/node'
import { makeResources, paragraphCache } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { alphaMap } from './alpha-map.ts'
import type { Looks } from './hit-test.ts'

const ck = await loadCanvasKit()
const fonts = makeResources(ck, {
  fonts: loadFontFiles().map(({ family, bytes }) => ({ family, bytes })),
  fallbackFamilies: [],
  images: {},
})
const paragraphs = paragraphCache()

/** A test's looks: the alpha maps of `images` by asset id, and text laid out with the shipped fonts. */
export function testLooks(images: Record<string, Image> = {}): Looks {
  const maps = new Map(Object.entries(images).map(([id, image]) => [id, alphaMap(ck, image)]))
  return { ck, alpha: (assetId) => maps.get(assetId), layout: (props) => paragraphs.layout(ck, props, fonts) }
}
