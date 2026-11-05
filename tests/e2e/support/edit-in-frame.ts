import { designOf, openTabs } from './editor.ts'
import { frameDesign, layersIn, linkedFrames, seed } from './seed.ts'
import { type Design, drawn, perform, read } from './stage.ts'
import { type Browser, expect, type Page } from './test.ts'

export const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const },
  fills: solid(color),
})

/** The square's layers, and their linked copies in a story where the headline sits lower. */
const design = () =>
  linkedFrames(
    frameDesign({
      name: 'Edit stays in its frame',
      nodes: {
        shape: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a0',
          name: 'Shape',
          props: rect(100, 100, 200, 160, '#E0262BFF'),
        },
        dot: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a1',
          name: 'Dot',
          props: { ...rect(400, 100, 160, 160, '#2F6BFFFF'), shape: { kind: 'ellipse' } },
        },
        group: {
          type: 'group',
          parentId: 'sq',
          index: 'a2',
          name: 'Group',
          props: { x: 100, y: 340, width: 360, height: 120 },
        },
        g1: {
          type: 'graphic',
          parentId: 'group',
          index: 'a0',
          name: 'G1',
          props: rect(100, 340, 160, 120, '#FCA311FF'),
        },
        g2: {
          type: 'graphic',
          parentId: 'group',
          index: 'a1',
          name: 'G2',
          props: rect(300, 340, 160, 120, '#2A9D8FFF'),
        },
        card: {
          type: 'box',
          parentId: 'sq',
          index: 'a3',
          name: 'Card',
          props: {
            x: 560,
            y: 340,
            width: 400,
            height: 160,
            fills: solid('#EEF1F6FF'),
            layout: { direction: 'row', gap: 20, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
          },
        },
        c1: { type: 'graphic', parentId: 'card', index: 'a0', name: 'C1', props: rect(0, 0, 80, 80, '#9747FFFF') },
        c2: { type: 'graphic', parentId: 'card', index: 'a1', name: 'C2', props: rect(0, 0, 80, 80, '#13C4A3FF') },
        masks: {
          type: 'group',
          parentId: 'sq',
          index: 'a4',
          name: 'Masked group',
          props: { x: 100, y: 560, width: 300, height: 200 },
        },
        mask: {
          type: 'graphic',
          parentId: 'masks',
          index: 'a0',
          name: 'Mask',
          props: { ...rect(100, 560, 200, 200, '#000000FF'), shape: { kind: 'ellipse' }, mask: 'alpha' },
        },
        masked: {
          type: 'graphic',
          parentId: 'masks',
          index: 'a1',
          name: 'Masked',
          props: rect(100, 560, 300, 200, '#00A88AFF'),
        },
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a5',
          name: 'Headline',
          props: {
            x: 80,
            y: 820,
            width: 920,
            height: 120,
            text: 'Summer sale',
            style: { fontFamily: 'Noto Sans', fontSize: 80, fontWeight: 800, color: '#111111FF' },
          },
        },
      },
    }),
    [{ id: 'story', name: 'Story', width: 1080, height: 1920, values: { headline: { y: 1500 } } }],
  )

/** What a frame is: the frame as stored, and every layer it holds, by id. */
export function inFrame(d: Design, frameId: string) {
  return { frame: d.frames[frameId], layers: Object.fromEntries(layersIn(d, frameId)) }
}
/** The square's layers made since `before`. */
export const added = (before: Design, after: Design) =>
  Object.entries(after.nodes).filter(([id]) => !before.nodes[id] && inFrame(after, 'sq').layers[id])

/** Waits until both tabs have sent every change and hold the same design. */
async function bothHave(a: Page, b: Page) {
  await expect
    .poll(
      async () => {
        const synced = await Promise.all([a, b].map((t) => t.evaluate(() => window.dazbee?.synced() ?? false)))
        return synced.every(Boolean) && (await designOf(a)) === (await designOf(b))
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

/**
 * Opens a fresh copy of the design in two tabs, the first 1440 × 1000 with its camera where design
 * pixels in steps of 5 land on whole screen pixels and snapping off, so drags measure exactly. Its
 * fonts are loaded and both tabs agree before it returns, so a text fitted to its font is no edit.
 */
async function open(browser: Browser) {
  const { tabs, errors } = await openTabs(browser, 2, await seed(design()))
  const [a, b] = tabs as [Page, Page]
  await a.setViewportSize({ width: 1440, height: 1000 })
  await a.evaluate(async () => {
    window.dazbee?.setSnapping(false)
    window.dazbee?.setCamera({ x: 100, y: 60, zoom: 0.8 })
    await window.dazbee?.loaded()
  })
  await drawn(a)
  await bothHave(a, b)
  return { a, b, errors }
}

/**
 * Makes one edit in the square of the first tab and checks it stayed there: the story's frame and
 * copies are stored as they were, `check` sees the change asked for, the second tab has it, and one
 * undo puts the design back.
 */
export async function editInSquare(
  browser: Browser,
  act: (a: Page) => Promise<void>,
  check: (before: Design, after: Design) => void,
) {
  const { a, b, errors } = await open(browser)
  const json = await designOf(a)
  const before = JSON.parse(json) as Design
  await act(a)
  await bothHave(a, b)
  const after = await read(a)
  expect(after, 'the edit changed the design').not.toEqual(before)
  expect(inFrame(after, 'story'), 'the copies in the story as they were').toEqual(inFrame(before, 'story'))
  check(before, after)
  expect(await read(b), 'the second tab has the change').toEqual(after)
  await perform(a, 'undo')
  await expect.poll(() => designOf(a), { message: 'one undo puts it back' }).toBe(json)
  await bothHave(a, b)
  expect(errors).toEqual([])
}

export const propsOf = (d: Design, id: string) => d.nodes[id]?.props as Record<string, unknown>
