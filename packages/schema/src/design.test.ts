import { describe, expect, it } from 'vitest'

import { checkStructure, fontFamilies, imageAssetIds, parseDesign } from './design.ts'
import { parseDesignIncrementally } from './parse-incremental.ts'
import { minimal } from './test-design.ts'

/**
 * Parses with the full parser, checking on the way that the incremental one agrees exactly,
 * on a fresh input and again on the same one (the second time from its cache).
 */
const parse = (input: unknown) => {
  const full = parseDesign(input)
  expect(parseDesignIncrementally(structuredClone(input))).toEqual(full)
  expect(parseDesignIncrementally(input)).toEqual(full)
  expect(parseDesignIncrementally(input)).toEqual(full)
  return full
}

const errorsFor = (mutate: (d: ReturnType<typeof minimal>) => void) => {
  const d = minimal()
  mutate(d)
  const result = parse(d)
  return result.success ? [] : result.errors
}

const white = [{ type: 'solid', color: '#FFFFFFFF' }]

/** The frame `banner` beside `sq` on `p1`, placed by the frame rule. */
const banner = { pageId: 'p1', name: 'Banner', width: 320, height: 50, x: 1280, y: 0, fills: white, order: 'a1' }

const group = (parentId: string, link: string) => ({
  type: 'group',
  parentId,
  link,
  index: 'a0',
  name: 'G',
  props: { x: 0, y: 0, width: 10, height: 10 },
})

describe('parseDesign', () => {
  it('accepts a minimal design and fills in defaults', () => {
    const result = parse(minimal())
    expect(result.success).toBe(true)
    if (!result.success) return
    const box = result.design.nodes.r1
    expect(box?.props.opacity).toBe(1)
    expect(box?.props.rotation).toBe(0)
    expect(box?.props.visible).toBe(true)
    expect(box?.link).toBe('r1')
  })

  it('gives a frame without fills an empty background', () => {
    const d = minimal()
    delete (d.frames.sq as { fills?: unknown }).fills
    const result = parse(d)
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(result.design.frames.sq?.fills).toEqual([])
  })

  it('rejects a frame whose size is not whole pixels', () => {
    expect(
      errorsFor((d) => {
        d.frames.sq.width = 100.5
      }),
    ).toEqual(['frames.sq.width: Invalid input: expected int, received number'])
  })

  it('rejects colours that are not #RRGGBBAA', () => {
    expect(
      errorsFor((d) => {
        d.nodes.r1.props.fills = [{ type: 'solid', color: '#FF5A36' }]
      }),
    ).toEqual(['nodes.r1.props.fills.0.color: colours are #RRGGBBAA'])
  })

  it('rejects a layer without a link id', () => {
    expect(
      errorsFor((d) => {
        delete (d.nodes.r1 as { link?: string }).link
      }),
    ).toEqual(['nodes.r1.link: Invalid input: expected string, received undefined'])
  })

  it('rejects a text run that ends past the text', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.nodes, {
          t1: {
            type: 'text',
            parentId: 'sq',
            link: 't1',
            index: 'a1',
            name: 'Headline',
            props: {
              x: 0,
              y: 0,
              width: 500,
              height: 80,
              text: 'Sale',
              style: { fontFamily: 'Noto Sans', fontSize: 64, color: '#000000FF' },
              runs: [{ start: 0, end: 9, style: { fontWeight: 700 } }],
            },
          },
        })
      }),
    ).toEqual(['nodes.t1.props.runs.0.end: run ends at 9 but the text is 4 UTF-16 units long'])
  })
})

describe('text runs', () => {
  it('keep only the style keys they set, so the rest come from the base style', () => {
    const d = minimal() as ReturnType<typeof minimal> & { nodes: Record<string, unknown> }
    d.nodes.t1 = {
      type: 'text',
      parentId: 'sq',
      link: 't1',
      index: 'a1',
      name: 'Headline',
      props: {
        x: 0,
        y: 0,
        width: 500,
        height: 80,
        text: 'Sale',
        style: { fontFamily: 'Noto Sans', fontSize: 64, color: '#000000FF', fontWeight: 700 },
        runs: [{ start: 0, end: 2, style: { color: '#FF0000FF' } }],
      },
    }
    const result = parse(d)
    if (!result.success) throw new Error(result.errors.join('\n'))
    const t1 = result.design.nodes.t1
    expect(t1?.type === 'text' && t1.props.runs).toEqual([{ start: 0, end: 2, style: { color: '#FF0000FF' } }])
  })
})

describe('imageAssetIds', () => {
  it('finds image fills on frames and layers, once each', () => {
    const image = (assetId: string) => ({ type: 'image', assetId })
    const parsed = parseDesign({
      meta: { designId: 'd', name: 'D' },
      pages: { p1: { name: 'P', order: 'a0' } },
      frames: {
        sq: { pageId: 'p1', name: 'Square', width: 100, height: 100, x: 0, y: 0, fills: [image('sq-bg')], order: 'a0' },
        st: {
          pageId: 'p1',
          name: 'Story',
          width: 100,
          height: 200,
          x: 300,
          y: 0,
          fills: [image('st-bg')],
          order: 'a1',
        },
      },
      nodes: {
        g: {
          type: 'graphic',
          parentId: 'sq',
          link: 'g',
          index: 'a0',
          name: 'G',
          props: {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            shape: { kind: 'rect' },
            fills: [{ type: 'solid', color: '#000000FF' }, image('photo')],
          },
        },
        h: {
          type: 'graphic',
          parentId: 'sq',
          link: 'h',
          index: 'a1',
          name: 'H',
          props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' }, fills: [image('photo')] },
        },
        'st-g': {
          type: 'graphic',
          parentId: 'st',
          link: 'g',
          index: 'a0',
          name: 'G',
          props: { x: 0, y: 0, width: 10, height: 20, shape: { kind: 'rect' }, fills: [image('story-photo')] },
        },
      },
    })
    if (!parsed.success) throw new Error(parsed.errors.join('\n'))
    expect(imageAssetIds(parsed.design)).toEqual(['photo', 'sq-bg', 'st-bg', 'story-photo'])
  })
})

