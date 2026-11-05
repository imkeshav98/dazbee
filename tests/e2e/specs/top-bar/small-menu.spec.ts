// The small menu by the selection in Chromium: it sits by the selection after the view moves;
// lock, duplicate, delete and hide act on the layer in its own frame only, by mouse and by key,
// each one undo step; Delete is greyed on a locked layer; and its ⋯ shows its focus ring inside it.
import { holders, node, open, redo, undo } from '../../support/linked-menu.ts'
import { copyIn } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, perform, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

/**
 * How the small menu sits by the selection's outline on screen: how far apart they are across
 * (0 while they overlap) and up or down, from the menu's edge to the outline's nearest edge.
 */
const byTheSelection = (page: Page) =>
  page.evaluate(() => {
    const menu = document.querySelector('[data-testid="small-menu"]')?.getBoundingClientRect()
    const outline = document.querySelector('.stage-overlay .selection')?.getBoundingClientRect()
    if (
      !menu ||
      !outline ||
      getComputedStyle(document.querySelector('[data-testid="small-menu"]') as Element).visibility === 'hidden'
    )
      return null
    const across = Math.max(0, outline.left - menu.right, menu.left - outline.right)
    const down = menu.top >= outline.bottom ? menu.top - outline.bottom : outline.top - menu.bottom
    return { across: Math.round(across), down: Math.round(down) }
  })

test.describe('the small menu', () => {
  test('sits by the selection at 1280×760 after a fit, a pan and a zoom, below it when a label blocks the spot above', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await page.setViewportSize({ width: 1280, height: 760 })
    await fitSettled(page)
    const near = async () => {
      await drawn(page)
      await nextFrame(page)
      await expect.poll(() => byTheSelection(page)).toMatchObject({ across: 0 })
      expect((await byTheSelection(page))?.down).toBeLessThanOrEqual(72)
    }
    for (const id of ['headline', copyIn('wide', 'headline'), copyIn('story', 'headline')]) {
      await selectLayers(page, [id])
      await near()
      await perform(page, 'zoomToFit')
      await near()
      // A pan by the wheel, then a zoom about the selection, as a pinch does.
      await page.mouse.move(640, 400)
      await page.mouse.wheel(60, 40)
      await near()
      const outline = await page.locator('.stage-overlay .selection').boundingBox()
      await page.mouse.move(
        (outline?.x ?? 0) + (outline?.width ?? 0) / 2,
        (outline?.y ?? 0) + (outline?.height ?? 0) / 2,
      )
      await page.keyboard.down('Control')
      await page.mouse.wheel(0, -120)
      await page.keyboard.up('Control')
      await near()
      await fitSettled(page)
    }
    // The square's headline sits under the frame's label: the menu goes under the headline.
    await selectLayers(page, ['headline'])
    await near()
    const menu = await page.getByTestId('small-menu').boundingBox()
    const outline = await page.locator('.stage-overlay .selection').boundingBox()
    expect((menu?.y ?? 0) > (outline?.y ?? 0)).toBe(true)
    expect(errors).toEqual([])
  })

  test('locks, duplicates, deletes and hides in this frame only, each one undo step, by mouse and key', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    const small = page.getByTestId('small-menu')
    expect(await small.getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).toEqual([
      'Lock',
      'Duplicate',
      'Delete',
      'Hide',
      'More',
    ])
    await page.getByTestId('small-lock').click()
    await expect.poll(async () => (await node(page, 'badge'))?.lock?.move).toBe(true)
    expect((await node(page, copyIn('story', 'badge')))?.lock).toBeUndefined()
    await undo(page)
    await expect.poll(async () => (await node(page, 'badge'))?.lock).toBeUndefined()

    await page.getByTestId('small-hide').click()
    await expect.poll(async () => (await node(page, 'badge'))?.props.visible).toBe(false)
    expect((await node(page, copyIn('wide', 'badge')))?.props.visible).not.toBe(false)
    await expect(page.getByTestId('small-hide')).toHaveAttribute('aria-label', 'Show')
    await undo(page)
    await expect.poll(async () => (await node(page, 'badge'))?.props.visible).not.toBe(false)
    await page.keyboard.press('Control+Shift+KeyH')
    await expect.poll(async () => (await node(page, 'badge'))?.props.visible).toBe(false)
    await undo(page)

    await page.getByTestId('small-duplicate').click()
    await expect.poll(async () => (await holders(page, 'badge')).sq?.length ?? 0).toBe(1)
    expect(await page.evaluate(() => window.dazbee?.selection().length)).toBe(1)
    const duplicate = await page.evaluate(() => window.dazbee?.selection()[0] ?? '')
    expect(duplicate).not.toBe('badge')
    await undo(page)
    await selectLayers(page, ['badge'])
    await page.getByTestId('small-delete').click()
    await expect.poll(() => node(page, 'badge')).toBeNull()
    expect(await node(page, copyIn('story', 'badge'))).not.toBeNull()
    await undo(page)
    await expect.poll(() => node(page, 'badge')).not.toBeNull()
    await redo(page)
    await expect.poll(() => node(page, 'badge')).toBeNull()
    expect(errors).toEqual([])
  })

  test('greys Delete on a locked layer, saying it is locked, and deletes nothing', async ({ browser }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    await page.getByTestId('small-lock').click()
    const del = page.getByTestId('small-delete')
    await expect(del).toHaveAttribute('aria-disabled', 'true')
    await expect(del).toHaveAttribute('aria-description', 'The selection is locked against deleting')
    await del.hover()
    await expect(
      page.getByRole('tooltip').filter({ hasText: 'The selection is locked against deleting' }),
    ).toBeVisible()
    // Playwright holds back a click on a control marked disabled; the click is the point here.
    await del.click({ force: true })
    await page.keyboard.press('Delete')
    await drawn(page)
    expect(await node(page, 'badge')).not.toBeNull()
    await page.getByTestId('small-lock').click()
    await expect(del).not.toHaveAttribute('aria-disabled', 'true')
    await del.click()
    await expect.poll(() => node(page, 'badge')).toBeNull()
    expect(errors).toEqual([])
  })

  test('shows the ⋯ button’s focus ring inside the pill, clear of its edge', async ({ browser }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    await page.getByTestId('small-lock').focus()
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('bar-more')).toBeFocused()
    const ring = await page.getByTestId('bar-more').evaluate((button) => {
      const style = getComputedStyle(button)
      const out = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
      const r = button.getBoundingClientRect()
      const pill = (button.closest('[data-testid="small-menu"]') as Element).getBoundingClientRect()
      return {
        visible: button.matches(':focus-visible') && style.outlineStyle !== 'none',
        inside: Math.min(
          r.left - out - pill.left,
          pill.right - (r.right + out),
          r.top - out - pill.top,
          pill.bottom - (r.bottom + out),
        ),
      }
    })
    expect(ring.visible).toBe(true)
    expect(ring.inside).toBeGreaterThanOrEqual(1)
    expect(errors).toEqual([])
  })
})
