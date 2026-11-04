// The blank design Make drafts opens: one page with a frame per size the brief picked, in a row.
import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { briefDesign } from './brief.ts'

const WHITE = [{ type: 'solid', color: '#FFFFFFFF' }]
const named = (id: string) => `Name of ${id}`

describe('briefDesign', () => {
  it('makes one empty, white frame per picked size on one page, in the presets’ order, in a row 200 px apart', () => {
    const design = briefDesign('Spring sale', ['link-image', 'story', 'feed-square'], named)
    expect(design).toEqual({
      meta: { designId: 'replaced-by-the-api', name: 'Spring sale' },
      pages: { p1: { name: 'Page 1', order: 'a0' } },
      frames: {
        f1: {
          pageId: 'p1',
          name: 'Name of feed-square',
          width: 1080,
          height: 1080,
          x: 0,
          y: 0,
          fills: WHITE,
          order: 'a0',
        },
        f2: {
          pageId: 'p1',
          name: 'Name of story',
          width: 1080,
          height: 1920,
          x: 1280,
          y: 0,
          fills: WHITE,
          order: 'a1',
        },
        f3: {
          pageId: 'p1',
          name: 'Name of link-image',
          width: 1200,
          height: 628,
          x: 2560,
          y: 0,
          fills: WHITE,
          order: 'a2',
        },
      },
      nodes: {},
    })
    expect(parseDesign(design).success).toBe(true)
  })

  it('makes one Feed square frame when no size it knows was picked', () => {
    const design = briefDesign('Plain', ['banner'], named)
    expect(design.frames).toEqual({
      f1: {
        pageId: 'p1',
        name: 'Name of feed-square',
        width: 1080,
        height: 1080,
        x: 0,
        y: 0,
        fills: WHITE,
        order: 'a0',
      },
    })
  })
})
