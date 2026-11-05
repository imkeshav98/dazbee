// The visual-first property cards (as in the final mock) in Chromium: text's size and its colour
// from the brand kit, the effects as tiles with their numbers under them, and the header card that
// names the layer and holds its box. And the swatch-like controls of the Colour panel, the frame
// Background panel built on it, the Outline panel and the Effects panel: on a phone each is a target a
// finger can hit, in a sheet that scrolls rather than cutting one off, while a desktop keeps their
// size; with pictures of the panels at the three screen sizes in both themes. And the paint editor
// that + opens in the Colour and Background panels, with Add image: on a phone or a touch screen
// every one of its targets is 44 px tall and 8 px from the next for each kind of fill, while a desktop
// keeps their size.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign, newBrand, putKit } from '../../support/seed.ts'
import { nextFrame, openStage } from '../../support/stage.ts'
import {
  expectTouchTargets,
  paintPopup,
  SWATCH_KIT,
  SWATCH_PANELS,
  type SwatchControl,
  swatchTouches,
  type Touch,
} from '../../support/swatches.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, openCard, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput =>
  frameDesign({
    name: 'Look cards',
    fills: [{ type: 'solid', color: '#FF8A3DFF' }],
    nodes: {
      headline: {
        type: 'text',
        parentId: 'sq',
        index: 'a0',
        name: 'Headline',
        props: {
          x: 76,
          y: 162,
          width: 610,
          height: 204,
          text: 'Cold brew is back',
          style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 800, color: '#FFFFFFFF' },
        },
      },
      badge: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a1',
        name: 'Badge',
        props: {
          x: 80,
          y: 700,
          width: 280,
          height: 280,
          shape: { kind: 'ellipse' },
          fills: [{ type: 'solid', color: '#FFE14DFF' }],
        },
      },
    },
  })

type Node = { bindings?: Record<string, string>; props: Record<string, unknown> & { style?: Record<string, unknown> } }
const node = (page: Page, id: string) => page.evaluate((id) => window.dazbee?.design().nodes[id], id) as Promise<Node>

test('the look comes first: size and brand colour, effect tiles, and the header card', async ({ browser }) => {
  const brandId = await newBrand('e2e look-cards')
  await putKit(brandId, {
    colors: [
      { token: 'berry', name: 'Berry', value: '#FF3D6EFF' },
      { token: 'roast', name: 'Roast', value: '#2A140AFF' },
    ],
  })
  const { page, errors } = await openStage(browser, design(), { brandId })
  await page.evaluate(() => window.dazbee?.select(['headline']))

  // Text, in the bar: the size, and the brand's colours with the colour it has now leading them.
  const size = page.getByTestId('bar-size-field')
  await size.fill('64')
  await size.press('Enter')
  await expect.poll(async () => (await node(page, 'headline')).props.style?.fontSize).toBe(64)
  const colours = (await barMenu(page, 'colour')).getByRole('group', { name: 'Brand colours' })
  await expect(colours.getByRole('button')).toHaveCount(3)
  await expect(colours.getByRole('button', { name: 'Now #FFFFFF' })).toHaveAttribute('aria-pressed', 'true')
  await colours.getByRole('button', { name: 'Berry' }).click()
  await expect.poll(async () => (await node(page, 'headline')).bindings).toMatchObject({ textColor: 'brand:berry' })
  await expect(colours.getByRole('button', { name: 'Berry' })).toHaveAttribute('aria-pressed', 'true')

  // Effects as tiles, in the bar for text: None to start, Shadow and Outline on together, None takes both off.
  const effects = await barMenu(page, 'effects')
  await expect(effects.locator('[data-tile="none"]')).toHaveAttribute('aria-pressed', 'true')
  await effects.locator('[data-tile="dropShadow"]').click()
  await effects.locator('[data-tile="outline"]').click()
  await expect
    .poll(async () => {
      const props = (await node(page, 'headline')).props
      return [
        (props.effects as { type: string }[]).map((e) => e.type),
        (props.style?.outline as { width: number } | undefined)?.width,
      ]
    })
    .toEqual([['dropShadow'], 2])
  await expect(effects.locator('[data-tile="none"]')).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('look-cards-text.png', await page.screenshot())
  // The picked effect's numbers are under the tiles.
  await expect(effects.getByRole('spinbutton', { name: 'Drop shadow 1 Blur' })).toBeVisible()
  await effects.locator('[data-tile="none"]').click()
  await expect
    .poll(async () => {
      const props = (await node(page, 'headline')).props
      return [(props.effects as unknown[]).length, props.style?.outline]
    })
    .toEqual([0, undefined])

  // The Position panel names the layer and holds its box.
  const header = async () => await openCard(page, 'layout-card')
  await header()
  await expect(page.getByTestId('edit-panel-note')).toHaveText('Headline')
  await expect((await header()).getByRole('spinbutton', { name: 'X position' })).toHaveValue('76')

  // A shape: its fill from the same colours, and Blur in place of Outline; the header follows it.
  await page.evaluate(() => window.dazbee?.select(['badge']))
  await expect((await barMenu(page, 'effects')).locator('[data-tile="layerBlur"]')).toBeVisible()
  await (await barMenu(page, 'colour')).getByRole('button', { name: 'Roast' }).click()
  await expect.poll(async () => (await node(page, 'badge')).bindings).toMatchObject({ fill: 'brand:roast' })
  await header()
  await expect(page.getByTestId('edit-panel-note')).toHaveText('Badge')
  writeOutput('look-cards-shape.png', await page.screenshot())
  expect(errors).toEqual([])
})

