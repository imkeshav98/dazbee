// Glass in Chromium, in dark and light: every floating surface is the one glass the app serves; a
// row on it is lit by a see-through tint under the pointer and while pressed, and reads its muted
// text in the text colour while lit; an open glass button keeps its glass; segmented choices sit in
// a well; coloured text and dialogs take their glass shades. And, for the PR's evidence, glass over a
// bright ad and a white one at desktop, tablet and phone sizes. The bright ad has a white and a black
// block on its yellow, and a pink circle, so each picture shows the glass over all four.
import type { DesignInput } from '@dazbee/schema'

import { editorPath, setCookies, shoot, writeOutput } from '../../support/editor.ts'
import { servedGlass } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { liveDesign, seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import { barMenu, moreMenu, pagesPanel } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** The ad's side, in design pixels. */
const SIDE = 1080
const THEMES = ['dark', 'light'] as const

const solid = (color: string) => [{ type: 'solid' as const, color }]
const shape = (
  name: string,
  index: string,
  box: { x: number; y: number; width: number; height: number },
  color: string,
  kind: 'rect' | 'ellipse' = 'rect',
  parentId = 'p1',
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name,
  props: { ...box, shape: kind === 'rect' ? { kind, cornerRadius: 0 } : { kind }, fills: solid(color) },
})
const headline = {
  type: 'text' as const,
  parentId: 'p1',
  index: 'a3',
  name: 'Headline',
  props: {
    x: 120,
    y: 440,
    width: 840,
    height: 160,
    text: 'Weekend sale',
    style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#1A1420FF' },
  },
}

/** A yellow ad with a white and a black block, a pink circle, a headline and a box with auto layout. */
const brightAd = (): DesignInput => ({
  meta: { designId: 'replaced-by-the-api', name: 'Bright ad', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: SIDE, height: SIDE, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFD23FFF') } },
  nodes: {
    white: shape('White', 'a0', { x: 0, y: 0, width: 540, height: 380 }, '#FFFFFFFF'),
    black: shape('Black', 'a1', { x: 0, y: 700, width: 540, height: 380 }, '#000000FF'),
    circle: shape('Circle', 'a2', { x: 560, y: 260, width: 520, height: 520 }, '#FF48B0FF', 'ellipse'),
    headline,
    stack: {
      type: 'frame',
      parentId: 'p1',
      index: 'a4',
      name: 'Stack',
      props: {
        x: 600,
        y: 840,
        width: 360,
        height: 160,
        fills: solid('#3D6BFFFF'),
        layout: { direction: 'row', gap: 8, padding: { top: 12, right: 12, bottom: 12, left: 12 } },
      },
    },
    inStack: shape('In stack', 'a0', { x: 0, y: 0, width: 80, height: 80 }, '#FFFFFFFF', 'rect', 'stack'),
  },
  overrides: {},
})

/** A white ad with only its headline, so a menu opened from it floats over white. */
const whiteAd = (): DesignInput => ({
  ...brightAd(),
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes: { headline },
})

/** How an element looks, as computed: its glass, fill, layered image, text colour, outline and border. */
const look = (el: Locator) =>
  el.evaluate((e) => {
    const s = getComputedStyle(e)
    return {
      filter: s.backdropFilter,
      fill: s.backgroundColor,
      image: s.backgroundImage,
      colour: s.color,
      outline: s.outlineStyle,
      border: s.borderTopWidth,
    }
  })

/** Opens a design in a tab of its own in a theme, and gives the tab, its errors and its glass. */
async function openIn(
  browser: Browser,
  designId: string,
  theme: (typeof THEMES)[number],
  viewport = { width: 1440, height: 900 },
) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  return { page, errors, glass: await servedGlass(page) }
}

/** Zooms so the ad covers the whole window, centred, so every piece of glass floats over it. */
async function fillWithAd(page: Page, width: number, height: number) {
  await fitSettled(page)
  const zoom = (Math.max(width, height) / SIDE) * 1.05
  const camera = { x: (width - SIDE * zoom) / 2, y: (height - SIDE * zoom) / 2, zoom }
  await page.evaluate((camera) => window.dazbee?.setCamera(camera), camera)
  await drawn(page)
}

