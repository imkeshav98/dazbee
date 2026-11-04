// The Position panel in Chromium: the moves along the stack and lining up first, by name for
// one layer and by icon for several, and the numbers under Advanced, where Lock ratio keeps the
// box's shape. Every button is one undo step. Screenshots at desktop, tablet and phone sizes.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../support/editor.ts'
import { openStage, order, props } from '../support/stage.ts'
import { expect, type Locator, type Page, test } from '../support/test.ts'
import { barMenu } from '../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (
  name: string,
  index: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  parentId = 'p1',
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name,
  props: { x, y, width, height, shape: { kind: 'rect' as const, cornerRadius: 12 }, fills: solid(color) },
})

const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Position', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFF8F0FF') } },
  nodes: {
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a0',
      name: 'Headline',
      props: {
        x: 120,
        y: 80,
        width: 640,
        height: 90,
        boxMode: 'autoHeight',
        text: 'Summer sale',
        style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 400, color: '#111111FF' },
      },
    },
    one: rect('One', 'a1', 120, 300, 200, 100, '#FCA311FF'),
    two: rect('Two', 'a2', 400, 340, 160, 160, '#14213DFF'),
    three: rect('Three', 'a3', 700, 380, 120, 120, '#E0262BFF'),
    group: {
      type: 'group',
      parentId: 'p1',
      index: 'a4',
      name: 'Group',
      props: { x: 120, y: 700, width: 400, height: 200 },
    },
    g1: rect('G1', 'a0', 120, 700, 180, 200, '#2A9D8FFF', 'group'),
    g2: rect('G2', 'a1', 340, 700, 180, 200, '#E0157FFF', 'group'),
  },
  overrides: {},
})

const select = async (page: Page, ids: string[]) => {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  await expect(page.getByTestId('top-bar')).toHaveAttribute('data-selection', ids.join(' '))
}
const undo = (page: Page) => page.evaluate(() => window.dazbee?.perform('undo'))
const enter = async (field: Locator, value: string) => {
  await field.fill(value)
  await field.press('Enter')
}
const panel = (page: Page) => barMenu(page, 'position')
const button = async (page: Page, name: string | RegExp) =>
  (await panel(page)).getByRole('button', { name, exact: typeof name === 'string' })

test('one layer: the moves along the stack, lining up with the size by name, and the numbers under Advanced', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['one'])
  const part = (await panel(page)).getByTestId('arrange-part')
  await expect(part.getByRole('heading')).toHaveText(['Arrange', 'Line up with the size'])
  await expect(part.getByRole('button')).toHaveText([
    'Forward',
    'Backward',
    'To front',
    'To back',
    'Top',
    'Left',
    'Middle',
    'Centre',
    'Bottom',
    'Right',
  ])
  await expect(part.getByRole('button', { name: 'To front' })).toHaveAttribute('title', 'Bring to front (Ctrl+Shift+])')

  // Each move is one undo step.
  await (await button(page, 'To front')).click()
  await expect.poll(() => order(page)).toEqual(['headline', 'two', 'three', 'group', 'one'])
  await (await button(page, 'Backward')).click()
  await expect.poll(() => order(page)).toEqual(['headline', 'two', 'three', 'one', 'group'])
  await (await button(page, 'To back')).click()
  await expect.poll(() => order(page)).toEqual(['one', 'headline', 'two', 'three', 'group'])
  await (await button(page, 'Forward')).click()
  await expect.poll(() => order(page)).toEqual(['headline', 'one', 'two', 'three', 'group'])
  await undo(page)
  await expect.poll(() => order(page)).toEqual(['one', 'headline', 'two', 'three', 'group'])

  // One layer lines up with the size it is in.
  await (await button(page, 'Right')).click()
  await expect.poll(async () => (await props(page, 'one')).x).toBe(880)
  await (await button(page, 'Bottom')).click()
  await expect.poll(async () => (await props(page, 'one')).y).toBe(980)
  await (await button(page, 'Centre')).click()
  await expect.poll(async () => (await props(page, 'one')).x).toBe(440)
  await undo(page)
  await expect.poll(async () => (await props(page, 'one')).x).toBe(880)

  // Advanced: width and height, then where it sits, then its turn and Lock ratio.
  const advanced = (await panel(page)).getByTestId('layout-card')
  await expect(advanced.getByRole('heading')).toHaveText('Advanced')
  await expect(advanced.getByRole('spinbutton')).toHaveCount(5)
  const names = await advanced
    .getByRole('spinbutton')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(names).toEqual(['Width', 'Height', 'X position', 'Y position', 'Rotation in degrees'])
  await enter(advanced.getByRole('spinbutton', { name: 'Width' }), '300')
  await expect.poll(() => props(page, 'one')).toMatchObject({ width: 300, height: 100 })

  // With Lock ratio on, the other side follows, in one undo step; off again, it doesn't.
  const lock = advanced.getByRole('switch', { name: 'Lock ratio' })
  await lock.click()
  await expect(lock).toHaveAttribute('aria-checked', 'true')
  await enter(advanced.getByRole('spinbutton', { name: 'Width' }), '150')
  await expect.poll(() => props(page, 'one')).toMatchObject({ width: 150, height: 50 })
  await enter(advanced.getByRole('spinbutton', { name: 'Height' }), '80')
  await expect.poll(() => props(page, 'one')).toMatchObject({ width: 240, height: 80 })
  await undo(page)
  await expect.poll(() => props(page, 'one')).toMatchObject({ width: 150, height: 50 })
  await lock.click()
  await enter(advanced.getByRole('spinbutton', { name: 'Height' }), '120')
  await expect.poll(() => props(page, 'one')).toMatchObject({ width: 150, height: 120 })
  expect(errors).toEqual([])
})

