import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { childrenOf, loadDesign, readDesign } from '@dazbee/doc'
import { framesOf, inOrder, parseDesign } from '@dazbee/schema'

import { FIXTURES_DIR, loadFixtures } from './fixtures.ts'

const fixtures = loadFixtures()

describe('pixel fixtures', () => {
  it("are the spike spec's (#1) designs plus the layer bounds ones (#18, #31) and the later features ones", () => {
    expect(fixtures.map((f) => f.name)).toEqual([
      'arabic-ad',
      'auto-layout',
      'box-corners',
      'box-strokes',
      'carousel',
      'english-sale-ad',
      'fill-stacks',
      'groups-and-boxes',
      'hindi-ad',
      'image-fills',
      'layer-bounds',
      'shapes-and-booleans',
      'shapes-and-effects',
      'stress',
      'strokes-and-effects',
      'text-and-group-bounds',
      'text-styles',
    ])
  })

  it.each(fixtures)('$name validates against the schema', ({ json }) => {
    const result = parseDesign(json)
    expect(result.success ? [] : result.errors).toEqual([])
  })

  it.each(fixtures)('$name survives a round trip through a design document', ({ json }) => {
    const result = parseDesign(json)
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(readDesign(loadDesign(result.design))).toEqual(result.design)
  })

  it('the carousel has three pages of two linked frames each, the portrait copies with their own layout', () => {
    const carousel = fixtures.find((f) => f.name === 'carousel')
    const result = parseDesign(carousel?.json)
    if (!result.success) throw new Error(result.errors.join('\n'))
    const { design } = result
    expect(inOrder(design.pages).map(([pageId]) => pageId)).toEqual(['p1', 'p2', 'p3'])
    for (const [pageId] of inOrder(design.pages)) {
      const frames = framesOf(design, pageId)
      expect(frames.map(([, frame]) => [frame.name, frame.width, frame.height])).toEqual([
        ['Square 1:1', 1080, 1080],
        ['Portrait 4:5', 1080, 1350],
      ])
      const [square = [], portrait = []] = frames.map(([frameId]) => childrenOf(design, frameId))
      expect(portrait.map(([, layer]) => layer.link)).toEqual(square.map(([, layer]) => layer.link))
      expect(portrait.map(([, layer]) => layer.props.y)).not.toEqual(square.map(([, layer]) => layer.props.y))
    }
  })

  it('the stress design has 300 layers', () => {
    const stress = fixtures.find((f) => f.name === 'stress')
    const result = parseDesign(stress?.json)
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(Object.keys(result.design.nodes)).toHaveLength(300)
  })

  it('the English sale ad nests its price in a group inside a clipping box', () => {
    const ad = parseDesign(fixtures.find((f) => f.name === 'english-sale-ad')?.json)
    if (!ad.success) throw new Error(ad.errors.join('\n'))
    expect(ad.design.nodes['price-box']?.type).toBe('box')
    expect(ad.design.nodes['price-group']).toMatchObject({ type: 'group', parentId: 'price-box' })
    expect(ad.design.nodes.price?.parentId).toBe('price-group')
  })

  it('an invalid fixture fails with readable errors', () => {
    const json = JSON.parse(readFileSync(join(FIXTURES_DIR, 'invalid', 'broken-parent-and-colour.json'), 'utf8'))
    expect(parseDesign(json)).toEqual({
      success: false,
      errors: [
        'nodes.box.props.fills.0.color: colours are #RRGGBBAA',
        'nodes.box.parentId: parent "missing-page" is neither a frame nor a layer',
      ],
    })
  })
})
