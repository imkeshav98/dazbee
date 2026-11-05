// The small menu by the selection in Chromium: lock, duplicate, delete and hide act on the layer in
// its own frame only, by mouse and by key, each one undo step.
import { holders, node, open, redo, undo } from '../../support/linked-menu.ts'
import { copyIn } from '../../support/seed.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

test.describe('the small menu', () => {
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
})
