// The Add a frame card's helpers, for the specs of Add a frame and Add size: the card, the Frame
// button that opens it, a picked frame's Add size, and a size of your own typed in.
import { expect, type Page } from './test.ts'
import { barMenu } from './top-bar.ts'

/** The card in the edit panel, Add a frame or Add size. */
export const card = (page: Page) => page.locator('#edit-panel')

/** Picks the Frame tool by the dock's button and waits for the card. */
export async function frameButton(page: Page) {
  await page.locator('[data-dock] [data-tool="frame"]').click()
  await expect(card(page)).toHaveAttribute('data-panel', 'addFrame')
}
/** Opens the picked frame's ⋯ and its Add size, and waits for the card. */
export async function addSize(page: Page) {
  const menu = await barMenu(page, 'frame-more')
  await menu.getByRole('button', { name: 'Add size' }).click()
  await expect(card(page)).toHaveAttribute('data-panel', 'addSize')
}
/** Types a size of your own into the card's fields. */
export async function typeSize(page: Page, width: string, height: string) {
  await page.getByTestId('own-width').fill(width)
  await page.getByTestId('own-height').fill(height)
}
