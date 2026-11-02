// A key pressed on the layers panel while the panel's last render still has its effects to run:
// the focus follows the row the key moved to.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { openStage } from '../support/stage.ts'

const rect = (x: number, y: number, width: number, height: number, color: string) =>
  ({ x, y, width, height, shape: { kind: 'rect' as const, cornerRadius: 16 }, fills: [{ type: 'solid' as const, color }] })

const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Layers panel', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    backdrop: { type: 'graphic', parentId: 'p1', index: 'a0', name: 'Backdrop', props: rect(40, 40, 1000, 1000, '#F4EDE4FF') },
    card: { type: 'group', parentId: 'p1', index: 'a1', name: 'Card', props: { x: 120, y: 620, width: 520, height: 300 } },
    c1: { type: 'graphic', parentId: 'card', index: 'a0', name: 'Card back', props: rect(120, 620, 520, 300, '#14213DFF') },
    c2: { type: 'graphic', parentId: 'card', index: 'a1', name: 'Card stripe', props: rect(160, 660, 440, 60, '#FCA311FF') },
  },
  overrides: {},
})

const tree = (page: Page) => page.getByRole('tree')
const row = (page: Page, name: string) => tree(page).getByRole('treeitem').filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })

test('a key pressed before the panel\'s last render has run its effects moves the focus', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  await expect(tree(page)).toBeVisible()
  await page.evaluate(() => window.dazbee?.select(['c2']))
  await expect(row(page, 'Card stripe')).toHaveAttribute('aria-selected', 'true')
  await row(page, 'Card stripe').focus()
  await expect(row(page, 'Card stripe')).toBeFocused()

  // Selecting Card back from outside the panel renders it at normal priority. Once that render is in
  // the page, and before its effects have run, ArrowLeft is pressed on Card stripe.
  const pressed = await page.evaluate(() => new Promise<string | null>((resolve) => {
    const rows = document.querySelector('[role=tree]')
    if (!rows) return resolve(null)
    const observer = new MutationObserver(() => {
      observer.disconnect()
      const on = document.activeElement
      on?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true }))
      resolve(on?.getAttribute('data-layer') ?? null)
    })
    observer.observe(rows, { attributes: true, attributeFilter: ['aria-selected'], subtree: true })
    window.dazbee?.select(['c1'])
  }))
  expect(pressed).toBe('c2')
  await expect(row(page, 'Card')).toHaveAttribute('aria-selected', 'true')
  await expect(row(page, 'Card')).toBeFocused()
  expect(errors).toEqual([])
})
