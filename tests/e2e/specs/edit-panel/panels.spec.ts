// Every edit panel at desktop, tablet and phone size, for each kind that has it: simple choices
// first and the numbers under Advanced, last; a picture of each for review.
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { choose, enter } from '../../support/fields.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign } from '../../support/seed.ts'
import { fitSettled, nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 240_000 })

/** Each kind's panels, by the top bar item that opens them. */
const PANELS: [string, string[], string[]][] = [
  ['text', ['headline'], ['font', 'colour', 'spacing', 'effects', 'position']],
  ['shape', ['badge'], ['colour', 'outline', 'effects']],
  ['photo', ['photo'], ['edit', 'outline', 'effects']],
  ['stack', ['button'], ['colour', 'stack']],
  ['in a stack', ['label'], ['position']],
]

const solid = (color: string) => [{ type: 'solid' as const, color }]
const design = (assetId: string): DesignInput =>
  frameDesign({
    name: 'Panels',
    fills: solid('#FFF8F0FF'),
    nodes: {
      headline: {
        type: 'text',
        parentId: 'sq',
        index: 'a0',
        name: 'Headline',
        props: {
          x: 80,
          y: 60,
          width: 600,
          height: 90,
          boxMode: 'autoHeight',
          text: 'Summer sale',
          style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 800, color: '#C2106CFF' },
        },
      },
      badge: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a1',
        name: 'Badge',
        props: {
          x: 80,
          y: 220,
          width: 220,
          height: 220,
          shape: { kind: 'star', points: 5, innerRadius: 0.5 },
          fills: solid('#FFD23FFF'),
          strokes: [{ paint: { type: 'solid', color: '#15121AFF' }, width: 4, align: 'center' }],
        },
      },
      photo: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a2',
        name: 'Photo',
        props: {
          x: 380,
          y: 220,
          width: 300,
          height: 300,
          shape: { kind: 'rect', cornerRadius: 20 },
          fills: [{ type: 'image', assetId, fit: 'fill' }],
        },
      },
      button: {
        type: 'box',
        parentId: 'sq',
        index: 'a3',
        name: 'Button',
        props: {
          x: 80,
          y: 600,
          width: 360,
          height: 120,
          fills: solid('#C2106CFF'),
          cornerRadius: 60,
          layout: { direction: 'row', gap: 16, padding: { top: 24, right: 40, bottom: 24, left: 40 } },
        },
      },
      label: {
        type: 'text',
        parentId: 'button',
        index: 'a0',
        name: 'Label',
        props: {
          x: 0,
          y: 0,
          width: 200,
          height: 60,
          boxMode: 'autoWidth',
          text: 'Shop now',
          style: { fontFamily: 'Noto Sans', fontSize: 40, fontWeight: 700, color: '#FFFFFFFF' },
        },
      },
    },
  })

/** The layer's props as the document holds them. */
const propsOf = (page: Page, id: string) =>
  page.evaluate((id) => window.dazbee?.design().nodes[id]?.props, id) as Promise<Record<string, unknown>>

