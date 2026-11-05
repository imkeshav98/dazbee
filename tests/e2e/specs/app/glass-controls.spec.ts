// Controls on glass in Chromium, in dark and light: buttons and rows take the hover tint under the
// pointer and the pressed tint while pressed, by mouse or by touch, laid over a card's own fill where
// it has one; a toggle that is on, and a tag, read in the text colour on their pink tint; the account
// menu's and the colour pop-up's choices sit in a well; a delete is confirmed on a solid red button in
// white, and a red row reads in the text colour while lit.
import { photo, upload } from '../../support/assets.ts'
import { shoot } from '../../support/editor.ts'
import { hovered, laid, look, openDesignIn, openIn, pressed, THEMES } from '../../support/glass.ts'
import { API_URL, DEV_BRAND, liveDesign, seed } from '../../support/seed.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { barMenu, closeBarMenu, fillList, moreMenu, pagesPanel, textStyleToggle } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const PHONE = { width: 390, height: 844 }

/**
 * Opens the account menu, and reads which theme its Theme choice shows as chosen once the menu is
 * first in the page, before anything set after it could slide into place.
 */
const openAccount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const drawn = new MutationObserver(() => {
          const chosen = document.querySelector('[data-testid="account"] [aria-label="Theme"] [aria-checked="true"]')
          if (!chosen) return
          drawn.disconnect()
          resolve(chosen.textContent)
        })
        drawn.observe(document.body, { childList: true, subtree: true })
        document.querySelector<HTMLElement>('[data-testid="account-open"]')?.click()
      }),
  )

/**
 * Counts the elements a press marks pressed (`data-pressed`) while `act` runs, and for a while after:
 * longer than a press is held before it is marked, and than a tap's mark lasts.
 */
async function marksDuring(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const root = document.documentElement
    root.dataset.marks = '0'
    new MutationObserver((records) => {
      const marked = records.filter((record) => record.oldValue === null).length
      root.dataset.marks = String(Number(root.dataset.marks) + marked)
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-pressed'],
      attributeOldValue: true,
      subtree: true,
    })
  })
  await act()
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => setTimeout(() => resolve(Number(document.documentElement.dataset.marks)), 400)),
  )
}

/** Puts a finger down on a control and holds it there, as on a phone, until it is lifted: a tap. */
async function hold(page: Page, control: Locator) {
  const { finger, at } = await fingerOn(page, control)
  await finger.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
  return { lift: () => finger.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
}

/** Puts a finger down on a control and at once slides it 40px up the screen, as a scroll starts, then lifts it. */
async function swipe(page: Page, control: Locator) {
  const { finger, at } = await fingerOn(page, control)
  const touch = (type: 'touchStart' | 'touchMove', up: number) =>
    finger.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x: at.x, y: at.y - up }] })
  // Sent together, so the finger has moved before a press held still would be marked.
  await Promise.all([touch('touchStart', 0), touch('touchMove', 20), touch('touchMove', 40)])
  await finger.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** A finger for the page, and the middle of a control on screen, where it goes down. */