test.describe('found by review', () => {
  /** Each touch as big as the control draws it off a phone, as far from the next target as it was. */
  const expectKept = (touches: Touch[], control: SwatchControl, what: string) => {
    for (const touch of touches) {
      expect(touch.pressable, `${what}: a press lands at each side`).toBe(true)
      expect(touch.width, `${what}: where a press lands, across`).toBeCloseTo(control.size, 1)
      expect(touch.height, `${what}: where a press lands, down`).toBeCloseTo(control.size, 1)
      if (control.gap !== undefined)
        expect(touch.space, `${what}: the space to the next target`).toBeCloseTo(control.gap, 1)
    }
  }

  test('on a phone every swatch-like control of the Colour, Background, Outline and Effects panels is a 44 px target 8 px from the next, in a sheet that cuts none off', async ({
    browser,
  }) => {
    const brandId = await newBrand('e2e phone swatches')
    await putKit(brandId, SWATCH_KIT)
    const screen = { width: 390, height: 844 }
    const { page, errors } = await openSized(browser, screen, { brandId })
    for (const { name, open, controls, popup } of SWATCH_PANELS) {
      const panel = await open(page)
      const sheet = await panel.boundingBox()
      if (!sheet) throw new Error(`${name} has no box`)
      for (const control of controls)
        expectTouchTargets(await swatchTouches(panel, control), `${name}, ${control.control}`, sheet)
      // The sheet scrolls to what is under its fold, and cuts nothing short across it.
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
      if (popup) {
        const shown = await paintPopup(panel)
        for (const control of popup)
          expectTouchTargets(
            await swatchTouches(shown, control),
            `${name}, its first row's paint pop-up, ${control.control}`,
            { x: 0, width: screen.width },
          )
        await page.keyboard.press('Escape')
        await expect(shown).toBeHidden()
      }
      await page.keyboard.press('Escape')
      await expect(page.locator('#edit-panel')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })

  test('at 1280×760 the swatch-like controls keep their size and the space between them', async ({ browser }) => {
    const brandId = await newBrand('e2e desktop swatches')
    await putKit(brandId, SWATCH_KIT)
    const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { brandId })
    for (const { name, open, controls, popup } of SWATCH_PANELS) {
      const panel = await open(page)
      for (const control of controls)
        expectKept(await swatchTouches(panel, control), control, `${name}, ${control.control}`)
      if (popup) {
        const shown = await paintPopup(panel)
        for (const control of popup)
          expectKept(
            await swatchTouches(shown, control),
            control,
            `${name}, its first row's paint pop-up, ${control.control}`,
          )
        await page.keyboard.press('Escape')
        await expect(shown).toBeHidden()
      }
      await page.keyboard.press('Escape')
      await expect(page.locator('#edit-panel')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
})

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: every panel with swatch-like controls, each control in view on a phone, and each row's paint pop-up`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const brandId = await newBrand('e2e swatch shots')
        await putKit(brandId, SWATCH_KIT)
        const { page, errors } = await openSized(browser, { width, height }, { theme, brandId })
        const shoot = async (name: string) => {
          await nextFrame(page)
          writeOutput(`swatches-${width}-${theme}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
        }
        for (const [i, { open, controls, popup }] of SWATCH_PANELS.entries()) {
          const panel = await open(page)
          await shoot(`${i + 1}`)
          if (width < 640) {
            // On a phone most controls are under the sheet's fold until scrolled to.
            for (const control of controls) {
              await panel.locator(control.selector).first().scrollIntoViewIfNeeded()
              await shoot(`${i + 1}-${control.id}`)
            }
          }
          if (popup) {
            const shown = await paintPopup(panel)
            await shoot(`${i + 1}-popup`)
            await page.keyboard.press('Escape')
            await expect(shown).toBeHidden()
          }
          await page.keyboard.press('Escape')
          await expect(page.locator('#edit-panel')).toHaveCount(0)
        }
        expect(errors).toEqual([])
      },
    )
  }
}