for (const [width, height] of SCREEN_SIZES) {
  // The panel is as wide at every size but the phone's, so CI checks it at desktop size; the other
  // sizes take the pictures for review.
  test(
    `at ${width}×${height} every panel puts its numbers under Advanced, last`,
    { tag: width === 1280 ? [] : ['@evidence'] },
    async ({ browser }) => {
      const asset = await upload(photo)
      const { page, errors } = await openStage(browser, design(asset.id))
      await page.setViewportSize({ width, height })
      await fitSettled(page)
      await page.evaluate(() => window.dazbee?.drawn())
      for (const [kind, ids, panels] of PANELS) {
        await selectLayers(page, ids, { bar: true })
        for (const id of panels) {
          const panel = await barMenu(page, id)
          const headings = await panel.locator('h3').allTextContents()
          const advanced = headings.indexOf('Advanced')
          if (advanced >= 0) expect(advanced, `${kind} ${id}: ${headings.join(', ')}`).toBe(headings.length - 1)
          // The layer's name beside the title shows whole, and every number field has room for its value.
          expect(
            await page.getByTestId('edit-panel-note').evaluate((el) => el.scrollWidth <= el.clientWidth),
            `${kind} ${id}: the name is cut`,
          ).toBe(true)
          const squeezed = await panel
            .locator('input[role="spinbutton"]')
            .evaluateAll((els) =>
              els
                .filter((el) => el.checkVisibility() && el.scrollWidth > el.clientWidth)
                .map((el) => el.getAttribute('aria-label')),
            )
          expect(squeezed, `${kind} ${id}: values with no room`).toEqual([])
          await nextFrame(page)
          writeOutput(
            `panel-${width}-${kind.replaceAll(' ', '-')}-${id}.png`,
            await page.screenshot({ animations: 'disabled' }),
          )
          await page.keyboard.press('Escape')
          await expect(page.getByTestId(`bar-${id}-menu`)).toBeHidden()
        }
      }
      expect(errors).toEqual([])
    },
  )
}