test('several layers line up with each other by icon, and spread out once there are three', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['one', 'two'])
  const part = (await panel(page)).getByTestId('arrange-part')
  await expect(part.getByRole('heading')).toHaveText(['Arrange', 'Line up the selection'])
  await expect(part.getByRole('button', { name: 'Top', exact: true })).toHaveCount(0)
  await expect(part.getByRole('button', { name: 'Spread across' })).toBeDisabled()
  await expect(part.getByRole('button', { name: 'Spread across' })).toHaveAttribute('title', 'Needs 3 or more layers')
  await (await button(page, 'Align top')).click()
  await expect.poll(async () => [(await props(page, 'one')).y, (await props(page, 'two')).y]).toEqual([300, 300])
  await undo(page)
  await expect.poll(async () => (await props(page, 'two')).y).toBe(340)

  // Three spread across: the gaps between them even out, the ends stay.
  await select(page, ['one', 'two', 'three'])
  await expect(await button(page, 'Spread across')).toBeEnabled()
  await (await button(page, 'Spread across')).click()
  // From 120 to 820, 200 + 160 + 120 wide, leaves two gaps of 110.
  await expect
    .poll(async () => [(await props(page, 'one')).x, (await props(page, 'two')).x, (await props(page, 'three')).x])
    .toEqual([120, 430, 700])
  expect(errors).toEqual([])
})

test('a group takes its size from what it holds, so its Advanced has only where it sits', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['group'])
  const advanced = (await panel(page)).getByTestId('layout-card')
  await expect(advanced.getByRole('spinbutton')).toHaveCount(2)
  await expect(advanced.getByRole('switch', { name: 'Lock ratio' })).toHaveCount(0)
  await enter(advanced.getByRole('spinbutton', { name: 'X position' }), '200')
  await expect.poll(async () => (await props(page, 'g1')).x).toBe(200)
  expect(errors).toEqual([])
})

for (const [width, height] of [
  [1280, 760],
  [820, 1180],
  [390, 844],
] as const) {
  test(`screenshots at ${width}×${height}: one layer and several`, { tag: '@evidence' }, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width, height })
    await page.evaluate(() => window.dazbee?.fitAll())
    for (const [name, ids] of [
      ['one', ['headline']],
      ['several', ['one', 'two', 'three']],
    ] as const) {
      await select(page, [...ids])
      await panel(page)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      writeOutput(`position-${width}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
      // On a phone the sheet scrolls: the second picture shows Advanced.
      if (width === 390) {
        await page.locator('#edit-panel').getByTestId('layout-card').scrollIntoViewIfNeeded()
        writeOutput(`position-${width}-${name}-advanced.png`, await page.screenshot({ animations: 'disabled' }))
      }
      await page.keyboard.press('Escape')
    }
    expect(errors).toEqual([])
  })
}