/** Holds the mouse down on a control until its fill is the one expected, then lets go: a click. */
async function pressedFill(page: Page, control: Locator, expected: string) {
  await control.hover()
  await page.mouse.down()
  await expect.poll(async () => (await look(control)).fill).toBe(expected)
  await page.mouse.up()
}

async function shot(page: Page, name: string) {
  await nextFrame(page)
  await shoot(page, name)
}

test('floating chrome is the glass the app serves, with nothing painted over its fill', async ({ browser }) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    expect(glass.filter).not.toBe('none')
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await expect(page.getByTestId('flyout')).toBeVisible()
    for (const surface of [
      page.getByRole('toolbar'),
      page.getByRole('group', { name: 'Zoom' }),
      page.getByTestId('flyout'),
    ]) {
      expect(await look(surface)).toMatchObject({ filter: glass.filter, fill: glass.fill, image: 'none' })
    }
    await shoot(page, `ui-${theme}-frost`)
    const dock = await page.getByRole('toolbar').boundingBox()
    const zoom = await page.getByRole('group', { name: 'Zoom' }).boundingBox()
    if (!dock || !zoom) throw new Error('missing dock or zoom')
    writeOutput(
      `ui-${theme}-frost-dock.png`,
      await page.screenshot({
        clip: { x: dock.x - 40, y: dock.y - 40, width: zoom.x + zoom.width - dock.x + 80, height: dock.height + 80 },
      }),
    )
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('the Pages button keeps its glass while open, lit by the pressed tint, and the current page reads in the text colour', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    const button = page.getByTestId('pages-button')
    expect((await look(button)).fill).toBe(glass.fill)
    const card = await pagesPanel(page)
    await page.mouse.move(2, 2)
    await expect.poll(async () => (await look(button)).colour).toBe(glass.text)
    expect(await look(button)).toMatchObject({
      fill: glass.fill,
      image: `linear-gradient(${glass.pressed}, ${glass.pressed})`,
    })
    const current = card.locator('[data-page][aria-current="page"]')
    expect((await look(current.getByText('1 size'))).colour).toBe(glass.text)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('a menu row is lit by the hover tint and, while pressed, the pressed tint, its shortcut in the text colour; only keyboard focus rings it', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await page.getByTestId('zoom').click()
    const menu = page.getByTestId('zoom-menu')
    await expect(menu).toBeVisible()
    expect(await look(menu)).toMatchObject({ filter: glass.filter, fill: glass.fill, image: 'none' })
    const row = menu.getByRole('button').first()
    const key = row.locator('kbd')
    await row.hover()
    await expect.poll(async () => (await look(row)).fill).toBe(glass.hover)
    expect((await look(key)).colour).toBe(glass.text)
    expect((await look(row)).outline).toBe('none')
    await pressedFill(page, row, glass.pressed)
    // The press zooms in and closes the menu. Opened from the keyboard, the menu's first row has the focus, and the ring shows.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await page.getByTestId('zoom').focus()
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await expect(row).toBeFocused()
    expect((await look(row)).outline).toBe('solid')
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('dock and rail buttons and a layer row take the pressed tint while pressed', async ({ browser }) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await expect(page.getByTestId('flyout')).toBeVisible()
    // In this order, as each press ends in a click: the layer is selected, the Text tool picked, and
    // the Brand flyout opened in place of Layers.
    for (const control of [
      page.locator('[data-layer="box"]'),
      page.locator('[role="toolbar"] [data-tool="text"]'),
      page.getByRole('button', { name: 'Brand', exact: true }),
    ]) {
      await pressedFill(page, control, glass.pressed)
    }
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('coloured text on glass takes its glass shade: the AI flyout heading and a menu’s Delete', async ({ browser }) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    expect((await look(page.getByTestId('flyout').getByRole('heading'))).colour).toBe(glass.accentText)
    const card = await pagesPanel(page)
    await card.getByRole('button', { name: 'More for Page 1' }).click()
    expect((await look(page.getByRole('button', { name: 'Delete page' }))).colour).toBe(glass.danger)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('the Position panel’s actions are unfilled with no outline, lit by the hover tint', async ({ browser }) => {
  const designId = await seed(brightAd())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await selectLayers(page, ['headline'], { bar: true })
    const action = (await barMenu(page, 'position')).getByTestId('arrange-part').getByRole('button').first()
    expect(await look(action)).toMatchObject({ fill: 'rgba(0, 0, 0, 0)', border: '0px' })
    await action.hover()
    await expect.poll(async () => (await look(action)).fill).toBe(glass.hover)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('segmented choices on glass sit in a well, the chosen one on a chip in the text colour; line-up cells take the hover tint', async ({
  browser,
}) => {
  const designId = await seed(brightAd())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await selectLayers(page, ['stack'], { bar: true })
    const panel = await barMenu(page, 'stack')
    const chosen = { fill: glass.chip, colour: glass.text }
    const direction = panel.getByRole('radiogroup', { name: 'Direction' })
    expect((await look(direction)).fill).toBe(glass.well)
    expect(await look(direction.getByRole('radio', { checked: true }))).toMatchObject(chosen)
    const gaps = panel.getByRole('group', { name: 'Room between' })
    expect((await look(gaps)).fill).toBe(glass.well)
    expect(await look(gaps.locator('[aria-pressed="true"]'))).toMatchObject(chosen)
    const pad = panel.getByRole('group', { name: 'Line up' })
    expect((await look(pad)).fill).toBe(glass.well)
    const cell = pad.locator('[aria-pressed="false"]').first()
    await cell.hover()
    await expect.poll(async () => (await look(cell)).fill).toBe(glass.hover)
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()

    await page.getByTestId('share-open').click()
    await page.getByTestId('export-open').click()
    const exports = page.getByTestId('export')
    for (const name of ['Pages', 'File type']) {
      const choices = exports.getByRole('radiogroup', { name })
      expect((await look(choices)).fill).toBe(glass.well)
      expect(await look(choices.getByRole('radio', { checked: true }))).toMatchObject(chosen)
    }
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('a glass dialog dims the page behind it with its theme’s backdrop', async ({ browser }) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await page.keyboard.press('?')
    const dialog = page.getByTestId('shortcuts')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor)).toBe(glass.backdrop)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

for (const [width, height] of SCREEN_SIZES) {
  test(
    `glass at ${width}×${height}: menus, the edit panel, a flyout, the Pages card and a dialog over a bright ad, and a lit menu row over a white one`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const bright = await seed(brightAd())
      const white = await seed(whiteAd())
      for (const theme of THEMES) {
        const { page, errors } = await openIn(browser, bright, theme, { width, height })
        await fillWithAd(page, width, height)
        await selectLayers(page, ['headline'], { bar: true })

        await moreMenu(page)
        await shot(page, `glass-${theme}-${width}-menu`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-more-menu')).toBeHidden()

        await barMenu(page, 'position')
        await expect(page.locator('#edit-panel')).toBeVisible()
        await shot(page, `glass-${theme}-${width}-edit-panel`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-position-menu')).toBeHidden()

        await page.getByRole('button', { name: 'Layers', exact: true }).click()
        await expect(page.getByTestId('flyout')).toBeVisible()
        await shot(page, `glass-${theme}-${width}-flyout`)

        await pagesPanel(page)
        await shot(page, `glass-${theme}-${width}-pages`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-pages-menu')).toBeHidden()

        await page.keyboard.press('?')
        await expect(page.getByTestId('shortcuts')).toBeVisible()
        await shot(page, `glass-${theme}-${width}-shortcuts`)
        expect(errors).toEqual([])
        await page.context().close()

        const plain = await openIn(browser, white, theme, { width, height })
        await fillWithAd(plain.page, width, height)
        await selectLayers(plain.page, ['headline'], { bar: true })
        await (await moreMenu(plain.page)).getByRole('button', { name: /^Duplicate/ }).hover()
        await shot(plain.page, `glass-${theme}-${width}-lit-row`)
        expect(plain.errors).toEqual([])
        await plain.page.context().close()
      }
    },
  )
}