async function fingerOn(page: Page, control: Locator) {
  const box = await control.boundingBox()
  if (!box) throw new Error('the control to touch is not on screen')
  const finger = await page.context().newCDPSession(page)
  return { finger, at: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
}

test('a toggle that is on reads in the text colour on its pink tint; an open top bar button takes the pressed tint while pressed', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openDesignIn(browser, designId, theme)
    await selectLayers(page, ['headline'], { bar: true })
    const bold = await textStyleToggle(page, 'bold')
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    await page.mouse.move(2, 2)
    await expect.poll(async () => look(bold)).toMatchObject({ fill: glass.accentSoft, colour: glass.text })
    // The Text style button behind it, with a style on, takes the same pink tint.
    await page.keyboard.press('Escape')
    await page.mouse.move(2, 2)
    await expect
      .poll(async () => look(page.getByTestId('bar-text-style')))
      .toMatchObject({ fill: glass.accentSoft, colour: glass.text })
    // Open, then pressed again: the press ends in a click that closes it.
    for (const [id, open] of [
      ['bar-align', () => barMenu(page, 'align')],
      ['bar-more', () => moreMenu(page)],
    ] as const) {
      await open()
      const button = page.getByTestId(id)
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await pressed(page, button, { fill: glass.pressed })
    }
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('the account menu’s language and theme, and the colour pop-up’s kinds of paint, are choices in a well; the pop-up sits clear of the Colour panel', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openDesignIn(browser, designId, theme)
    const well = { fill: glass.well, border: '0px' }
    const chosen = { fill: glass.chip, colour: glass.text }
    // The theme in use is the chosen one as the menu is first drawn, so no choice slides into place.
    expect(await openAccount(page)).toBe(theme === 'dark' ? 'Dark' : 'Light')
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
    // The pop-up opens beside the panel, a gap from its edge, not over it.
    const panel = await page.getByTestId('bar-colour-menu').boundingBox()
    const popUp = page.getByTestId('paint-editor').locator('..')
    await expect
      .poll(async () => {
        const box = await popUp.boundingBox()
        return box && panel ? panel.x - (box.x + box.width) : null
      })
      .toBeGreaterThanOrEqual(8)
    await shoot(page, `glass-${theme}-paint`)
    await page.keyboard.press('Escape')
    await closeBarMenu(page, 'bar-colour')

    // A theme picked in the menu is the chosen one when the menu opens again.
    const other = theme === 'dark' ? 'Light' : 'Dark'
    await openAccount(page)
    await account.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: other }).click()
    await page.keyboard.press('Escape')
    await expect(account).toBeHidden()
    expect(await openAccount(page)).toBe(other)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('glass buttons and rows take the hover tint and, while pressed, the pressed tint, laid over a card’s own fill', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openDesignIn(browser, designId, theme)
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

    // The Brand flyout's Edit.
    await page.getByRole('button', { name: 'Brand', exact: true }).click()
    const edit = page.getByTestId('flyout').getByRole('button', { name: 'Edit', exact: true })
    await hovered(edit, { fill: glass.hover, colour: glass.text })
    await pressed(page, edit, { fill: glass.pressed })
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('on a phone, a glass button and a card’s row show the pressed tint while a finger is held on them, and not when it starts a scroll', async ({
  browser,
}) => {
  const designId = await seed(liveDesign())
  for (const theme of THEMES) {
    const { page, errors, glass } = await openDesignIn(browser, designId, theme, {
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
    })
    const card = await pagesPanel(page)
    const row = card.locator('[data-page]').first()
    // A page's row, lit while the finger on its button is held, then Add page.
    for (const [name, control, lit] of [
      ['row', row.getByRole('button').first(), row],
      ['add', card.getByTestId('add-page'), card.getByTestId('add-page')],
    ] as const) {
      const finger = await hold(page, control)
      await expect.poll(async () => (await look(lit)).image).toBe(laid(glass.pressed))
      await shoot(page, `glass-${theme}-phone-held-${name}`)
      await finger.lift()
      await expect.poll(async () => (await look(lit)).image).toBe('none')
    }
    // A finger that slides away at once is scrolling: nothing it went down on is marked pressed.
    expect(await marksDuring(page, () => swipe(page, row.getByRole('button').first()))).toBe(0)
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
    const { page, errors, glass } = await openIn(browser, `/brands/${DEV_BRAND}/designs`, theme)
    const tile = page.locator(`[data-design="${designId}"]`)
    await tile.hover()
    await tile.getByRole('button', { name: `More for ${name}` }).click()
    const remove = tile.getByRole('menuitem', { name: 'Delete' })
    await hovered(remove, { fill: glass.hover, colour: glass.text })
    await remove.click()
    const confirm = tile.getByRole('button', { name: 'Delete', exact: true })
    await expect(confirm).toBeVisible()
    // Its picture shows it at rest, with the pointer off it, and the page at its top: Playwright
    // scrolls a control to the top of the window when it retries a pointer action on it.
    await page.mouse.move(2, 2)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(async () => look(confirm)).toMatchObject({ fill: glass.dangerSolid, colour: glass.onAccent })
    await shoot(page, `glass-${theme}-design-delete`)
    await hovered(confirm, { fill: glass.dangerSolidHover, colour: glass.onAccent })
    const cancel = tile.getByRole('button', { name: 'Cancel' })
    await hovered(cancel, { fill: glass.hover, colour: glass.text })
    await pressed(page, cancel, { fill: glass.pressed, colour: glass.text })
    await expect(confirm).toHaveCount(0)
    expect(errors).toEqual([])
    await page.context().close()
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
    const { page, errors, glass } = await openDesignIn(browser, designId, theme)
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
    // It takes the place of Delete, under the pointer, which moves off it to see it, and take its
    // picture, at rest.
    await page.mouse.move(2, 2)
    await expect.poll(async () => look(confirm)).toMatchObject({ fill: glass.dangerSolid, colour: glass.onAccent })
    await shoot(page, `glass-${theme}-asset-delete`)
    await hovered(confirm, { fill: glass.dangerSolidHover, colour: glass.onAccent })
    await pressed(page, details.getByRole('button', { name: 'Keep' }), { fill: glass.pressed })
    await expect(confirm).toHaveCount(0)
    expect(errors).toEqual([])
    await page.context().close()
  }
})
