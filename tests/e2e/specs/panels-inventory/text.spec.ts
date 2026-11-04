// The panels inventory's rows 12 to 27 (support/inventory.ts): a text's font, weight, size, colour,
// line height, letter and paragraph spacing, alignment, case, underline and strikethrough, lists,
// outline, box mode, shrink to fit and lines at most.
import { righteous } from '../../support/assets.ts'
import { designOf, reloads } from '../../support/editor.ts'
import { choose, enter } from '../../support/fields.ts'
import { importGoogleFonts } from '../../support/fonts.ts'
import { doc, props, setupInventory, step, style } from '../../support/inventory.ts'
import { perform, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, moreAction, openCard, textColourHex } from '../../support/top-bar.ts'

const row = setupInventory()

const boxOf = async (page: Page, id: string) => {
  const p = await props(page, id)
  return { width: Number(p.width), height: Number(p.height) }
}
/** Makes the headline size itself to its words, as the Text box card's tiles do. */
const autoBox = async (page: Page, mode: 'autoWidth' | 'autoHeight') => {
  await (
    await openCard(page, 'text-box-card')
  )
    .getByRole('radiogroup', { name: 'Box' })
    .locator(`[data-value="${mode}"]`)
    .click()
  await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe(mode)
}

test.describe('text', () => {
  row(12, 'font: search, Google Fonts, built in, brand fonts, upload', async (open) => {
    importGoogleFonts(['Playfair Display'])
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const family = async () => (await style(page, 'headline')).fontFamily
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page.getByTestId('font-search').fill('playf')
        await page.getByTestId('font-search').press('Enter')
      },
      async () => {
        await expect.poll(family).toBe('Playfair Display')
      },
    )
    // A family under Google Fonts picked with the mouse.
    await perform(page, 'undo')
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page
          .getByRole('listbox', { name: 'Font' })
          .getByRole('group', { name: 'Google Fonts' })
          .getByRole('option', { name: 'Playfair Display' })
          .click()
      },
      async () => {
        await expect.poll(family).toBe('Playfair Display')
      },
    )
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page.getByTestId('font-search').fill('')
        await page
          .getByRole('listbox', { name: 'Font' })
          .getByRole('group', { name: 'Built in' })
          .getByRole('option', { name: 'Noto Sans', exact: true })
          .click()
      },
      async () => {
        await expect.poll(family).toBe('Noto Sans')
      },
    )
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page
          .getByTestId('font-upload')
          .setInputFiles({ name: 'Righteous-Regular.ttf', mimeType: 'font/ttf', buffer: Buffer.from(righteous) })
      },
      async () => {
        await expect.poll(family).toBe('Righteous')
      },
    )
    await perform(page, 'undo')
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page.getByTestId('font-search').fill('')
        await page
          .getByRole('listbox', { name: 'Font' })
          .getByRole('group', { name: 'Brand fonts' })
          .getByRole('option', { name: 'Righteous' })
          .click()
      },
      async () => {
        await expect.poll(family).toBe('Righteous')
      },
    )
    await reloads(page)
  })

  row(13, 'weight', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    // The family's lightest and heaviest weights, and back to regular.
    const weight = async () => (await barMenu(page, 'font')).getByTestId('font-weight')
    const field = await weight()
    await field.click()
    const offered = await page
      .locator('[role="listbox"] [role="option"][data-value]')
      .evaluateAll((options) => options.map((o) => Number(o.getAttribute('data-value'))))
    await page.keyboard.press('Escape')
    expect(offered.length).toBeGreaterThan(2)
    // The box sizes itself to its words, so each weight gives it a width of its own.
    await autoBox(page, 'autoWidth')
    for (const to of [offered[0] ?? 400, offered.at(-1) ?? 400, 400]) {
      const was = (await boxOf(page, 'headline')).width
      await step(
        page,
        async () => choose(await weight(), String(to)),
        async () => {
          await expect.poll(async () => (await style(page, 'headline')).fontWeight).toBe(to)
          await expect.poll(async () => (await boxOf(page, 'headline')).width).not.toBe(was)
        },
      )
    }
    await reloads(page)
  })

  row(14, 'size', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const size = async () => page.getByTestId('bar-size-field')
    await step(
      page,
      async () => enter(await size(), '64'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontSize).toBe(64)
      },
    )
    await step(
      page,
      async () => enter(await size(), '90'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontSize).toBe(90)
      },
    )
    // A box that grows with its words follows the size.
    await autoBox(page, 'autoHeight')
    const tall = (await boxOf(page, 'headline')).height
    await step(
      page,
      async () => enter(await size(), '140'),
      async () => {
        await expect.poll(async () => (await boxOf(page, 'headline')).height).toBeGreaterThan(tall)
      },
    )
    await reloads(page)
  })

  row(15, 'text colour: brand colours and hex', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () =>
        (await barMenu(page, 'colour'))
          .getByRole('group', { name: 'Brand colours' })
          .getByRole('button', { name: 'Berry' })
          .click(),
      async () => {
        await expect
          .poll(async () => (await doc(page)).nodes.headline?.bindings)
          .toMatchObject({ textColor: 'brand:berry' })
      },
    )
    await step(
      page,
      async () => enter(await textColourHex(page), '1f9d55'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).color).toBe('#1F9D55FF')
      },
    )
    await reloads(page)
  })

  row(16, 'line height, and back to Auto', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const field = async () => (await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Line height' })
    await step(
      page,
      async () => enter(await field(), '1.6'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBe(1.6)
      },
    )
    await step(
      page,
      async () => enter(await field(), ''),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBeUndefined()
      },
    )
    await expect(await field()).toHaveValue('')
    await expect(await field()).toHaveAttribute('placeholder', 'Auto')
    // Leaving an emptied field does the same, once 1.4 is in the document and the field shows it.
    await enter(await field(), '1.4')
    await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBe(1.4)
    await expect(await field()).toHaveValue('1.4')
    await step(
      page,
      async () => {
        await (await field()).fill('')
        await (await field()).press('Tab')
      },
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBeUndefined()
      },
    )
    // Two texts, one at 1.6 and its copy at Auto: emptied, both are Auto.
    await enter(await field(), '1.6')
    await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBe(1.6)
    await moreAction(page, 'Duplicate')
    const copy = (await page.evaluate(() => window.dazbee?.selection() ?? []))[0] ?? ''
    await selectLayers(page, [copy], { bar: true })
    await expect(await field()).toHaveValue('1.6')
    await enter(await field(), '')
    await selectLayers(page, ['headline', copy], { bar: true })
    await expect(await field()).toHaveAttribute('placeholder', 'Mixed')
    await (await field()).press('Enter')
    expect((await style(page, 'headline')).lineHeight).toBe(1.6)
    await step(
      page,
      async () => {
        await (await field()).fill('1')
        await (await field()).fill('')
        await (await field()).press('Enter')
      },
      async () => {
        await expect
          .poll(async () => [(await style(page, 'headline')).lineHeight, (await style(page, copy)).lineHeight])
          .toEqual([undefined, undefined])
      },
    )
    await selectLayers(page, ['headline'], { bar: true })
    // A field with no unset value keeps its number when emptied.
    const before = await designOf(page)
    const spacing = async () =>
      (await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Letter spacing' })
    await enter(await spacing(), '')
    await expect(await spacing()).toHaveValue('0')
    expect(await designOf(page)).toBe(before)
    await reloads(page)
  })

  row(17, 'letter spacing', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () =>
        enter((await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Letter spacing' }), '4'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).letterSpacing).toBe(4)
      },
    )
    // A box as wide as its words widens with them.
    await autoBox(page, 'autoWidth')
    const wide = (await boxOf(page, 'headline')).width
    await step(
      page,
      async () =>
        enter((await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Letter spacing' }), '20'),
      async () => {
        await expect.poll(async () => (await boxOf(page, 'headline')).width).toBeGreaterThan(wide)
      },
    )
    await reloads(page)
  })

  row(18, 'paragraph spacing', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () =>
        enter((await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Paragraph spacing' }), '24'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).paragraphSpacing).toBe(24)
      },
    )
    await reloads(page)
  })

  row(19, 'alignment: start, centre, end, justify', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const pick = async (align: string) =>
      (await barMenu(page, 'align'))
        .getByRole('radiogroup', { name: 'Alignment', exact: true })
        .locator(`[data-value="${align}"]`)
        .click()
    // Each line is a paragraph's last, which justify leaves at the start: those two draw alike.
    for (const align of ['center', 'end', 'justify', 'start']) {
      await step(
        page,
        async () => pick(align),
        async () => {
          await expect.poll(async () => (await props(page, 'headline')).align).toBe(align)
        },
        { draws: align === 'center' || align === 'end' },
      )
    }
    await reloads(page)
  })

  row(20, 'vertical alignment: top, middle, bottom', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    // Up and down in the box is in the bar's Align, under the alignment.
    const pick = async (to: string) =>
      (await barMenu(page, 'align'))
        .getByRole('radiogroup', { name: 'Up and down in the box' })
        .locator(`[data-value="${to}"]`)
        .click()
    for (const align of ['bottom', 'middle', 'top']) {
      await step(
        page,
        async () => pick(align),
        async () => {
          await expect.poll(async () => (await props(page, 'headline')).verticalAlign).toBe(align)
        },
      )
    }
    await reloads(page)
  })

  row(21, 'case: as typed, upper, lower, title', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const pick = async (textCase: string) =>
      (await barMenu(page, 'case'))
        .getByRole('radiogroup', { name: 'Case' })
        .locator(`[data-value="${textCase}"]`)
        .click()
    for (const textCase of ['upper', 'lower', 'title', 'none']) {
      await step(
        page,
        async () => pick(textCase),
        async () => {
          await expect.poll(async () => (await style(page, 'headline')).textCase ?? 'none').toBe(textCase)
        },
      )
    }
    await reloads(page)
  })

  row(22, 'underline, strikethrough', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const toggle = async (name: string) =>
      page.getByTestId('top-bar').getByRole('button', { name, exact: true }).click()
    await step(
      page,
      async () => toggle('Underline'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).underline).toBe(true)
      },
    )
    await step(
      page,
      async () => toggle('Strikethrough'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).strikethrough).toBe(true)
      },
    )
    await reloads(page)
  })

  row(23, 'list: none, bullets, numbers', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const pick = async (list: string) =>
      (await barMenu(page, 'list')).getByRole('radiogroup', { name: 'List' }).locator(`[data-value="${list}"]`).click()
    for (const list of ['bullet', 'number', 'none']) {
      await step(
        page,
        async () => pick(list),
        async () => {
          await expect.poll(async () => (await props(page, 'headline')).list ?? 'none').toBe(list)
        },
      )
    }
    await reloads(page)
  })

  row(24, 'outline on and off, width', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const effects = () => barMenu(page, 'effects')
    await step(
      page,
      async () => (await effects()).locator('[data-tile="outline"]').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toBeTruthy()
      },
    )
    await step(
      page,
      async () => enter((await effects()).getByRole('spinbutton', { name: 'Outline width' }), '6'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toMatchObject({ width: 6 })
      },
    )
    await step(
      page,
      async () => (await effects()).locator('[data-tile="outline"]').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toBeFalsy()
      },
    )
    await reloads(page)
  })

  row(25, 'box mode: auto width, auto height, fixed', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const box = async () => (await openCard(page, 'text-box-card')).getByRole('radiogroup', { name: 'Box' })
    const size = async () => {
      const p = await props(page, 'headline')
      return [p.width, p.height]
    }
    // The lines start at the box's start and top in every mode, so the picture stays the same.
    await step(
      page,
      async () => (await box()).locator('[data-value="autoWidth"]').click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe('autoWidth')
        await expect.poll(async () => (await size())[0]).toBeLessThan(760)
      },
      { draws: false },
    )
    await step(
      page,
      async () => (await box()).locator('[data-value="autoHeight"]').click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe('autoHeight')
        await expect.poll(async () => (await size())[1]).toBeLessThan(260)
      },
      { draws: false },
    )
    const kept = await size()
    await step(
      page,
      async () => (await box()).locator('[data-value="fixed"]').click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe('fixed')
        expect(await size()).toEqual(kept)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(26, 'shrink to fit, smallest and largest size', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const card = async () => await openCard(page, 'text-fit-card')
    // The text fits its box at 72 already, so turning it on changes nothing drawn.
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Shrink to fit' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).shrinkToFit).toBeTruthy()
      },
      { draws: false },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Largest size' }), '200'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).shrinkToFit).toMatchObject({ max: 200 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Smallest size' }), '120'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).shrinkToFit).toMatchObject({ min: 120, max: 200 })
      },
    )
    await reloads(page)
  })

  row(27, 'lines at most', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => enter((await openCard(page, 'text-fit-card')).getByRole('spinbutton', { name: 'Max lines' }), '1'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).maxLines).toBe(1)
      },
    )
    await reloads(page)
  })
})
