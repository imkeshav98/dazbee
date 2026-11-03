// The properties cards (#60) in Chromium, with real input: change each property of one layer and of
// several, see mixed values, write a change to the format shown only, as a canvas drag does (and an
// every-format one as the base, with the override gone), and scrub a number as one undo step.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../support/editor.ts'
import { choose } from '../support/select.ts'
import {
  barMenu,
  closeBarMenu,
  fillList,
  moreMenu,
  openCard,
  openStage,
  scopeMenu,
  strokeList,
  textColourHex,
} from '../support/stage.ts'
import { expect, type Locator, type Page, test } from '../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const, cornerRadius: 16 },
  fills: [{ type: 'solid' as const, color }],
})

const design = (): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Properties',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    box: { type: 'graphic', parentId: 'p1', index: 'a0', name: 'Box', props: rect(80, 80, 300, 200, '#E0262BFF') },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Dot',
      props: { ...rect(700, 120, 240, 240, '#2F6BFFFF'), shape: { kind: 'ellipse' as const } },
    },
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a2',
      name: 'Headline',
      props: {
        x: 80,
        y: 480,
        width: 920,
        height: 120,
        text: 'Summer sale',
        style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 800, color: '#111111FF' },
      },
    },
    stack: {
      type: 'frame',
      parentId: 'p1',
      index: 'a3',
      name: 'Stack',
      props: {
        x: 80,
        y: 700,
        width: 600,
        height: 160,
        fills: [{ type: 'solid', color: '#F4EDE4FF' }],
        layout: { direction: 'row', gap: 16, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
      },
    },
    chip1: {
      type: 'graphic',
      parentId: 'stack',
      index: 'a0',
      name: 'Chip 1',
      props: rect(100, 720, 120, 120, '#FCA311FF'),
    },
    chip2: {
      type: 'graphic',
      parentId: 'stack',
      index: 'a1',
      name: 'Chip 2',
      props: rect(236, 720, 120, 120, '#14213DFF'),
    },
  },
  overrides: {},
})

type Node = { props: Record<string, unknown> }
const nodes = (page: Page) => page.evaluate(() => window.dazbee?.design().nodes) as Promise<Record<string, Node>>
const base = async (page: Page, id: string) => (await nodes(page))[id]?.props ?? {}
const overrides = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.dazbee?.design().overrides ?? {}))) as Promise<
    Record<string, Record<string, Record<string, unknown>>>
  >
/** A layer's props as the Square format shows them: the base with Square's own on top. */
const props = async (page: Page, id: string) => ({
  ...(await base(page, id)),
  ...(await overrides(page))['format:sq']?.[id],
})
const select = async (page: Page, ids: string[]) => {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  await expect(await openCard(page, 'layout-card')).toBeVisible()
}
/** Types a value into a field and presses Enter. */
const enter = async (field: Locator, value: string) => {
  await field.fill(value)
  await field.press('Enter')
}

