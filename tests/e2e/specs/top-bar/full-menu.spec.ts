// The full menu (the small menu's ⋯) and the right-click menu in Chromium: their rows in order,
// the focus as they open and close, Text only for text layers; Copy ▸ and Paste ▸ with the layers or
// their style, and paste across frames and pages; and the menus at the three screen sizes.
import { layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { closeMenus, expectGreyed, fillOf, holders, node, open, redo, rowsOf, undo } from '../../support/linked-menu.ts'
import { GREEN, INK, PINK } from '../../support/linked-menu-design.ts'
import { copyIn } from '../../support/seed.ts'
import { fitSettled, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { moreAction, moreMenu, moreSubmenu, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

/** The full menu's own rows, in their order; the top bar's ⋯ takes the rest. */
const ROWS = [
  'Copy',
  'Paste',
  'Duplicate',
  'Copy to other frames',
  'Put in a box',
  'Use as mask',
  'Lock in all frames',
  'Hide in all frames',
  'Delete from all frames',
]

/** The words of the row that has the focus, without its key. */
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.firstChild?.textContent?.trim() ?? '')

/** A box on screen, as the browser measures it. */
type Box = { left: number; top: number; right: number; bottom: number }
/** Where an element is on screen. */
const boxOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
/** How much of `a` lies in `b`, in square pixels. */
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
/** How much of a tooltip covers the full menu where the menu beside its row doesn't lie over it, in square pixels. */
function coversMenu(tip: Box, menu: Box, beside: Box) {
  const inMenu: Box = {
    left: Math.max(tip.left, menu.left),
    top: Math.max(tip.top, menu.top),
    right: Math.min(tip.right, menu.right),
    bottom: Math.min(tip.bottom, menu.bottom),
  }
  if (inMenu.right <= inMenu.left || inMenu.bottom <= inMenu.top) return 0
  return overlap(inMenu, inMenu) - overlap(inMenu, beside)
}

test.describe('the full menu', () => {
  test('opens with the focus on its first item, lists its rows in order, and gives the focus back to ⋯', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['headline'])
    await page.getByTestId('bar-more').focus()
    await page.keyboard.press('Enter')
    const menu = page.getByTestId('bar-more-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    expect((await rowsOf(menu)).filter((row) => ROWS.includes(row))).toEqual(ROWS)
    // The submenu opens by the arrow with the focus on its first row, and closes back to its row.
    await page.keyboard.press('ArrowRight')
    const copy = page.getByTestId('more-copy-menu')
    await expect(copy).toBeVisible()
    await expect(copy.getByRole('button').first()).toBeFocused()
    await expect(copy.getByRole('button')).toHaveText([/^Copy\s*Ctrl\+C/, /^Copy style\s*Ctrl\+Alt\+C/])
    await page.keyboard.press('ArrowLeft')
    await expect(copy).toBeHidden()
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByTestId('bar-more')).toBeFocused()

    // A right-click on the layer shows the same rows.
    await selectLayers(page, [])
    const box = await page.evaluate(() => window.dazbee?.boxOf('badge'))
    const at = await page.evaluate((b) => window.dazbee?.screenPoint((b?.x ?? 0) + 100, (b?.y ?? 0) + 100), box)
    await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
    const right = page.getByTestId('stage-menu')
    await expect(right).toBeVisible()
    expect((await rowsOf(right)).filter((row) => ROWS.includes(row))).toEqual(ROWS)
    expect(errors).toEqual([])
  })

  test('moves the focus through its rows by the arrows, round from the ends, with Home and End, in the menus beside them too', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    await page.getByTestId('bar-more').focus()
    await page.keyboard.press('Enter')
    const menu = page.getByTestId('bar-more-menu')
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    for (const [key, row] of [
      ['ArrowDown', 'Paste'],
      ['ArrowDown', 'Duplicate'],
      ['ArrowUp', 'Paste'],
      ['End', 'Delete from all frames'],
      ['ArrowDown', 'Copy'],
      ['ArrowUp', 'Delete from all frames'],
      ['Home', 'Copy'],
    ] as const) {
      await page.keyboard.press(key)
      await expect.poll(() => focusedRow(page), key).toBe(row)
    }
    // Beside a row: the arrow towards it opens the menu, the arrows move through it, the arrow back closes it.
    await page.keyboard.press('ArrowRight')
    const copy = page.getByTestId('more-copy-menu')
    await expect(copy.getByRole('button').first()).toBeFocused()
    for (const [key, row] of [
      ['ArrowDown', 'Copy style'],
      ['ArrowDown', 'Copy'],
      ['ArrowUp', 'Copy style'],
      ['Home', 'Copy'],
      ['End', 'Copy style'],
    ] as const) {
      await page.keyboard.press(key)
      await expect.poll(() => focusedRow(page), key).toBe(row)
    }
    await page.keyboard.press('ArrowLeft')
    await expect(copy).toBeHidden()
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    // The right-click menu, the same way.
    await selectLayers(page, [])
    const at = await page.evaluate(() => {
      const box = window.dazbee?.boxOf('badge')
      return window.dazbee?.screenPoint((box?.x ?? 0) + 100, (box?.y ?? 0) + 100, 'sq')
    })
    await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
    const right = page.getByTestId('stage-menu')
    await expect(right.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusedRow(page)).toBe('Paste')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => focusedRow(page)).toBe('Delete from all frames')
    expect(errors).toEqual([])
  })

  test('sets Duplicate apart from Copy to other frames with a divider, as the mock does', async ({ browser }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    const menu = await moreMenu(page)
    // A divider is a line, not a row: no button, with a top border.
    const around = await menu.locator('[data-action="duplicate"]').evaluate((row) => {
      const next = row.nextElementSibling
      return [
        next?.tagName === 'DIV' && getComputedStyle(next).borderTopWidth !== '0px',
        next?.nextElementSibling?.getAttribute('data-testid'),
      ]
    })
    expect(around).toEqual([true, 'more-copy-to-frames'])
    expect(errors).toEqual([])
  })

  test('shows Ungroup after Put in a box for a group or a box, hidden for any other selection; it takes what they hold out in their frame', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    for (const [ids, shown] of [
      [['logo'], true],
      [['card'], true],
      [['logo', 'card'], true],
      [['badge'], false],
      [['shapes'], false],
      [['headline'], false],
      [['logo', 'badge'], false],
    ] as const) {
      await selectLayers(page, [...ids])
      const rows = await rowsOf(await moreMenu(page))
      const box = rows.indexOf('Put in a box')
      if (shown) expect(rows.slice(box, box + 2), ids.join(' ')).toEqual(['Put in a box', 'Ungroup'])
      else expect(rows, ids.join(' ')).not.toContain('Ungroup')
      await closeMenus(page)
    }
    await selectLayers(page, ['logo'])
    await moreAction(page, 'Ungroup')
    await expect.poll(async () => (await node(page, 'mark'))?.parentId).toBe('sq')
    expect(await node(page, 'logo')).toBeNull()
    expect(await node(page, copyIn('story', 'logo'))).not.toBeNull()
    await undo(page)
    await expect.poll(async () => (await node(page, 'mark'))?.parentId).toBe('logo')

    // A box, from the right-click menu, by a press on its own fill.
    await selectLayers(page, [])
    const at = await page.evaluate(() => window.dazbee?.screenPoint(90, 885, 'sq'))
    await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
    const right = page.getByTestId('stage-menu')
    await expect(right).toBeVisible()
    expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['card'])
    await moreAction(page, 'Ungroup', right)
    await expect.poll(async () => (await node(page, 'cta'))?.parentId).toBe('sq')
    expect((await node(page, 'cta'))?.props).toMatchObject({ x: 140, y: 910 })
    await undo(page)
    await expect.poll(async () => (await node(page, 'cta'))?.parentId).toBe('card')
    expect(errors).toEqual([])
  })

  test('Release mask frees what a mask is over, and greys like every other row while the mask’s style is locked', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    await moreAction(page, 'Use as mask')
    await selectLayers(page, ['logo'])
    await page.evaluate(() => window.dazbee?.session.run('node.lock', { ids: ['badge'], lock: { style: true } }))
    const menu = await moreMenu(page)
    const release = menu.getByRole('button', { name: /^Release mask/ })
    expect(await release.evaluate((row) => (row as HTMLButtonElement).disabled)).toBe(false)
    await expectGreyed(page, menu, 'Release mask', 'The mask’s style is locked')
    await closeMenus(page)
    await page.evaluate(() => window.dazbee?.session.run('node.lock', { ids: ['badge'], lock: { style: false } }))
    await moreAction(page, 'Release mask')
    await expect.poll(async () => (await node(page, 'badge'))?.props.mask).toBeFalsy()
    expect(errors).toEqual([])
  })

  test('shows Text only for text layers, for every layer type and several', async ({ browser }) => {
    const { page, errors } = await open(browser)
    for (const [ids, text] of [
      [['headline'], true],
      [['cta'], true],
      [['badge'], false],
      [['photo'], false],
      [['logo'], false],
      [['shapes'], false],
      [['card'], false],
      [['headline', 'sub'], true],
      [['headline', 'badge'], false],
    ] as const) {
      await selectLayers(page, [...ids])
      const sub = await moreSubmenu(page, 'copy-to-frames')
      await expect(sub.getByRole('button')).toHaveText(text ? [/^Style/, /^Text/, /^Layer/] : [/^Style/, /^Layer/])
      await expect(sub.getByText('To the 2 linked frames')).toBeVisible()
      await closeMenus(page)
    }
    // A frame linked to none greys the row and says why.
    await selectLayers(page, ['fresh-title'])
    const menu = await moreMenu(page)
    await expectGreyed(page, menu, 'Copy to other frames', 'No other frame on this page is linked to this one')
    expect(errors).toEqual([])
  })
})

