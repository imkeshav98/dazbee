// The design and helpers of the frames-on-canvas specs: a page holding a square, a story linked to it
// and a banner linked to nothing, the square holding a headline, a layer turned 30°, a locked one and
// a photo under a round mask; which frame is picked, and where a frame's label is.
import type { DesignInput } from '@dazbee/schema'

import { solid } from './edit-in-frame.ts'
import { frameDesign, linkedFrames } from './seed.ts'
import { drawn } from './stage.ts'
import type { Page } from './test.ts'

/**
 * A square holding a headline, a layer turned 30°, a locked one and a photo under a round mask; a
 * story beside it holding linked copies of them; and a banner past it linked to nothing.
 */
export const design = (): DesignInput => {
  const linked = linkedFrames(
    frameDesign({
      name: 'Frames on the canvas',
      nodes: {
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a0',
          name: 'Headline',
          props: {
            x: 80,
            y: 80,
            width: 600,
            height: 120,
            text: 'Sale',
            style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 800, color: '#111111FF' },
          },
        },
        tilt: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a1',
          name: 'Tilt',
          props: {
            x: 100,
            y: 400,
            width: 200,
            height: 120,
            rotation: 30,
            shape: { kind: 'rect' },
            fills: solid('#2F6BFFFF'),
          },
        },
        locked: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a2',
          name: 'Locked',
          lock: { move: true, style: true, content: true },
          props: { x: 700, y: 400, width: 200, height: 200, shape: { kind: 'rect' }, fills: solid('#E0262BFF') },
        },
        disc: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a3',
          name: 'Disc',
          props: {
            x: 400,
            y: 700,
            width: 200,
            height: 200,
            shape: { kind: 'ellipse' },
            fills: solid('#000000FF'),
            mask: 'alpha',
          },
        },
        photo: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a4',
          name: 'Photo',
          props: { x: 350, y: 650, width: 300, height: 300, shape: { kind: 'rect' }, fills: solid('#FCA311FF') },
        },
      },
    }),
    [{ id: 'story', name: 'Story', width: 1080, height: 1920 }],
  )
  return {
    ...linked,
    frames: {
      ...linked.frames,
      banner: {
        pageId: 'p1',
        name: 'Banner',
        width: 1200,
        height: 628,
        x: 2560,
        y: 0,
        fills: solid('#FFFFFFFF'),
        order: 'a2',
      },
    },
    nodes: {
      ...linked.nodes,
      badge: {
        type: 'graphic',
        parentId: 'banner',
        link: 'badge',
        index: 'a0',
        name: 'Badge',
        props: { x: 40, y: 40, width: 120, height: 120, shape: { kind: 'ellipse' }, fills: solid('#2F6BFFFF') },
      },
    },
  }
}

/** The picked frame, or null. */
export const picked = (page: Page) => page.evaluate(() => window.dazbee?.pickedFrame() ?? null)
/**
 * Where a frame's name is on its label on screen, near its bottom edge, which a fit keeps clear of
 * the header: at its middle, or a point `dx` in from its start, kept on the name.
 */
export async function labelPoint(page: Page, id: string, dx?: number) {
  const name = await page.locator(`.stage-overlay .frame-label[data-frame="${id}"] .frame-name`).boundingBox()
  if (!name) throw new Error(`no label for ${id}`)
  return { x: name.x + Math.min(dx ?? name.width / 2, name.width - 1), y: name.y + name.height - 5 }
}
export async function clickLabel(page: Page, id: string) {
  const at = await labelPoint(page, id, 20)
  await page.mouse.click(at.x, at.y)
  await drawn(page)
}