test('one layer: position, size, turn, opacity, blend, fill, stroke and effects', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['box'])
  const layout = async () => await openCard(page, 'layout-card')
  await expect((await layout()).getByRole('spinbutton', { name: 'X position' })).toHaveValue('80')

  await enter((await layout()).getByRole('spinbutton', { name: 'X position' }), '140')
  await expect.poll(async () => (await props(page, 'box')).x).toBe(140)
  await (await layout()).getByRole('spinbutton', { name: 'Width' }).press('ArrowUp')
  await expect.poll(async () => (await props(page, 'box')).width).toBe(301)
  await (await layout()).getByRole('spinbutton', { name: 'Width' }).press('Shift+ArrowUp')
  await expect.poll(async () => (await props(page, 'box')).width).toBe(311)
  await enter((await moreMenu(page)).getByRole('spinbutton', { name: 'Rotation in degrees' }), '15')
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await props(page, 'box')).rotation).toBe(15)

  const look = async () => await openCard(page, 'appearance-card')
  await enter((await look()).getByRole('spinbutton', { name: 'Opacity' }), '50')
  await expect.poll(async () => (await props(page, 'box')).opacity).toBe(0.5)
  await choose((await look()).getByRole('combobox', { name: 'Blend mode' }), 'multiply')
  await expect.poll(async () => (await props(page, 'box')).blendMode).toBe('multiply')

  const fill = await fillList(page)
  await enter(fill.getByRole('textbox', { name: 'Colour 1 hex' }), '00a889')
  await expect.poll(async () => (await props(page, 'box')).fills).toEqual([{ type: 'solid', color: '#00A889FF' }])
  await enter(fill.getByRole('textbox', { name: 'Colour 1 opacity' }), '80')
  await expect.poll(async () => (await props(page, 'box')).fills).toEqual([{ type: 'solid', color: '#00A889CC' }])
  await fill.getByRole('button', { name: 'Add fill' }).click()
  await expect.poll(async () => ((await props(page, 'box')).fills as unknown[]).length).toBe(2)
  await fill.getByRole('button', { name: 'Remove fill 2' }).click()
  await expect.poll(async () => ((await props(page, 'box')).fills as unknown[]).length).toBe(1)

  const stroke = await strokeList(page)
  await stroke.getByRole('button', { name: 'Add outline' }).click()
  await expect.poll(async () => (await props(page, 'box')).strokes).toMatchObject([{ width: 2, align: 'center' }])
  await enter(stroke.getByRole('spinbutton', { name: 'Outline 1 width' }), '6')
  await choose(stroke.getByRole('combobox', { name: 'Outline 1 position' }), 'inside')
  await expect.poll(async () => (await props(page, 'box')).strokes).toMatchObject([{ width: 6, align: 'inside' }])
  // Dashes typed as lengths, an offset, and the look of the ends and corners (#152); a pattern
  // that isn't one is refused, and clearing it makes the line solid again.
  await enter(stroke.getByRole('textbox', { name: 'Outline 1 dashes' }), '12, 6')
  await enter(stroke.getByRole('spinbutton', { name: 'Outline 1 dash offset' }), '3')
  await choose(stroke.getByRole('combobox', { name: 'Outline 1 ends' }), 'round')
  await choose(stroke.getByRole('combobox', { name: 'Outline 1 corners' }), 'bevel')
  await expect
    .poll(async () => (await props(page, 'box')).strokes)
    .toMatchObject([{ width: 6, align: 'inside', dashes: [12, 6], dashOffset: 3, cap: 'round', join: 'bevel' }])
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('props-dashed-stroke.png', await page.screenshot())
  await enter(stroke.getByRole('textbox', { name: 'Outline 1 dashes' }), '0 0')
  await expect(stroke.getByRole('textbox', { name: 'Outline 1 dashes' })).toHaveValue('12 6')
  await enter(stroke.getByRole('textbox', { name: 'Outline 1 dashes' }), '')
  await expect.poll(async () => (await props(page, 'box')).strokes).toMatchObject([{ dashes: [] }])

  const effects = await barMenu(page, 'effects')
  await choose(effects.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'dropShadow')
  await expect.poll(async () => (await props(page, 'box')).effects).toMatchObject([{ type: 'dropShadow', blur: 24 }])
  await enter(effects.getByRole('spinbutton', { name: 'Drop shadow 1 Blur' }), '40')
  await expect.poll(async () => (await props(page, 'box')).effects).toMatchObject([{ type: 'dropShadow', blur: 40 }])

  // Like a drag, every change is Square's own: the base and Story are as they were.
  const o = await overrides(page)
  expect(o['format:sq']?.box).toMatchObject({ x: 140, width: 311, rotation: 15, opacity: 0.5, blendMode: 'multiply' })
  expect(await base(page, 'box')).toMatchObject({
    ...rect(80, 80, 300, 200, '#E0262BFF'),
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    strokes: [],
    effects: [],
  })
  expect(o['format:story']?.box ?? {}).toEqual({})
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('props-0-one-layer.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('several layers: mixed values, set together or each from its own; text and auto layout', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['box', 'dot'])
  const layout = async () => await openCard(page, 'layout-card')
  const x = (await layout()).getByRole('spinbutton', { name: 'X position' })
  await expect(x).toHaveValue('')
  await expect(x).toHaveAttribute('placeholder', 'Mixed')
  await expect(await fillList(page)).toContainText('The selected layers differ.')
  writeOutput('props-1-mixed.png', await page.screenshot())

  // The arrow moves each from its own; Enter gives both the same.
  await (await layout()).getByRole('spinbutton', { name: 'X position' }).press('ArrowUp')
  await expect.poll(async () => [(await props(page, 'box')).x, (await props(page, 'dot')).x]).toEqual([81, 701])
  await enter((await layout()).getByRole('spinbutton', { name: 'Y position' }), '300')
  await expect.poll(async () => [(await props(page, 'box')).y, (await props(page, 'dot')).y]).toEqual([300, 300])
  await expect((await layout()).getByRole('spinbutton', { name: 'Y position' })).toHaveValue('300')
  await (await fillList(page)).getByRole('button', { name: 'Use one for all' }).click()
  await expect
    .poll(async () => [(await props(page, 'box')).fills, (await props(page, 'dot')).fills])
    .toEqual([[{ type: 'solid', color: '#D9D9D9FF' }], [{ type: 'solid', color: '#D9D9D9FF' }]])
  await enter((await fillList(page)).getByRole('textbox', { name: 'Colour 1 hex' }), '#FFB020')
  await expect
    .poll(async () => [(await props(page, 'box')).fills, (await props(page, 'dot')).fills])
    .toEqual([[{ type: 'solid', color: '#FFB020FF' }], [{ type: 'solid', color: '#FFB020FF' }]])
  await enter((await openCard(page, 'appearance-card')).getByRole('spinbutton', { name: 'Opacity' }), '75')
  await expect
    .poll(async () => [(await props(page, 'box')).opacity, (await props(page, 'dot')).opacity])
    .toEqual([0.75, 0.75])

  // Text.
  await select(page, ['headline'])
  const text = async () => await openCard(page, 'spacing-card')
  await enter(page.getByTestId('bar-size-field'), '120')
  await enter((await text()).getByRole('spinbutton', { name: 'Letter spacing' }), '2')
  await enter((await text()).getByRole('spinbutton', { name: 'Line height' }), '1.1')
  await enter(await textColourHex(page), '1f9d55')
  await closeBarMenu(page, 'bar-colour')
  await (
    await barMenu(page, 'align')
  )
    .getByRole('radiogroup', { name: 'Alignment', exact: true })
    .locator('[data-value="center"]')
    .click()
  await (await barMenu(page, 'case')).getByRole('radiogroup', { name: 'Case' }).locator('[data-value="upper"]').click()
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => {
      const p = await props(page, 'headline')
      return { style: p.style, align: p.align }
    })
    .toMatchObject({
      style: {
        fontSize: 120,
        letterSpacing: 2,
        lineHeight: 1.1,
        color: '#1F9D55FF',
        textCase: 'upper',
        fontFamily: 'Noto Sans',
        fontWeight: 800,
      },
      align: 'center',
    })
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('props-2-text.png', await page.screenshot())

  // Auto layout.
  await select(page, ['stack'])
  const auto = async () => await openCard(page, 'auto-layout-card')
  await enter((await auto()).getByRole('spinbutton', { name: 'Room between' }), '32')
  await (await auto()).getByRole('radio', { name: 'Column' }).click()
  await enter(
    (await openCard(page, 'auto-layout-advanced')).getByRole('spinbutton', { name: 'Room at the left' }),
    '40',
  )
  await expect
    .poll(async () => (await props(page, 'stack')).layout)
    .toMatchObject({ direction: 'column', gap: 32, padding: { left: 40, top: 20 } })
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('props-3-auto-layout.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('a change goes to the format shown, like a drag; all formats writes the base and clears it', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['box'])
  const chip = page.getByTestId('scope-chip')
  await expect(chip).toHaveText('Only Square')
  await expect((await scopeMenu(page)).getByRole('radio', { name: 'Only Square' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  const x = async () => (await openCard(page, 'layout-card')).getByRole('spinbutton', { name: 'X position' })
  await enter(await x(), '500')
  await enter((await fillList(page)).getByRole('textbox', { name: 'Colour 1 hex' }), '00A889')
  await expect
    .poll(async () => (await overrides(page))['format:sq']?.box)
    .toMatchObject({ x: 500, fills: [{ type: 'solid', color: '#00A889FF' }] })
  // The base and the other format are as they were.
  expect((await base(page, 'box')).x).toBe(80)
  expect((await base(page, 'box')).fills).toEqual([{ type: 'solid', color: '#E0262BFF' }])
  expect((await overrides(page))['format:story']?.box ?? {}).toEqual({})
  await expect(await x()).toHaveValue('500')
  writeOutput('props-4-this-format.png', await page.screenshot())

  // All formats: the value goes to the base and this format's override of it goes.
  await (await scopeMenu(page)).getByRole('radio', { name: 'All sizes' }).click()
  await page.keyboard.press('Escape')
  await expect(chip).toHaveText('For all sizes')
  await enter(await x(), '200')
  await expect.poll(async () => (await base(page, 'box')).x).toBe(200)
  const after = (await overrides(page))['format:sq']?.box ?? {}
  expect(after).not.toHaveProperty('x')
  // The fill override stays: only the property changed is made the same everywhere.
  expect(after).toHaveProperty('fills')
  expect(errors).toEqual([])
})

test('scrubbing a number is one undo step', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['box', 'dot'])
  const handle = async () => (await openCard(page, 'layout-card')).locator('[data-scrub="X position"]')
  const box = await (await handle()).boundingBox()
  if (!box) throw new Error('no scrub handle')
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(start.x + i * 5, start.y)
  await page.mouse.up()
  // 60 px to the end at a step per 2 px: each 30 further on, from its own.
  await expect.poll(async () => [(await props(page, 'box')).x, (await props(page, 'dot')).x]).toEqual([110, 730])
  writeOutput('props-5-scrubbed.png', await page.screenshot())
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => [(await props(page, 'box')).x, (await props(page, 'dot')).x]).toEqual([80, 700])
  // And redo brings the whole scrub back.
  await page.evaluate(() => window.dazbee?.perform('redo'))
  await expect.poll(async () => [(await props(page, 'box')).x, (await props(page, 'dot')).x]).toEqual([110, 730])
  expect(errors).toEqual([])
})