describe('fontFamilies', () => {
  it('finds the families of base styles and runs, once each', () => {
    const text = (fontFamily: string, runs: unknown[] = []) => ({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text: 'Sale now',
      style: { fontFamily, fontSize: 20, color: '#000000FF' },
      runs,
    })
    const parsed = parseDesign({
      meta: { designId: 'd', name: 'D' },
      pages: { p1: { name: 'P', order: 'a0' } },
      frames: {
        sq: { pageId: 'p1', name: 'Square', width: 100, height: 100, x: 0, y: 0, fills: white, order: 'a0' },
        st: { pageId: 'p1', name: 'Story', width: 100, height: 200, x: 300, y: 0, fills: white, order: 'a1' },
      },
      nodes: {
        a: {
          type: 'text',
          parentId: 'sq',
          link: 'a',
          index: 'a0',
          name: 'A',
          props: text('Inter', [
            { start: 0, end: 4, style: { fontFamily: 'Lobster' } },
            { start: 5, end: 8, style: { fontWeight: 700 } },
          ]),
        },
        b: { type: 'text', parentId: 'sq', link: 'b', index: 'a1', name: 'B', props: text('Inter') },
        'st-b': { type: 'text', parentId: 'st', link: 'b', index: 'a1', name: 'B', props: text('Bebas Neue') },
        g: {
          type: 'graphic',
          parentId: 'sq',
          link: 'g',
          index: 'a2',
          name: 'G',
          props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' } },
        },
      },
    })
    if (!parsed.success) throw new Error(parsed.errors.join('\n'))
    expect(fontFamilies(parsed.design)).toEqual(['Bebas Neue', 'Inter', 'Lobster'])
  })
})

describe('checkStructure', () => {
  it('passes a design with linked copies in two frames of a page', () => {
    const d = minimal()
    Object.assign(d.frames, { banner })
    Object.assign(d.nodes, { 'banner-r1': { ...d.nodes.r1, parentId: 'banner', link: 'r1' } })
    const result = parse(d)
    if (!result.success) throw new Error(result.errors.join('\n'))
    const errors: string[] = []
    checkStructure(result.design, (path, message) => errors.push(`${path.join('.')}: ${message}`))
    expect(errors).toEqual([])
  })

  it('rejects a design with no page', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d, { pages: {}, frames: {}, nodes: {} })
      }),
    ).toEqual(['pages: a design needs a page'])
  })

  it('rejects a frame whose page is missing', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.frames, { banner: { ...banner, pageId: 'ghost' } })
      }),
    ).toEqual(['frames.banner.pageId: no page "ghost"'])
  })

  it('rejects a layer id that is also a frame id', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.frames, { banner })
        Object.assign(d.nodes, { banner: { ...d.nodes.r1, link: 'banner' } })
      }),
    ).toEqual(['nodes.banner: "banner" is both a frame and a layer'])
  })

  it('rejects a layer whose parent is neither a frame nor a layer, a page included', () => {
    expect(
      errorsFor((d) => {
        d.nodes.r1.parentId = 'ghost'
      }),
    ).toEqual(['nodes.r1.parentId: parent "ghost" is neither a frame nor a layer'])
    expect(
      errorsFor((d) => {
        d.nodes.r1.parentId = 'p1'
      }),
    ).toEqual(['nodes.r1.parentId: parent "p1" is neither a frame nor a layer'])
  })

  it('rejects a layer inside a graphic', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.nodes, { r2: { ...d.nodes.r1, parentId: 'r1', link: 'r2' } })
      }),
    ).toEqual(['nodes.r2.parentId: parent "r1" is a graphic, which can\'t hold layers'])
  })

  it('rejects groups that contain each other, with no link error for the layers in the loop', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.nodes, { g1: group('g2', 'g'), g2: group('g1', 'g') })
      }),
    ).toEqual(['nodes.g1.parentId: "g1" is inside itself', 'nodes.g2.parentId: "g2" is inside itself'])
  })

  it('names only the layers in a cycle, not a layer hanging below it', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.nodes, { g0: group('g1', 'g0'), g1: group('g2', 'g1'), g2: group('g1', 'g2') })
      }),
    ).toEqual(['nodes.g1.parentId: "g1" is inside itself', 'nodes.g2.parentId: "g2" is inside itself'])
  })

  it('rejects a frame holding one link id twice, naming the second and later holders', () => {
    expect(
      errorsFor((d) => {
        Object.assign(d.nodes, {
          g: group('sq', 'g'),
          r2: { ...d.nodes.r1, parentId: 'g', link: 'r1' },
          r3: { ...d.nodes.r1, index: 'a1', link: 'r1' },
        })
      }),
    ).toEqual([
      'nodes.r2.link: frame "sq" holds link "r1" twice, also on "r1"',
      'nodes.r3.link: frame "sq" holds link "r1" twice, also on "r1"',
    ])
  })
})
