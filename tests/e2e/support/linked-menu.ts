// Readers and actions the small menu, full menu and linked menu specs share: the design they
// open, its layers as a tab holds them, and the full menu's rows, greyed rows and closing.
import { photo, upload } from './assets.ts'
import { linkedMenuDesign } from './linked-menu-design.ts'
import { namedRow } from './menu-rows.ts'
import { fitSettled, openStage, perform } from './stage.ts'
import { expect, type Locator, type Page } from './test.ts'

/** Opens the design in one tab, its page fitted. */
export async function open(browser: Parameters<typeof openStage>[0]) {
  const asset = await upload(photo)
  const opened = await openStage(browser, linkedMenuDesign(asset.id))
  await fitSettled(opened.page)
  return opened
}

/** A layer as the tab's design holds it now. */
export const node = (page: Page, id: string) =>
  page.evaluate((one) => {
    const found = window.dazbee?.design().nodes[one]
    return found
      ? (JSON.parse(JSON.stringify(found)) as {
          link: string
          parentId: string
          props: Record<string, unknown>
          lock?: Record<string, boolean>
        })
      : null
  }, id)
/** The ids of the layers with a link id, by frame. */
export const holders = (page: Page, link: string) =>
  page.evaluate((one) => {
    const design = window.dazbee?.design()
    if (!design) return {}
    const frameOf = (id: string): string => {
      let up = id
      while (design.nodes[up]) up = design.nodes[up]?.parentId ?? ''
      return up
    }
    const out: Record<string, string[]> = {}
    for (const [id, n] of Object.entries(design.nodes)) if (n.link === one) (out[frameOf(id)] ??= []).push(id)
    return out
  }, link)
export const fillOf = async (page: Page, id: string) =>
  ((await node(page, id))?.props.fills as { color?: string }[] | undefined)?.[0]?.color
export const colourOf = async (page: Page, id: string) =>
  ((await node(page, id))?.props.style as { color: string }).color
export const undo = (page: Page) => perform(page, 'undo')
export const redo = (page: Page) => perform(page, 'redo')

/** The rows of a menu that are its own, in order, by their words without their keys: buttons straight inside it. */
export const rowsOf = (menu: Locator) =>
  menu.locator(':scope > button').evaluateAll((rows) => rows.map((row) => row.firstChild?.textContent?.trim() ?? ''))
/**
 * Checks that the row of a menu named so is greyed and says why: to a screen reader, and in a
 * tooltip as the pointer rests on it.
 */
export async function expectGreyed(page: Page, menu: Locator, name: string, why: string) {
  const row = namedRow(menu, name)
  await expect(row).toHaveAttribute('aria-disabled', 'true')
  await expect(row).toHaveAttribute('aria-description', why)
  // Over the row in a few moves, as a hand does: the first after leaving another tooltip's row only ends that one.
  await row.hover()
  const box = await row.boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2, { steps: 2 })
  await expect(page.getByRole('tooltip').filter({ hasText: why })).toBeVisible()
}
/**
 * Closes the open menus with Esc, which closes the top-most first: a tooltip, a menu beside a row,
 * the menu. Each Esc waits for the one before to land, so none reaches the stage and lets the
 * selection go.
 */
export async function closeMenus(page: Page) {
  const shown = async () =>
    (await page.getByTestId('bar-more-menu').isVisible()) || (await page.getByTestId('stage-menu').isVisible())
  for (let i = 0; i < 6 && (await shown()); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  expect(await shown()).toBe(false)
}
