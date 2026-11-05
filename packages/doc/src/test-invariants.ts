// The rules every design holds after any command, sync or repair, which every doc test checks
// through its sessions (test-design.ts).
import { expect } from 'vitest'

import { checkStructure, type Design } from '@dazbee/schema'

/**
 * The rules every design holds after any command, sync or repair, broken ones as `path: message`,
 * as the schema checks a design's shape (checkStructure); empty when they hold: it has a page,
 * every layer's chain of parents ends at a frame that exists, on a page that exists, and no frame
 * holds two layers with one link id.
 */
export function brokenInvariants(design: Design): string[] {
  const broken: string[] = []
  checkStructure(design, (path, message) => broken.push(`${path.join('.')}: ${message}`))
  return broken
}

/** Fails the test with the broken rules. */
export function expectInvariants(design: Design): void {
  expect(brokenInvariants(design), 'broken invariants').toEqual([])
}
