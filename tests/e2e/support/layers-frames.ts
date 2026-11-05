import type { DesignInput } from '@dazbee/schema'

import { rect, tree } from './layers-panel.ts'
import { copyIn, frameDesign, linkedFrames } from './seed.ts'
import type { Page } from './test.ts'

const LOCKED = { move: true, resize: true, content: true, style: true, delete: true }
const YELLOW = [{ type: 'solid' as const, color: '#FFD23FFF' }]
const GREEN = [{ type: 'solid' as const, color: '#218A5CFF' }]
const text = (parentId: string, index: string, name: string, words: string, y: number) => ({
  type: 'text' as const,
  parentId,
  index,
  name,
  props: {
    x: 80,
    y,
    width: 900,
    height: 110,
    text: words,
    style: { fontFamily: 'Noto Sans', fontSize: 80, color: '#1A1420FF' },
  },
})
const group = (parentId: string, index: string, name: string) => ({
  type: 'group' as const,
  parentId,
  index,
  name,
  props: { x: 560, y: 420, width: 400, height: 400 },
})

/**
 * Page "Summer sale" holds Sale square and Sale story, linked: the story holds a copy of every
 * square layer but Badge, its Logo shown and its Button unlocked where the square's are hidden and
 * locked. Fresh square sits beside them, linked to neither. The square's Photo holds Mount, which
 * holds Inner, which holds Picture. Page 2 holds one banner.
 */
export function design(): DesignInput {
  const square = frameDesign({
    name: 'Layers of frames',
    frameName: 'Sale square',
    fills: YELLOW,
    nodes: {
      photo: group('sq', 'a0', 'Photo'),
      mount: group('photo', 'a0', 'Mount'),
      inner: group('mount', 'a0', 'Inner'),
      picture: {
        type: 'graphic',
        parentId: 'inner',
        index: 'a0',
        name: 'Picture',
        props: { ...rect(560, 420, 400, 400, '#FF48B0FF'), shape: { kind: 'ellipse' as const } },
      },
      head: text('sq', 'a1', 'Headline', 'Weekend sale', 80),
      logo: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a2',
        name: 'Logo',
        props: { ...rect(900, 60, 120, 120, '#1A1420FF'), visible: false },
      },
      button: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a3',
        name: 'Button',
        lock: LOCKED,
        props: rect(80, 900, 300, 100, '#1A1420FF'),
      },
      badge: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a4',
        name: 'Badge',
        props: { ...rect(820, 700, 160, 160, '#FF48B0FF'), shape: { kind: 'ellipse' as const } },
      },
    },
  })
  const linked = linkedFrames(square, [
    { id: 'story', name: 'Sale story', width: 1080, height: 1920, values: { logo: { visible: true } } },
  ])
  const nodes = Object.fromEntries(Object.entries(linked.nodes).filter(([id]) => id !== copyIn('story', 'badge')))
  const button = nodes[copyIn('story', 'button')]
  if (button) {
    const unlocked = { ...button }
    delete unlocked.lock
    nodes[copyIn('story', 'button')] = unlocked
  }
  return {
    ...linked,
    pages: { p1: { name: 'Summer sale', order: 'a0' }, p2: { name: 'Diwali', order: 'a1' } },
    frames: {
      ...linked.frames,
      fresh: {
        pageId: 'p1',
        name: 'Fresh square',
        width: 1080,
        height: 1080,
        x: 2560,
        y: 0,
        fills: GREEN,
        order: 'a2',
      },
      banner: { pageId: 'p2', name: 'Banner', width: 300, height: 250, x: 0, y: 0, fills: YELLOW, order: 'a0' },
    },
    nodes: {
      ...nodes,
      roast: { ...text('fresh', 'a0', 'Fresh roast', 'Fresh roast', 80), link: 'roast' },
      bannerHead: { ...text('banner', 'a0', 'Headline', 'Diwali', 40), link: 'head' },
    },
  }
}

/** A layer's row by its id: the square's layers and the story's copies share names. */
export const layerRow = (page: Page, id: string) => tree(page).locator(`[data-layer="${id}"]`)
export const picked = (page: Page) => page.evaluate(() => window.dazbee?.pickedFrame() ?? null)
