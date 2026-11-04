import { expect, type Page } from '@playwright/test'

import type { DesignInput } from '@dazbee/schema'

import { editorPath } from './editor.ts'
import { seed } from './seed.ts'

export const FORMATS = {
  sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
  story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
  land: { name: 'Landscape', width: 1200, height: 628, order: 'a2' },
  mpu: { name: 'MPU', width: 300, height: 250, order: 'a3' },
  leader: { name: 'Leaderboard', width: 728, height: 90, order: 'a4' },
}
const COLORS = ['#FF5A36FF', '#2F6BFFFF', '#FFC400FF', '#1B9E77FF', '#7E57C2FF', '#111111FF']

/** Filler layers under the box and headline: shapes, translucent and shadowed ones, and short texts. */
function filler(pageId: string, count: number, seedAt = 0) {
  const nodes: DesignInput['nodes'] = {}
  for (let i = 0; i < count; i++) {
    const n = i + seedAt
    const x = (n * 97) % 980
    const y = (n * 61) % 1700
    const color = COLORS[n % COLORS.length] as string
    const index = `Z${String(i).padStart(4, '0')}`
    nodes[`${pageId}-f${i}`] =
      i % 6 === 5
        ? {
            type: 'text',
            parentId: pageId,
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
            parentId: pageId,
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

/** The box and headline of a page, with the headline placed so every format shows it. */
function heroes(pageId: string, text: string): Pick<DesignInput, 'nodes' | 'overrides'> {
  return {
    nodes: {
      [`${pageId}-box`]: {
        type: 'graphic',
        parentId: pageId,
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
      [`${pageId}-headline`]: {
        type: 'text',
        parentId: pageId,
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
    overrides: {
      'format:story': { [`${pageId}-headline`]: { y: 900 } },
      'format:land': { [`${pageId}-headline`]: { x: 360, y: 260, width: 800 } },
      'format:mpu': {
        [`${pageId}-headline`]: {
          x: 10,
          y: 150,
          width: 280,
          height: 90,
          style: { fontFamily: 'Noto Sans', fontSize: 28, fontWeight: 800, color: '#111111FF' },
        },
      },
      'format:leader': {
        [`${pageId}-headline`]: {
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

const merge = (...parts: Pick<DesignInput, 'nodes' | 'overrides'>[]) => {
  const nodes: DesignInput['nodes'] = {}
  const overrides: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const part of parts) {
    Object.assign(nodes, part.nodes)
    for (const [scope, byNode] of Object.entries(part.overrides ?? {}))
      overrides[scope] = { ...overrides[scope], ...byNode }
  }
  return { nodes, overrides }
}

/** One page in five formats: the box, the headline and `fill` layers under them. */
export const fiveFormats = (fill: number): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Five formats',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: FORMATS,
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  ...merge(heroes('p1', 'Summer sale'), { nodes: filler('p1', fill) }),
})

/** A carousel of `cards` pages in five formats. */
export const carousel = (cards: number): DesignInput => {
  const pages: DesignInput['pages'] = {}
  const parts = []
  for (let i = 0; i < cards; i++) {
    const id = `c${i}`
    pages[id] = {
      name: `Card ${i + 1}`,
      order: `a${String(i).padStart(2, '0')}`,
      fills: [{ type: 'solid', color: i % 2 ? '#F2F6FFFF' : '#FFF8F0FF' }],
    }
    parts.push(heroes(id, `Card ${i + 1}`), { nodes: filler(id, 10, i * 10) })
  }
  return {
    meta: {
      schemaVersion: 5,
      designId: 'replaced-by-the-api',
      name: 'Carousel',
      kind: 'carousel',
      primaryFormatId: 'sq',
    },
    formats: FORMATS,
    pages,
    ...merge(...parts),
  }
}

export async function open(page: Page, design: DesignInput) {
  const id = await seed(design)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(editorPath(id))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  return { id, errors }
}

/** Waits until the screen shows the latest camera and design. */
export const nextDraw = (page: Page) => page.evaluate(() => window.dazbee?.drawn())
