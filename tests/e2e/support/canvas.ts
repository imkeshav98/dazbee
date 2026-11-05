// The design builders the canvas specs share: five sizes, one page of five linked frames, a frame's
// box and headline and the layers under them, and opening a design at 1440×900.
import { expect, type Page } from '@playwright/test'

import type { DesignInput } from '@dazbee/schema'

import { editorPath } from './editor.ts'
import { frameDesign, linkedFrames, seed, type Seeded } from './seed.ts'

/** The five frames of `fiveFrames`, by id, the first one holding the layers the others copy. */
export const FRAMES = {
  sq: { name: 'Square', width: 1080, height: 1080 },
  story: { name: 'Story', width: 1080, height: 1920 },
  land: { name: 'Landscape', width: 1200, height: 628 },
  mpu: { name: 'MPU', width: 300, height: 250 },
  leader: { name: 'Leaderboard', width: 728, height: 90 },
}
export type FrameKey = keyof typeof FRAMES
const COLORS = ['#FF5A36FF', '#2F6BFFFF', '#FFC400FF', '#1B9E77FF', '#7E57C2FF', '#111111FF']
export const CREAM = [{ type: 'solid' as const, color: '#FFF8F0FF' }]

/** Layers of one frame and their copies' own values in the other frames, as `heroes` gives them. */
export interface Part {
  nodes: Record<string, Seeded>
  values?: Partial<Record<FrameKey, Record<string, Record<string, unknown>>>>
}

/** One frame's layers and the copies' values, joined from parts of it. */
export const merge = (...parts: Part[]) => {
  const nodes: Record<string, Seeded> = {}
  const values: NonNullable<Part['values']> = {}
  for (const part of parts) {
    Object.assign(nodes, part.nodes)
    for (const [key, byNode] of Object.entries(part.values ?? {}) as [
      FrameKey,
      Record<string, Record<string, unknown>>,
    ][])
      values[key] = { ...values[key], ...byNode }
  }
  return { nodes, values }
}

/**
 * Adds the four other frames of FRAMES to a page whose first frame holds `part`'s layers, each with
 * a linked copy of every layer and the part's values for that frame: `<frame>-<id>` on page p1,
 * `<page>-<frame>-<id>` on another.
 */
export function withFrames(design: DesignInput, part: Part, pageId = 'p1'): DesignInput {
  const others = (Object.entries(FRAMES) as [FrameKey, (typeof FRAMES)[FrameKey]][]).filter(([key]) => key !== 'sq')
  return linkedFrames(
    design,
    others.map(([key, frame]) => ({
      id: pageId === 'p1' ? key : `${pageId}-${key}`,
      ...frame,
      values: part.values?.[key],
    })),
    pageId,
  )
}

/** One page of five linked frames: the box, the headline and `fill` layers under them in the square, copied into the others. */
export const fiveFrames = (fill: number): DesignInput => {
  const part = merge(heroes('p1', 'sq', 'Summer sale'), { nodes: filler('p1', 'sq', fill) })
  return withFrames(frameDesign({ name: 'Five frames', fills: CREAM, nodes: part.nodes }), part)
}

/** Seeds the design and opens it in the page at 1440×900; its id and the errors the page throws from then on. */
export async function open(page: Page, design: DesignInput) {
  const id = await seed(design)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(editorPath(id))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  return { id, errors }
}

/**
 * A box and a headline in a frame, ids `<prefix>-box` and `<prefix>-headline`, with the headline's
 * copies placed so every other frame of FRAMES shows it.
 */
export function heroes(prefix: string, frameId: string, text: string): Part {
  const headline = `${prefix}-headline`
  return {
    nodes: {
      [`${prefix}-box`]: {
        type: 'graphic',
        parentId: frameId,
        index: 'a0',
        name: 'Box',
        props: {
          x: 100,
          y: 100,
          width: 200,
          height: 160,
          shape: { kind: 'rect', cornerRadius: 24 },
          fills: [{ type: 'solid', color: '#FF2E7EFF' }],
        },
      },
      [headline]: {
        type: 'text',
        parentId: frameId,
        index: 'a1',
        name: 'Headline',
        role: 'headline',
        props: {
          x: 80,
          y: 480,
          width: 920,
          height: 120,
          text,
          style: { fontFamily: 'Noto Sans', fontSize: 80, fontWeight: 800, color: '#111111FF' },
        },
      },
    },
    values: {
      story: { [headline]: { y: 900 } },
      land: { [headline]: { x: 360, y: 260, width: 800 } },
      mpu: {
        [headline]: {
          x: 10,
          y: 150,
          width: 280,
          height: 90,
          style: { fontFamily: 'Noto Sans', fontSize: 28, fontWeight: 800, color: '#111111FF' },
        },
      },
      leader: {
        [headline]: {
          x: 220,
          y: 20,
          width: 500,
          height: 60,
          style: { fontFamily: 'Noto Sans', fontSize: 36, fontWeight: 800, color: '#111111FF' },
        },
      },
    },
  }
}

/**
 * Filler layers in a frame under the box and headline, ids `<prefix>-f<n>`: shapes, translucent and
 * shadowed ones, and short texts.
 */
export function filler(prefix: string, frameId: string, count: number, seedAt = 0) {
  const nodes: Record<string, Seeded> = {}
  for (let i = 0; i < count; i++) {
    const n = i + seedAt
    const x = (n * 97) % 980
    const y = (n * 61) % 1700
    const color = COLORS[n % COLORS.length] as string
    const index = `Z${String(i).padStart(4, '0')}`
    nodes[`${prefix}-f${i}`] =
      i % 6 === 5
        ? {
            type: 'text',
            parentId: frameId,
            index,
            name: `Note ${i}`,
            props: {
              x,
              y,
              width: 300,
              height: 48,
              text: `Line ${n}`,
              style: { fontFamily: 'Noto Sans', fontSize: 32, color },
            },
          }
        : {
            type: 'graphic',
            parentId: frameId,
            index,
            name: `Shape ${i}`,
            props: {
              x,
              y,
              width: 40 + (n % 7) * 20,
              height: 30 + (n % 5) * 20,
              shape: i % 2 ? { kind: 'ellipse' } : { kind: 'rect', cornerRadius: 8 },
              fills: [{ type: 'solid', color }],
              opacity: i % 4 === 3 ? 0.6 : 1,
              ...(i % 10 === 9 ? { effects: [{ type: 'dropShadow', x: 0, y: 6, blur: 12, color: '#00000055' }] } : {}),
            },
          }
  }
  return nodes
}
