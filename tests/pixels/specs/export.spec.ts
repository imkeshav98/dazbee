// The export seam (#55, #56): every fixture frame, exported as PNG, JPG, PDF and
// SVG in Chromium and in Node, gives the same file byte for byte.
import { createHash } from 'node:crypto'

import { expect } from '@playwright/test'

import { exportDesign } from '@dazbee/export'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { framesOf, inOrder, parseDesign } from '@dazbee/schema'

import { loadFixtures } from '../src/fixtures.ts'
import { fixtureResources } from '../src/pixels.ts'
import { test } from './support/harness.ts'

const cases = loadFixtures().flatMap(({ name, json }) => {
  const parsed = parseDesign(json)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  const assetIds = [
    ...new Set(
      JSON.stringify(json)
        .match(/"assetId":"[^"]+"/g)
        ?.map((m) => m.slice(11, -1)) ?? [],
    ),
  ]
  const { design } = parsed
  return inOrder(design.pages).flatMap(([pageId]) =>
    framesOf(design, pageId).map(([frameId]) => ({ name, json, frameId, assetIds })),
  )
})
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

for (const c of cases) {
  test(`${c.name} ${c.frameId}: the browser's PNG, JPG, PDF and SVG are Node's, byte for byte`, async ({ harness }) => {
    const ck = await loadCanvasKit()
    for (const type of ['png', 'jpg', 'pdf', 'svg'] as const) {
      const node = exportDesign(ck, c.json, { frameIds: [c.frameId], type, quality: 85 }, fixtureResources()).bytes
      const browser = await harness.exportFile(c.json, c.frameId, type, c.assetIds)
      expect(browser.length, type).toBeGreaterThan(0)
      expect(sha(browser), type).toBe(sha(node))
    }
  })
}
