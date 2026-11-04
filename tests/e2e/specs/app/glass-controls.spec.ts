// Controls on glass in Chromium, in dark and light: buttons and rows take the hover tint under the
// pointer and the pressed tint while pressed, by mouse or by touch, laid over a card's own fill where
// it has one; a toggle that is on, and a tag, read in the text colour on their pink tint; the account
// menu's and the colour pop-up's choices sit in a well; a delete is confirmed on a solid red button in
// white, and a red row reads in the text colour while lit.
import { photo, upload } from '../../support/assets.ts'
import { setCookies, shoot } from '../../support/editor.ts'
import { hovered, laid, look, openIn, pressed, pressedFill, servedGlass, THEMES } from '../../support/glass.ts'
import { API_URL, DEV_BRAND, liveDesign, seed } from '../../support/seed.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu, fillList, moreMenu, pagesPanel, sizesPanel } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

test('a toggle that is on reads in the text colour on its pink tint; an open top bar button takes the pressed tint while pressed', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await selectLayers(page, ['headline'], { bar: true })
    const bold = page.getByTestId('bar-bold')
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    await page.mouse.move(2, 2)
    await expect.poll(async () => look(bold)).toMatchObject({ fill: glass.accentSoft, colour: glass.text })
    // Open, then pressed again: the press ends in a click that closes it.
    for (const [id, open] of [
      ['bar-align', () => barMenu(page, 'align')],
      ['bar-more', () => moreMenu(page)],
    ] as const) {
      await open()
      const button = page.getByTestId(id)
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await pressedFill(page, button, glass.pressed)
    }
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('the account menu’s language and theme, and the colour pop-up’s kinds of paint, are choices in a well', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    const well = { fill: glass.well, border: '0px' }
    const chosen = { fill: glass.chip, colour: glass.text }
    await page.getByTestId('account-open').click()
    const account = page.getByTestId('account')
    for (const name of ['Language', 'Theme']) {
      const choices = account.getByRole('radiogroup', { name })
      expect(await look(choices)).toMatchObject(well)
      expect(await look(choices.getByRole('radio', { checked: true }))).toMatchObject(chosen)
    }
    await shoot(page, `glass-${theme}-account`)
    await page.keyboard.press('Escape')
    await expect(account).toBeHidden()

    await selectLayers(page, ['box'], { bar: true })
    await (await fillList(page)).locator('[data-row="1"]').getByTestId('paint-swatch').click()
    const kinds = page.getByTestId('paint-editor').getByRole('radiogroup', { name: 'Kind of paint' })
    expect(await look(kinds)).toMatchObject(well)
    expect(await look(kinds.getByRole('radio', { checked: true }))).toMatchObject(chosen)
    await shoot(page, `glass-${theme}-paint`)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('glass buttons and rows take the hover tint and, while pressed, the pressed tint, laid over a card’s own fill', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    // The Pages card's rows and Add page keep their fill, with the tint laid over it.
    const card = await pagesPanel(page)
    const row = card.locator('[data-page]').first()
    const add = card.getByTestId('add-page')
    for (const control of [row, add]) await hovered(control, { image: laid(glass.hover) })
    await pressed(page, row.getByRole('button').first(), { image: laid(glass.pressed) }, row)
    await pressed(page, add, { image: laid(glass.pressed) })
    // Deleting the page just added brings up the toast whose Undo puts it back.
    await card
      .locator('[data-page]')
      .last()
      .getByRole('button', { name: /^More for / })
      .click()
    await page.getByRole('button', { name: 'Delete page' }).click()
    const undo = page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' })
    await hovered(undo, { fill: glass.hover, colour: glass.text })
    await pressed(page, undo, { fill: glass.pressed, colour: glass.text })
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()

    // The Sizes card's chips.
    const chip = (await sizesPanel(page)).locator('button[data-preset]:visible').first()
    await hovered(chip, { fill: glass.hover })
    await pressedFill(page, chip, glass.pressed)
    await page.keyboard.press('Escape')

    // The Brand flyout's Edit.
    await page.getByRole('button', { name: 'Brand', exact: true }).click()
    const edit = page.getByTestId('flyout').getByRole('button', { name: 'Edit', exact: true })
    await hovered(edit, { fill: glass.hover, colour: glass.text })
    await pressedFill(page, edit, glass.pressed)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('on touch, a press on a glass button shows the pressed tint', async ({ browser }) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme, undefined, { hasTouch: true })
    const add = (await pagesPanel(page)).getByTestId('add-page')
    const box = await add.boundingBox()
    if (!box) throw new Error('missing Add page')
    // A finger held on it for a while, through the browser's own gesture handling, as a phone's is.
    const touch = await page.context().newCDPSession(page)
    const held = touch.send('Input.synthesizeTapGesture', {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      duration: 3000,
      gestureSourceType: 'touch',
    })
    await expect.poll(async () => (await look(add)).image, { timeout: 2500 }).toBe(laid(glass.pressed))
    await held
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('a design’s delete is confirmed on a solid red button in white; its red menu row and Cancel are lit by the tints', async ({
  browser,
}) => {
  const name = `Glass delete ${crypto.randomUUID().slice(0, 6)}`
  const designId = await seed({ ...liveDesign(), meta: { ...liveDesign().meta, name } })
  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await setCookies(page, { theme })
    await page.goto(`/brands/${DEV_BRAND}/designs`)
    const glass = await servedGlass(page)
    const tile = page.locator(`[data-design="${designId}"]`)
    await tile.hover()
    await tile.getByRole('button', { name: `More for ${name}` }).click()
    const remove = tile.getByRole('menuitem', { name: 'Delete' })
    await hovered(remove, { fill: glass.hover, colour: glass.text })
    await remove.click()
    const confirm = tile.getByRole('button', { name: 'Delete', exact: true })
    await expect(confirm).toBeVisible()
    expect(await look(confirm)).toMatchObject({ fill: glass.dangerSolid, colour: glass.onAccent })
    await hovered(confirm, { fill: glass.dangerSolidHover, colour: glass.onAccent })
    await shoot(page, `glass-${theme}-design-delete`)
    const cancel = tile.getByRole('button', { name: 'Cancel' })
    await hovered(cancel, { fill: glass.hover, colour: glass.text })
    await pressed(page, cancel, { fill: glass.pressed, colour: glass.text })
    await expect(confirm).toHaveCount(0)
    expect(errors).toEqual([])
    await context.close()
  }
})

test('asset details on glass: a tag reads in the text colour on its pink tint, and Delete asks on a solid red button', async ({
  browser,
}) => {
  const run = crypto.randomUUID().slice(0, 8)
  const asset = await upload(new Uint8Array(Buffer.concat([Buffer.from(photo), Buffer.from(`glass-${run}`)])))
  const name = `Glass ${run}`
  const tag = `tag-${run}`
  const named = await fetch(`${API_URL}/brands/${DEV_BRAND}/assets/${asset.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, tags: [tag] }),
  })
  expect(named.ok).toBe(true)
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openIn(browser, designId, theme)
    await page.locator('[data-panel="assets"]').click()
    const library = page.getByTestId('asset-library')
    await library.getByRole('searchbox', { name: 'Search by name or tag' }).fill(name)
    const tile = library.locator(`li[data-asset="${asset.id}"]`)
    await tile.hover()
    await tile.getByRole('button', { name: /Name and tags/ }).click()
    const details = page.getByTestId('asset-details')
    expect(await look(details.getByRole('listitem').filter({ hasText: tag }))).toMatchObject({
      fill: glass.accentSoft,
      colour: glass.text,
    })
    const remove = details.getByTestId('asset-delete')
    await hovered(remove, { fill: glass.hover, colour: glass.text })
    await remove.click()
    const confirm = details.getByTestId('asset-delete-confirm')
    await expect(confirm).toBeVisible()
    // It takes the place of Delete, under the pointer, which moves off it to see it at rest.
    await page.mouse.move(2, 2)
    await expect.poll(async () => look(confirm)).toMatchObject({ fill: glass.dangerSolid, colour: glass.onAccent })
    await hovered(confirm, { fill: glass.dangerSolidHover, colour: glass.onAccent })
    await shoot(page, `glass-${theme}-asset-delete`)
    await pressedFill(page, details.getByRole('button', { name: 'Keep' }), glass.pressed)
    await expect(confirm).toHaveCount(0)
    expect(errors).toEqual([])
    await page.context().close()
  }
})
