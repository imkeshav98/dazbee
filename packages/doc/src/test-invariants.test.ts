import { describe, expect, it } from 'vitest'

import { type Design, parseDesign } from '@dazbee/schema'

import { testDesign } from './test-design.ts'
import { brokenInvariants } from './test-invariants.ts'

const valid = (): Design => {
  const result = parseDesign(testDesign())
  if (!result.success) throw new Error(result.errors.join('\n'))
  return result.design
}

/** The test design with changes no valid design can hold, as a buggy view could hand it out. */
const broken = (change: (d: { frames: Record<string, unknown>; nodes: Record<string, unknown> }) => void) => {
  const d = structuredClone(valid()) as unknown as { frames: Record<string, unknown>; nodes: Record<string, unknown> }
  change(d)
  return d as unknown as Design
}

describe('brokenInvariants', () => {
  it('is empty for a valid design, linked copies in two frames included', () => {
    expect(brokenInvariants(valid())).toEqual([])
  })

  it('names a layer whose chain of parents ends at no frame, or loops', () => {
    const d = broken(({ nodes }) => {
      Object.assign(nodes.box as object, { parentId: 'gone' })
      Object.assign(nodes.headline as object, { parentId: 'banner-headline' })
      Object.assign(nodes['banner-headline'] as object, { parentId: 'headline' })
    })
    expect(brokenInvariants(d)).toEqual([
      'nodes.box.parentId: parent "gone" is neither a frame nor a layer',
      'nodes.headline.parentId: parent "banner-headline" is a text, which can\'t hold layers',
      'nodes.headline.parentId: "headline" is inside itself',
      'nodes.banner-headline.parentId: parent "headline" is a text, which can\'t hold layers',
      'nodes.banner-headline.parentId: "banner-headline" is inside itself',
    ])
  })

  it('names a frame on no page', () => {
    const d = broken(({ frames }) => Object.assign(frames.banner as object, { pageId: 'p9' }))
    expect(brokenInvariants(d)).toEqual(['frames.banner.pageId: no page "p9"'])
  })

  it('names a frame holding one link id twice', () => {
    const d = broken(({ nodes }) => Object.assign(nodes.headline as object, { link: 'box' }))
    expect(brokenInvariants(d)).toEqual(['nodes.headline.link: frame "sq" holds link "box" twice, also on "box"'])
  })
})
