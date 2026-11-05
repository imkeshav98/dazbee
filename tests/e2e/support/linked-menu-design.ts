// The design the linked menu specs open: an ad in a square frame with a layer of each type, its
// linked copies in a story and a landscape frame, laid out for each, a frame on the page linked to
// none, and a second page.
import type { DesignInput } from '@dazbee/schema'

import { frameDesign, linkedFrames } from './seed.ts'

type Box = { x: number; y: number; width: number; height: number }

const solid = (color: string) => [{ type: 'solid' as const, color }]
export const INK = '#1A1A1AFF'
export const PINK = '#FF4FB0FF'
export const GREEN = '#21885BFF'
const WHITE = '#FFFFFFFF'

/** Each layer's box in the square, story and landscape frames, and its text's size there. */
const LAYOUT: Record<string, { sq: Box; story: Box; wide: Box; size?: [number, number, number] }> = {
  headline: {
    sq: { x: 80, y: 80, width: 920, height: 143 },
    story: { x: 80, y: 260, width: 920, height: 143 },
    wide: { x: 60, y: 60, width: 620, height: 94 },
    size: [110, 110, 72],
  },
  sub: {
    sq: { x: 80, y: 235, width: 600, height: 57 },
    story: { x: 80, y: 415, width: 600, height: 57 },
    wide: { x: 60, y: 165, width: 520, height: 42 },
    size: [44, 44, 32],
  },
  photo: {
    sq: { x: 80, y: 330, width: 460, height: 340 },
    story: { x: 80, y: 540, width: 920, height: 680 },
    wide: { x: 60, y: 240, width: 340, height: 320 },
  },
  badge: {
    sq: { x: 600, y: 330, width: 400, height: 400 },
    story: { x: 620, y: 1080, width: 380, height: 380 },
    wide: { x: 820, y: 100, width: 320, height: 320 },
  },
  logo: {
    sq: { x: 880, y: 880, width: 120, height: 120 },
    story: { x: 880, y: 1740, width: 120, height: 120 },
    wide: { x: 1080, y: 500, width: 80, height: 80 },
  },
  shapes: {
    sq: { x: 80, y: 720, width: 300, height: 120 },
    story: { x: 80, y: 1300, width: 300, height: 120 },
    wide: { x: 430, y: 260, width: 300, height: 120 },
  },
  left: {
    sq: { x: 80, y: 720, width: 200, height: 120 },
    story: { x: 80, y: 1300, width: 200, height: 120 },
    wide: { x: 430, y: 260, width: 200, height: 120 },
  },
  right: {
    sq: { x: 240, y: 720, width: 140, height: 120 },
    story: { x: 240, y: 1300, width: 140, height: 120 },
    wide: { x: 590, y: 260, width: 140, height: 120 },
  },
  card: {
    sq: { x: 80, y: 880, width: 320, height: 110 },
    story: { x: 80, y: 1700, width: 320, height: 110 },
    wide: { x: 430, y: 470, width: 280, height: 90 },
  },
  cta: {
    sq: { x: 140, y: 910, width: 220, height: 52 },
    story: { x: 140, y: 1730, width: 220, height: 52 },
    wide: { x: 480, y: 490, width: 200, height: 44 },
    size: [40, 40, 34],
  },
}

/**
 * An ad in a square frame with a layer of each type (a text, a shape, a photo, a group, a boolean
 * and a box holding a text), its linked copies in a story and a landscape frame, a frame on the
 * page linked to none, and a second page.
 */
export function linkedMenuDesign(assetId: string): DesignInput {
  const box = (id: string) => LAYOUT[id]?.sq as Box
  const look = (fontSize: number, color = INK, fontWeight = 800) => ({
    fontFamily: 'Noto Sans',
    fontSize,
    fontWeight,
    color,
  })
  const text = (index: string, words: string, props: Box, fontSize: number, parentId = 'sq', color = INK) => ({
    type: 'text' as const,
    parentId,
    index,
    name: words,
    props: { ...props, boxMode: 'autoHeight' as const, text: words, style: look(fontSize, color) },
  })
  const shape = (
    index: string,
    name: string,
    kind: 'rect' | 'ellipse',
    props: Box,
    color: string,
    parentId = 'sq',
  ) => ({
    type: 'graphic' as const,
    parentId,
    index,
    name,
    props: { ...props, shape: { kind }, fills: solid(color) },
  })
  const square = frameDesign({
    name: 'Linked menu',
    frameName: 'Feed square',
    fills: solid('#FFD43BFF'),
    nodes: {
      headline: text('a0', 'Weekend sale', box('headline'), 110),
      sub: text('a1', '20% off every bag', box('sub'), 44),
      photo: {
        ...shape('a2', 'Photo', 'rect', box('photo'), INK),
        props: { ...box('photo'), shape: { kind: 'rect' }, fills: [{ type: 'image', assetId, fit: 'fill' }] },
      },
      badge: shape('a3', 'Badge', 'ellipse', box('badge'), PINK),
      logo: { type: 'group', parentId: 'sq', index: 'a4', name: 'Logo', props: box('logo') },
      mark: shape('a0', 'Mark', 'ellipse', box('logo'), INK, 'logo'),
      shapes: {
        type: 'boolean',
        parentId: 'sq',
        index: 'a5',
        name: 'Shapes',
        props: { ...box('shapes'), op: 'union', fills: solid(GREEN) },
      },
      left: shape('a0', 'Left', 'rect', box('left'), GREEN, 'shapes'),
      right: shape('a1', 'Right', 'ellipse', box('right'), GREEN, 'shapes'),
      card: {
        type: 'box',
        parentId: 'sq',
        index: 'a6',
        name: 'Card',
        props: { ...box('card'), cornerRadius: 55, fills: solid(INK) },
      },
      cta: text('a0', 'Shop now', box('cta'), 40, 'card', WHITE),
    },
  })
  /** Each layer's box in a frame, and its text's size there. */
  const valuesIn = (frame: 'story' | 'wide', at: 1 | 2) =>
    Object.fromEntries(
      Object.entries(LAYOUT).map(([id, layout]) => {
        const size = layout.size?.[at]
        const color = id === 'cta' ? WHITE : INK
        return [id, { ...layout[frame], ...(size ? { style: look(size, color) } : {}) }]
      }),
    )
  const linked = linkedFrames(square, [
    { id: 'story', name: 'Story', width: 1080, height: 1920, values: valuesIn('story', 1) },
    { id: 'wide', name: 'Landscape', width: 1200, height: 628, values: valuesIn('wide', 2) },
  ])
  return {
    ...linked,
    pages: { ...linked.pages, p2: { name: 'Page 2', order: 'a1' } },
    frames: {
      ...linked.frames,
      fresh: {
        pageId: 'p1',
        name: 'Fresh',
        width: 1080,
        height: 1080,
        x: 0,
        y: 2200,
        order: 'a9',
        fills: solid(GREEN),
      },
      far: { pageId: 'p2', name: 'Far', width: 1080, height: 1080, x: 0, y: 0, order: 'a0', fills: solid(WHITE) },
    },
    nodes: {
      ...linked.nodes,
      'fresh-title': {
        ...text('a0', 'Fresh roast', { x: 80, y: 80, width: 920, height: 143 }, 110, 'fresh', WHITE),
        link: 'fresh-title',
      },
      'far-title': {
        ...text('a0', 'Far away', { x: 80, y: 80, width: 920, height: 143 }, 110, 'far'),
        link: 'far-title',
      },
    },
  }
}
