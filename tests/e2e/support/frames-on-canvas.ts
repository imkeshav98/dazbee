// The design and helpers of the frames-on-canvas specs: a page holding a square, a story linked to it
// and a banner linked to nothing, the square holding a headline, a layer turned 30°, a locked one and
// a photo under a round mask, opened at half size or alone at a screen size; which frame is picked
// and what a frame holds, where a frame's label is, Tab to the top bar, and the picked frame's ⋯.
import type { DesignInput } from '@dazbee/schema'

import { solid } from './edit-in-frame.ts'
import { editorPath, openTabs, setCookies, settle } from './editor.ts'
import { frameDesign, linkedFrames, seed } from './seed.ts'
import { drawn, fitSettled, read } from './stage.ts'
import { type Browser, expect, type Page } from './test.ts'

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
export const frameOf = async (page: Page, id: string) => (await read(page)).frames[id]
/**
 * Where a frame's name is on its label on screen, near its bottom edge, which a fit keeps clear of
 * the header: at its middle, or a point `dx` in from its start, kept on the name. The overlay draws
 * its labels afresh on every draw, so the name is measured in one step in the page.
 */
export async function labelPoint(page: Page, id: string, dx?: number) {
  const measure = () =>
    page.evaluate((id) => {
      const name = document.querySelector(`.stage-overlay .frame-label[data-frame="${id}"] .frame-name`)
      const box = name?.getBoundingClientRect()
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
    }, id)
  await expect.poll(measure, { message: `no label for ${id}` }).not.toBeNull()
  const name = await measure()
  if (!name) throw new Error(`no label for ${id}`)
  return { x: name.x + Math.min(dx ?? name.width / 2, name.width - 1), y: name.y + name.height - 5 }
}
export async function clickLabel(page: Page, id: string) {
  const at = await labelPoint(page, id, 20)
  await page.mouse.click(at.x, at.y)
  await drawn(page)
}
/** Where a frame's label row is on screen, as the editor places it, drawn or not. */
export async function labelRow(page: Page, id: string) {
  const stage = await page.getByTestId('stage').boundingBox()
  const rect = await page.evaluate((id) => window.dazbee?.labelRect(id), id)
  if (!stage || !rect) throw new Error(`no label for ${id}`)
  return { x: stage.x + rect.x, y: stage.y + rect.y, width: rect.width, height: rect.height }
}
/** The picked frame's ⋯ items in order, each by its name and as it reads with its key. */
const FRAME_MENU = [
  { name: 'Duplicate', reads: 'DuplicateCtrl+D' },
  { name: 'Add size', reads: 'Add size' },
  { name: 'Rename', reads: 'Rename' },
  { name: 'Delete', reads: 'DeleteDelete' },
] as const
/**
 * Checks the picked frame's open ⋯ lists its items in order, Add size after Duplicate. Given `to`,
 * the focus is on the first and Tab moves it down the list item by item, up to `to`. Gives the menu.
 */
export async function frameMenuItems(page: Page, to?: (typeof FRAME_MENU)[number]['name']) {
  const menu = page.getByTestId('bar-frame-more-menu')
  const items = menu.getByRole('button')
  await expect(items).toHaveText(FRAME_MENU.map((item) => item.reads))
  for (const [i, item] of FRAME_MENU.entries()) {
    if (to === undefined) break
    await expect(items.nth(i)).toBeFocused()
    if (item.name === to) break
    await page.keyboard.press('Tab')
  }
  return menu
}
/** Presses Tab until the focus is in the top bar, from wherever it is, and gives the item it reached. */
export async function tabToBar(page: Page) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const inBar = await page.evaluate(() => document.activeElement?.closest('[data-testid="top-bar"]') !== null)
    if (inBar) return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
  }
  throw new Error('Tab never reached the top bar')
}
/**
 * Opens a fresh copy of the design in `count` tabs; the first is 1440 × 1000 with the square at half
 * size 300 px in and 180 px down, so its label clears the chrome, and its fonts loaded. All tabs
 * agree before it returns.
 */
export async function openFrames(browser: Browser, count = 1) {
  const { tabs, errors } = await openTabs(browser, count, await seed(design()))
  const [a] = tabs as [Page, ...Page[]]
  await a.setViewportSize({ width: 1440, height: 1000 })
  await a.evaluate(async () => {
    window.dazbee?.setCamera({ x: 300, y: 180, zoom: 0.5 })
    await window.dazbee?.loaded()
  })
  await drawn(a)
  if (count > 1) await settle(tabs)
  return { a, b: tabs[1] as Page, tabs, errors }
}
/**
 * Opens a design, this spec's unless given, alone in a tab at a screen size, in a theme (dark unless
 * given) and a language (the app's own unless given), fitted, with its fonts loaded.
 */
export async function openSized(
  browser: Browser,
  viewport: { width: number; height: number },
  { theme = 'dark', locale, input = design() }: { theme?: string; locale?: string; input?: DesignInput } = {},
) {
  const designId = await seed(input)
  const page = await (await browser.newContext({ viewport })).newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme, ...(locale && { locale }) })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await page.evaluate(() => window.dazbee?.loaded())
  await fitSettled(page)
  return { page, errors }
}
