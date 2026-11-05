import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect } from '@playwright/test'

import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { framesOf, inOrder, parseDesign } from '@dazbee/schema'

import { driftProblem, readDriftBaselines, recordDriftBaseline } from '../src/drift.ts'
import { loadFixtures } from '../src/fixtures.ts'
import { comparePixels, encodePng, fixtureResources, type Pixels } from '../src/pixels.ts'
import { test } from './support/harness.ts'
import { BROWSER_OUT, saveDriftRow } from './support/report.ts'

/** Every frame of every fixture. */
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

function maxDelta(a: Pixels, b: Pixels) {
  let max = 0
  for (let i = 0; i < a.pixels.length; i++) max = Math.max(max, Math.abs((a.pixels[i] ?? 0) - (b.pixels[i] ?? 0)))
  return max
}

test('every fixture frame is checked', () => {
  expect(cases).toHaveLength(22)
})

for (const c of cases) {
  const label = `${c.name} ${c.frameId}`

  test(`${label}: browser CPU matches Node CPU`, async ({ harness }) => {
    const ck = await loadCanvasKit()
    const node = renderDesign(ck, c.json, c.frameId, fixtureResources())
    const browser = await harness.render(c.json, c.frameId, 'cpu', c.assetIds)
    const { differing, diff } = comparePixels(node, browser)
    if (differing > 0) {
      mkdirSync(BROWSER_OUT, { recursive: true })
      const file = `${c.name}.${c.frameId}`
      writeFileSync(join(BROWSER_OUT, `${file}.browser.png`), encodePng(ck, browser))
      writeFileSync(join(BROWSER_OUT, `${file}.diff.png`), encodePng(ck, diff))
    }
    expect(differing, `pixels differing from Node; see ${BROWSER_OUT}`).toBe(0)
  })

  test(`${label}: WebGL drift from CPU stays within its baseline`, async ({ harness }) => {
    const cpu = await harness.render(c.json, c.frameId, 'cpu', c.assetIds)
    const webgl = await harness.render(c.json, c.frameId, 'webgl', c.assetIds)
    const { differing } = comparePixels(cpu, webgl)
    const drift = { differing, percent: (100 * differing) / (cpu.width * cpu.height), maxDelta: maxDelta(cpu, webgl) }
    if (process.env.UPDATE_DRIFT_BASELINES) recordDriftBaseline(label, drift)
    const baseline = readDriftBaselines()[label]
    const problem = driftProblem(drift, baseline)
    saveDriftRow({
      case: label,
      ...drift,
      ...(baseline ? { limit: baseline.limit } : {}),
      ...(problem ? { problem } : {}),
    })
    expect(problem, 'WebGL stage drifted from the CPU export').toBeUndefined()
  })
}
