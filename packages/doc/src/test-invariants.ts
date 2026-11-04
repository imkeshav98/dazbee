// The rules every design holds after any command, sync or repair, which every doc test checks
// through its sessions (test-design.ts).
import { expect } from 'vitest'

import type { Design } from '@dazbee/schema'

/**
 * The rules every design holds after any command, sync or repair; empty when it holds:
 * every layer's chain of parents ends at a frame that exists, on a page that exists, and no
 * frame holds two layers with one link id.
 */
export function brokenInvariants(design: Design): string[] {
  const broken: string[] = []
  for (const [id, frame] of Object.entries(design.frames))
    if (!Object.hasOwn(design.pages, frame.pageId)) broken.push(`frame "${id}" is on no page`)
  const layers = Object.entries(design.nodes)
  const frameOf = (id: string) => {
    const seen = new Set<string>()
    for (let up: string | undefined = id; up !== undefined; up = design.nodes[up]?.parentId) {
      if (Object.hasOwn(design.frames, up)) return up
      if (seen.has(up) || !Object.hasOwn(design.nodes, up)) return undefined
      seen.add(up)
    }
    return undefined
  }
  /** The first layer holding each link id, by frame. */
  const holders = new Map<string, Map<string, string>>()
  for (const [id, layer] of layers) {
    const frameId = frameOf(layer.parentId)
    if (frameId === undefined) {
      broken.push(`"${id}" is in no frame`)
      continue
    }
    const links = holders.get(frameId) ?? new Map<string, string>()
    holders.set(frameId, links)
    const first = links.get(layer.link)
    if (first === undefined) links.set(layer.link, id)
    else broken.push(`frame "${frameId}" holds link "${layer.link}" on "${first}" and "${id}"`)
  }
  return broken
}

/** Fails the test with the broken rules. */
export function expectInvariants(design: Design): void {
  expect(brokenInvariants(design), 'broken invariants').toEqual([])
}
