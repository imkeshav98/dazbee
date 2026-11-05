// The Add a frame card's helpers, for the specs of Add a frame and Add size: the card, the Frame
// button that opens it, a picked frame's Add size, a size of your own typed in, and what covers a
// frame just added or the labels.
import { EDITOR_CHROME } from './layout.ts'
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
/**
 * What keeps a frame from showing whole beside the chrome, by name: each piece of chrome over the
 * frame or its label (the islands, the rail, the dock, zoom, Pages, the top bar and the edit panel),
 * and "off the stage" for a frame not whole on it. None when it shows whole with its label clear.
 */
export function chromeOver(page: Page, frameId: string) {
  return page.evaluate(
    ({ id, chrome }) => {
      const editor = window.dazbee
      const frame = editor?.design().frames[id]
      const stage = document.querySelector('[data-testid="stage"]')?.getBoundingClientRect()
      const label = document.querySelector(`.stage-overlay .frame-label[data-frame="${id}"]`)?.getBoundingClientRect()
      if (!editor || !frame || !stage) return ['no frame']
      if (!label) return ['no label']
      const c = editor.camera()
      const left = stage.left + frame.x * c.zoom + c.x
      const top = stage.top + frame.y * c.zoom + c.y
      const box = { left, top, right: left + frame.width * c.zoom, bottom: top + frame.height * c.zoom }
      const over = (a: typeof box, b: DOMRect) =>
        a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
      const problems: string[] = []
      if (
        box.left < stage.left - 1 ||
        box.top < stage.top - 1 ||
        box.right > stage.right + 1 ||
        box.bottom > stage.bottom + 1
      )
        problems.push('off the stage')
      for (const [name, selector] of Object.entries<string>(chrome)) {
        for (const piece of document.querySelectorAll(selector)) {
          const at = piece.getBoundingClientRect()
          if (at.width === 0 || at.height === 0 || getComputedStyle(piece).visibility === 'hidden') continue
          if (over(box, at)) problems.push(`${name} over the frame`)
          if (over(label, at)) problems.push(`${name} over its label`)
        }
      }
      return problems
    },
    { id: frameId, chrome: { ...EDITOR_CHROME, 'top bar': '[data-testid="top-bar"]', 'edit panel': '#edit-panel' } },
  )
}
/** The frames whose labels the header pill or the end island cover, by id. */
export function labelsUnderIslands(page: Page) {
  return page.evaluate(
    (islands) => {
      const pieces = islands.map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      return [...document.querySelectorAll<HTMLElement>('.stage-overlay .frame-label')]
        .filter((label) => {
          const at = label.getBoundingClientRect()
          return pieces.some(
            (piece) =>
              piece && at.left < piece.right && piece.left < at.right && at.top < piece.bottom && piece.top < at.bottom,
          )
        })
        .map((label) => label.dataset.frame ?? '')
    },
    [EDITOR_CHROME['header pill'], EDITOR_CHROME['end island']],
  )
}