test.describe('found by QA', () => {
  test('number fields stop at limits a design never needs to pass', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    // An effect's numbers, and where a layer is.
    await selectLayers(page, ['badge'], { bar: true })
    const effects = await barMenu(page, 'effects')
    await effects.locator('[data-tile="dropShadow"]').click()
    await enter(effects.getByRole('spinbutton', { name: 'Drop shadow 1 Blur' }), '99999')
    await enter(effects.getByRole('spinbutton', { name: 'Drop shadow 1 X' }), '-99999')
    await expect
      .poll(async () => ((await propsOf(page, 'badge')).effects as { blur: number; x: number }[])[0])
      .toMatchObject({ blur: 1000, x: -10000 })
    await enter((await barMenu(page, 'position')).getByRole('spinbutton', { name: 'X position' }), '1e12')
    await expect.poll(async () => (await propsOf(page, 'badge')).x).toBe(100000)
    // Stepped past it with the arrow keys, once the field shows it, it stays.
    const x = (await barMenu(page, 'position')).getByRole('spinbutton', { name: 'X position' })
    await expect(x).toHaveValue('100000')
    await x.focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Shift+ArrowUp')
    await expect.poll(async () => (await propsOf(page, 'badge')).x).toBe(100000)
    // With Lock ratio on, the side that follows stops at it too.
    const position = await barMenu(page, 'position')
    await position.getByRole('switch', { name: 'Lock ratio' }).click()
    await enter(position.getByRole('spinbutton', { name: 'Height' }), '50000')
    await expect.poll(async () => (await propsOf(page, 'badge')).width).toBeLessThanOrEqual(100000)
    // Text's spacing and size, last, since text this large takes a while to draw.
    await selectLayers(page, ['headline'], { bar: true })
    const spacing = await barMenu(page, 'spacing')
    await enter(spacing.getByRole('spinbutton', { name: 'Line height' }), '99999')
    await enter(spacing.getByRole('spinbutton', { name: 'Letter spacing' }), '100000')
    await enter(spacing.getByRole('spinbutton', { name: 'Paragraph spacing' }), '1e9')
    await expect
      .poll(async () => {
        const p = await propsOf(page, 'headline')
        const style = p.style as { lineHeight: number; letterSpacing: number }
        return [style.lineHeight, style.letterSpacing, p.paragraphSpacing]
      })
      .toEqual([10, 1000, 1000])
    await enter(page.getByTestId('bar-size-field'), '99999')
    await expect.poll(async () => ((await propsOf(page, 'headline')).style as { fontSize: number }).fontSize).toBe(2000)
    expect(errors).toEqual([])
  })

  test('Ctrl+Z and Ctrl+Shift+Z in a number field not being typed in undo and redo the design', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['headline'], { bar: true })
    const field = (await barMenu(page, 'spacing')).getByRole('spinbutton', { name: 'Paragraph spacing' })
    const spacing = async () => (await propsOf(page, 'headline')).paragraphSpacing ?? 0
    await field.focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect.poll(spacing).toBe(2)
    await page.keyboard.press('Control+z')
    await expect.poll(spacing).toBe(1)
    await expect(field).toHaveValue('1')
    await expect(field).toBeFocused()
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(spacing).toBe(2)
    await expect(field).toBeFocused()
    await page.keyboard.press('Control+y')
    await expect.poll(spacing).toBe(2)
    // The top bar's size field undoes the design too.
    const size = page.getByTestId('bar-size-field')
    await size.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(async () => ((await propsOf(page, 'headline')).style as { fontSize: number }).fontSize).toBe(65)
    await page.keyboard.press('Control+z')
    await expect.poll(async () => ((await propsOf(page, 'headline')).style as { fontSize: number }).fontSize).toBe(64)
    await field.focus()
    // While a value is being typed, Ctrl+Z is the field's own: it takes back what was typed.
    await field.fill('40')
    await page.keyboard.press('Control+z')
    await expect.poll(spacing).toBe(2)
    expect(errors).toEqual([])
  })

  test("the Colour panel's + edits the fill that shows, gradient or not, and never stacks a new one", async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['badge'], { bar: true })
    const panel = await barMenu(page, 'colour')
    await panel.getByTestId('colour-pick').click()
    const picker = panel.getByTestId('colour-picker')
    await picker.getByRole('radio', { name: 'Circle gradient' }).click()
    await expect
      .poll(async () => ((await propsOf(page, 'badge')).fills as { type: string }[]).map((f) => f.type))
      .toEqual(['radial'])
    await expect(picker.getByRole('radio', { name: 'Circle gradient' })).toHaveAttribute('aria-checked', 'true')
    await expect(picker.getByTestId('gradient-bar')).toBeVisible()
    await picker.getByRole('radio', { name: 'Line gradient' }).click()
    await expect
      .poll(async () => ((await propsOf(page, 'badge')).fills as { type: string }[]).map((f) => f.type))
      .toEqual(['linear'])
    expect(errors).toEqual([])
  })

  test('a panel whose item leaves the top bar closes: Colour, once a shape becomes a photo', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['badge'], { bar: true })
    await barMenu(page, 'colour')
    await page.evaluate(
      (assetId) =>
        window.dazbee?.session.run('node.update', {
          ids: ['badge'],
          patch: { fills: [{ type: 'image', assetId, fit: 'fill' }] },
        }),
      asset.id,
    )
    await expect(page.getByTestId('bar-edit')).toBeVisible()
    await expect(page.locator('#edit-panel')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('a layer in a stack has no Line up with the frame: the stack places it', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['label'], { bar: true })
    const panel = await barMenu(page, 'position')
    await expect(panel.getByTestId('arrange-part').getByRole('heading')).toHaveText(['Arrange'])
    expect(errors).toEqual([])
  })

  test("text's outline under Advanced has its own remove button, and a width below the least keeps it on", async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['headline'], { bar: true })
    const panel = await barMenu(page, 'effects')
    await panel.locator('[data-tile="outline"]').click()
    const outline = async () => ((await propsOf(page, 'headline')).style as { outline?: { width: number } }).outline
    await expect.poll(outline).toMatchObject({ width: 2 })
    await enter(panel.getByRole('spinbutton', { name: 'Outline width' }), '-3')
    await expect.poll(outline).toMatchObject({ width: 0.5 })
    await expect(panel.getByRole('spinbutton', { name: 'Outline width' })).toBeVisible()
    await panel.getByRole('button', { name: /^Remove outline/ }).click()
    await expect.poll(outline).toBeUndefined()
    expect(errors).toEqual([])
  })

  test('the Font panel stays open for a pick, and Esc closes its weight list first', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['headline'], { bar: true })
    const panel = await barMenu(page, 'font')
    await panel.getByTestId('font-weight').click()
    const weights = page.getByRole('listbox', { name: 'Weight' })
    await expect(weights).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(weights).toHaveCount(0)
    await expect(panel).toBeVisible()
    await panel.getByRole('option', { name: 'Noto Sans Devanagari' }).click()
    await expect
      .poll(async () => ((await propsOf(page, 'headline')).style as { fontFamily: string }).fontFamily)
      .toBe('Noto Sans Devanagari')
    await expect(panel).toBeVisible()
    expect(errors).toEqual([])
  })

  test('emptying Max lines lifts the limit', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['headline'], { bar: true })
    const field = (await barMenu(page, 'spacing')).getByRole('spinbutton', { name: 'Max lines' })
    await enter(field, '3')
    await expect.poll(async () => (await propsOf(page, 'headline')).maxLines).toBe(3)
    // Emptied once the field shows the limit it has.
    await expect(field).toHaveValue('3')
    await enter(field, '')
    await expect.poll(async () => (await propsOf(page, 'headline')).maxLines).toBeUndefined()
    expect(errors).toEqual([])
  })

  test('two effects of a type each have colour fields of their own name', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['badge'], { bar: true })
    const panel = await barMenu(page, 'effects')
    await panel.locator('[data-tile="dropShadow"]').click()
    await choose(panel.getByRole('combobox', { name: 'Add another' }), 'dropShadow')
    await expect(panel.getByRole('textbox', { name: 'Drop shadow 1 hex' })).toHaveCount(1)
    await expect(panel.getByRole('textbox', { name: 'Drop shadow 2 hex' })).toHaveCount(1)
    expect(errors).toEqual([])
  })
  test("a locked layer's top bar is only Locked, Unlock and its ⋯, and Unlock brings its settings back in one undo step", async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await page.evaluate(() => window.dazbee?.setLocked(['badge'], true))
    await selectLayers(page, ['badge'], { bar: true })
    // Locked and Unlock, then the ⋯ with Order, which no lock refuses.
    const items = page.getByTestId('top-bar').locator('[data-item]')
    await expect(items).toHaveCount(2)
    await expect(page.getByTestId('bar-locked')).toContainText('Locked')
    await expect(page.getByTestId('bar-arrange')).toBeVisible()
    await expect(page.getByTestId('bar-effects')).toHaveCount(0)
    await expect(page.getByTestId('bar-position')).toHaveCount(0)
    writeOutput('locked-bar.png', await page.screenshot({ animations: 'disabled' }))
    await page.getByTestId('bar-unlock').click()
    await expect
      .poll(() => page.evaluate(() => Object.values(window.dazbee?.design().nodes.badge?.lock ?? {}).some(Boolean)))
      .toBe(false)
    await expect(page.getByTestId('bar-effects')).toBeVisible()
    await page.evaluate(() => window.dazbee?.perform('undo'))
    await expect(page.getByTestId('bar-locked')).toBeVisible()
    await expect(page.getByTestId('bar-effects')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test.describe('found by Keshav', () => {
  test("a pop-up opened by a click puts no number field in focus: the Shape pop-up's corners", async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await page.evaluate(() =>
      window.dazbee?.session.run('node.update', {
        ids: ['badge'],
        patch: { shape: { kind: 'rect', cornerRadius: 12 } },
      }),
    )
    await selectLayers(page, ['badge'], { bar: true })
    const popup = await barMenu(page, 'shape')
    await expect(popup.getByRole('spinbutton').first()).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT')
    // The focus is in the pop-up, so Tab goes on to its controls and Esc closes it.
    expect(await popup.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('spinbutton')
    expect(errors).toEqual([])
  })

  test('a number field reached by the keyboard shows its focus on its own border, with no second ring round its value', async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await selectLayers(page, ['headline'], { bar: true })
    const field = (await barMenu(page, 'spacing')).getByRole('spinbutton', { name: 'Line height' })
    await field.focus()
    await page.keyboard.press('ArrowUp')
    expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
    expect(errors).toEqual([])
  })
})
