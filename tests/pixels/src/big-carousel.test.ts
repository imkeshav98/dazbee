// The size check on the big carousel, ADR-0014's limit: at 20 cards of five linked frames, the
// design is under 1 MB as a Yjs document and opens in under 300 ms.
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { childrenOf, loadDesign, openSession } from '@dazbee/doc'
import { framesOf, parseDesign } from '@dazbee/schema'

import { bigCarousel } from './big-carousel.ts'

const MAX_BYTES = 1_048_576
const MAX_OPEN_MS = 300

const parsed = (cards: number) => {
  const result = parseDesign(bigCarousel(cards))
  if (!result.success) throw new Error(result.errors.join('\n'))
  return result.design
}

describe('bigCarousel', () => {
  it('is a page a card, each of five frames placed by the frame rule, the square’s layers linked in the rest', () => {
    const design = parsed(20)
    expect(Object.keys(design.pages)).toHaveLength(20)
    expect(Object.keys(design.frames)).toHaveLength(100)
    expect(Object.keys(design.nodes)).toHaveLength(600)
    const frames = framesOf(design, 'p7')
    expect(frames.map(([id, f]) => [id, f.x, f.y, f.width, f.height])).toEqual([
      ['p7-sq', 0, 0, 1080, 1080],
      ['p7-pt', 1280, 0, 1080, 1350],
      ['p7-story', 2560, 0, 1080, 1920],
      ['p7-land', 3840, 0, 1200, 628],
      ['p7-mpu', 5240, 0, 300, 250],
    ])
    const links = childrenOf(design, 'p7-sq').map(([, layer]) => layer.link)
    for (const [frameId] of frames) expect(childrenOf(design, frameId).map(([, layer]) => layer.link)).toEqual(links)
    // Each copy has its own values: the story's button is lower, the MPU's body hidden.
    expect(design.nodes['p7-story-cta']?.props).toMatchObject({ x: 760, y: 1760, width: 260, height: 114 })
    expect(design.nodes['p7-mpu-body']?.props.visible).toBe(false)
    expect(design.nodes['p7-body']?.props.visible).toBe(true)
  })

  it('at 20 cards, is under 1 MB as a Yjs document and opens in under 300 ms', () => {
    const update = Y.encodeStateAsUpdate(loadDesign(parsed(20)))
    expect(update.length).toBeLessThan(MAX_BYTES)
    // Opening a design as a tab does: the state into a new doc, then the session's whole first read.
    const runs = Array.from({ length: 5 }, () => {
      const start = performance.now()
      const doc = new Y.Doc()
      Y.applyUpdate(doc, update)
      const tab = openSession(doc)
      expect(Object.keys(tab.design().nodes)).toHaveLength(600)
      const ms = performance.now() - start
      tab.destroy()
      return ms
    })
    const median = [...runs].sort((a, b) => a - b)[2] ?? Infinity
    expect(median, `open times ${runs.map((ms) => ms.toFixed(0)).join(', ')} ms`).toBeLessThan(MAX_OPEN_MS)
  })
})