test.describe('Copy ▸ and Paste ▸', () => {
  test('copy a layer’s style and paste it on another, by mouse and by key, each one undo step', async ({ browser }) => {
    const { page, errors } = await open(browser)
    await page.evaluate(() => {
      localStorage.removeItem('dazbee.copiedStyle')
      localStorage.removeItem('dazbee.copiedLayers')
    })
    await selectLayers(page, ['photo'])
    const paste = await moreSubmenu(page, 'paste')
    await expectGreyed(page, paste, 'Paste style', 'Copy a style first')
    await expectGreyed(page, paste, 'Paste', 'Copy layers first')
    await closeMenus(page)

    await selectLayers(page, ['headline', 'badge'])
    await expectGreyed(page, await moreSubmenu(page, 'copy'), 'Copy style', 'Select one layer to copy its style')
    await closeMenus(page)

    await selectLayers(page, ['badge'])
    await moreAction(page, 'Copy style')
    await selectLayers(page, ['mark'])
    await moreAction(page, 'Paste style')
    await expect.poll(() => fillOf(page, 'mark')).toBe(PINK)
    expect(await fillOf(page, copyIn('story', 'mark'))).toBe(INK)
    await undo(page)
    await expect.poll(() => fillOf(page, 'mark')).toBe(INK)
    await redo(page)
    await expect.poll(() => fillOf(page, 'mark')).toBe(PINK)
    await expectGreyed(page, await moreSubmenu(page, 'paste'), 'Paste style', 'The selection has this style already')
    await closeMenus(page)

    // By key: the shape's green onto the card.
    await selectLayers(page, ['shapes'])
    await page.keyboard.press('Control+Alt+KeyC')
    await selectLayers(page, ['card'])
    await page.keyboard.press('Control+Alt+KeyV')
    await expect.poll(() => fillOf(page, 'card')).toBe(GREEN)
    expect((await node(page, 'card'))?.props).toMatchObject({ x: 80, width: 320 })
    await undo(page)
    await expect.poll(() => fillOf(page, 'card')).toBe(INK)
    expect(errors).toEqual([])
  })

  test('paste onto another frame of the page makes linked copies; into its own frame or another page, new layers', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await page.evaluate(() => localStorage.removeItem('dazbee.copiedLayers'))
    // The story's copy of the badge goes, in its frame only.
    await selectLayers(page, [copyIn('story', 'badge')])
    await page.getByTestId('small-delete').click()
    await expect.poll(async () => (await holders(page, 'badge')).story).toBeUndefined()

    await selectLayers(page, ['badge'])
    await page.keyboard.press('Control+KeyC')
    await selectLayers(page, [copyIn('story', 'sub')])
    await page.keyboard.press('Control+KeyV')
    await expect.poll(async () => (await holders(page, 'badge')).story?.length).toBe(1)
    // The landscape frame has its own copy, so a paste there is a new layer.
    await selectLayers(page, [copyIn('wide', 'sub')])
    await moreAction(page, 'Paste')
    await expect.poll(async () => (await holders(page, 'badge')).wide?.length).toBe(1)
    const pasted = await page.evaluate(() => window.dazbee?.selection()[0] ?? '')
    expect((await node(page, pasted))?.link).not.toBe('badge')
    await undo(page)
    await undo(page)
    await expect.poll(async () => (await holders(page, 'badge')).story).toBeUndefined()

    // Into the frame it came from, and onto another page: new layers.
    await selectLayers(page, ['sub'])
    await page.keyboard.press('Control+KeyV')
    await expect.poll(() => page.evaluate(() => window.dazbee?.selection()[0])).not.toBe('sub')
    expect((await holders(page, 'badge')).sq).toEqual(['badge'])
    await page.evaluate(() => window.dazbee?.showPage('p2'))
    await selectLayers(page, ['far-title'])
    await page.keyboard.press('Control+KeyV')
    await expect.poll(() => page.evaluate(() => window.dazbee?.selection()[0])).not.toBe('far-title')
    expect((await holders(page, 'badge')).far).toBeUndefined()
    expect(errors).toEqual([])
  })
})

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} the small menu, its ⋯ and Copy to other frames ▸ fit with nothing cut or covered`, async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    await selectLayers(page, ['headline'])
    await expect(page.getByTestId('small-menu')).toBeVisible()
    await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    await moreMenu(page)
    await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    const sub = await moreSubmenu(page, 'copy-to-frames')
    if (width > 600) {
      await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    } else {
      // On a phone it opens under its row, laid over the full menu as the mock draws it: wholly on
      // the screen and on top, each row a finger's height, once it has popped in.
      await sub.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))))
      const rows = await sub.getByRole('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const r = button.getBoundingClientRect()
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return {
            inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            onTop: button.contains(top),
            height: r.height,
          }
        }),
      )
      for (const row of rows) expect(row).toMatchObject({ inside: true, onTop: true })
      for (const row of rows) expect(row.height).toBeGreaterThanOrEqual(44)
      // A tap on a greyed row says why, as the pointer resting on it does.
      // Playwright holds back a click on a row marked disabled until it isn't; the tap is the point here.
      await sub.getByRole('button', { name: /^Layer/ }).click({ force: true })
      await expect(
        page.getByRole('tooltip').filter({ hasText: 'Every linked frame has this layer already' }),
      ).toBeVisible()
      await expect(sub).toBeVisible()
    }
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} Copy to other frames ▸ is as wide as the mock’s, and a greyed row’s tooltip covers no row of the full menu`, async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    await selectLayers(page, ['headline'])
    const menu = await moreMenu(page)
    const sub = await moreSubmenu(page, 'copy-to-frames')
    await sub.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))))
    const [main, beside] = [await boxOf(menu), await boxOf(sub)]
    if (width > 600) {
      expect(Math.abs(beside.right - beside.left - 258)).toBeLessThanOrEqual(4)
    } else {
      // On a phone it lies over the full menu across its whole width.
      expect(Math.abs(beside.left - main.left)).toBeLessThanOrEqual(1)
      expect(Math.abs(beside.right - main.right)).toBeLessThanOrEqual(1)
    }
    // Each row's key ends at the same right-hand edge, as the full menu's do.
    const ends = await sub
      .locator('button kbd')
      .evaluateAll((keys) => keys.map((key) => Math.round(key.getBoundingClientRect().right)))
    expect(new Set(ends).size).toBe(1)
    const layer = sub.getByRole('button', { name: /^Layer/ })
    if (width > 600) await layer.hover()
    // Playwright holds back a click on a row marked disabled until it isn't; the tap is the point here.
    else await layer.click({ force: true })
    const tip = page.getByRole('tooltip').filter({ hasText: 'Every linked frame has this layer already' })
    await expect(tip).toBeVisible()
    const shown = tip.locator('xpath=..')
    await shown.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))))
    const box = await boxOf(shown)
    expect(coversMenu(box, main, beside)).toBe(0)
    expect(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height).toBe(true)
    expect(errors).toEqual([])
  })
}
