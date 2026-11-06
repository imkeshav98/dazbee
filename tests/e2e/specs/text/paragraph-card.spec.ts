// The Text box and Spacing cards and the bar's text popovers in Chromium, with real input: box mode,
// max lines and lifting the limit, paragraph spacing, lists, underline and strikethrough, shrinking
// to fit with its sizes, and an outline with its width and colour.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { frameDesign } from '../../support/seed.ts'
import { openStage } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, openCard, textStyleToggle } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput =>
  frameDesign({
    name: 'Paragraphs',
    fills: [{ type: 'solid', color: '#FFF8F0FF' }],
    nodes: {
      copy: {
        type: 'text',
        parentId: 'sq',
        index: 'a0',
        name: 'Copy',
        props: {
          x: 80,
          y: 80,
          width: 920,
          height: 600,
          text: 'Cold brew is back\nOat milk on the house\nEvery weekend this summer',
          style: { fontFamily: 'Noto Sans', fontSize: 72, fontWeight: 800, color: '#1A1420FF' },
        },
      },
    },
  })

type TextProps = Record<string, unknown> & { style: Record<string, unknown> }
const copy = (page: Page) => page.evaluate(() => window.dazbee?.design().nodes.copy?.props) as Promise<TextProps>

test('the Text box card sets the box, lines and fit; the bar sets lists, decoration and the outline', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.evaluate(() => window.dazbee?.select(['copy']))
  const card = async () => await openCard(page, 'text-box-card')
  const fit = async () => await openCard(page, 'text-fit-card')
  const spacing = async () => await openCard(page, 'spacing-card')
  await expect(await card()).toBeVisible()
  const effects = () => barMenu(page, 'effects')
  const list = async (to: string) =>
    (await barMenu(page, 'list')).getByRole('radiogroup', { name: 'List' }).locator(`[data-value="${to}"]`).click()

  await (await card()).getByRole('radiogroup', { name: 'Box' }).locator('[data-value="fixed"]').click()
  await list('bullet')
  await page.keyboard.press('Escape')
  await enter((await spacing()).getByRole('spinbutton', { name: 'Paragraph spacing' }), '24')
  await enter((await fit()).getByRole('spinbutton', { name: 'Max lines' }), '2')
  await expect
    .poll(() => copy(page))
    .toMatchObject({ boxMode: 'fixed', list: 'bullet', paragraphSpacing: 24, maxLines: 2 })

  await (await textStyleToggle(page, 'underline')).click()
  await (await textStyleToggle(page, 'strikethrough')).click()
  await (await textStyleToggle(page, 'strikethrough')).click()
  await expect(await textStyleToggle(page, 'underline')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await copy(page)).style).toMatchObject({ underline: true, strikethrough: false })

  await (await effects()).locator('[data-tile="outline"]').click()
  await enter((await effects()).getByRole('spinbutton', { name: 'Outline width' }), '4')
  await enter((await effects()).getByRole('textbox', { name: 'Outline hex' }), 'ff3d6e')
  await expect.poll(async () => (await copy(page)).style.outline).toEqual({ width: 4, color: '#FF3D6EFF' })
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('paragraph-card.png', await page.screenshot())
  await page.keyboard.press('Escape')

  // Shrink to fit starts from half the size up to the size; the smallest can't pass the largest.
  await (await fit()).getByRole('switch', { name: 'Shrink to fit' }).click()
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 36, max: 72 })
  await enter((await fit()).getByRole('spinbutton', { name: 'Smallest size' }), '90')
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 72, max: 72 })

  // 0 lines lifts the limit; turning things off removes them.
  await enter((await fit()).getByRole('spinbutton', { name: 'Max lines' }), '0')
  await list('none')
  await page.keyboard.press('Escape')
  await (await fit()).getByRole('switch', { name: 'Shrink to fit' }).click()
  await (await effects()).locator('[data-tile="outline"]').click()
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => {
      const props = await copy(page)
      return [props.maxLines, props.list, props.shrinkToFit, props.style.outline]
    })
    .toEqual([undefined, undefined, undefined, undefined])
  await expect((await fit()).getByRole('spinbutton', { name: 'Max lines' })).toHaveValue('')

  // One undo takes the outline back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await copy(page)).style.outline).toEqual({ width: 4, color: '#FF3D6EFF' })
  expect(errors).toEqual([])
})

test('with shrink to fit on, the size on the bar is the largest size, so the text follows it', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await page.evaluate(() => window.dazbee?.select(['copy']))
  await (await openCard(page, 'text-fit-card')).getByRole('switch', { name: 'Shrink to fit' }).click()
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 36, max: 72 })
  await page.keyboard.press('Escape')
  const height = () => page.evaluate(() => window.dazbee?.boxOf('copy')?.height ?? 0)
  const before = await height()

  // A smaller size draws the text smaller: the largest size comes down with it.
  await enter(page.getByTestId('bar-size-field'), '40')
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 36, max: 40 })
  expect((await copy(page)).style.fontSize).toBe(40)
  await expect.poll(height).toBeLessThan(before)
  // Below the smallest, the smallest comes down too; + steps both up from there.
  await enter(page.getByTestId('bar-size-field'), '20')
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 20, max: 20 })
  await page.getByRole('button', { name: 'Bigger' }).click()
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 20, max: 21 })
  expect((await copy(page)).style.fontSize).toBe(21)
  // Each change is one undo step, and comes back with redo.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 20, max: 20 })
  await page.evaluate(() => window.dazbee?.perform('redo'))
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 20, max: 21 })

  // The Largest field is the same size: the bar shows it, and steps down from it.
  await enter((await openCard(page, 'text-fit-card')).getByRole('spinbutton', { name: 'Largest size' }), '60')
  await expect.poll(async () => (await copy(page)).style.fontSize).toBe(60)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('bar-size-field')).toHaveValue('60')
  await page.getByRole('button', { name: 'Smaller' }).click()
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 20, max: 59 })
  expect((await copy(page)).style.fontSize).toBe(59)

  // In a fixed box too: a bigger size is the largest, and the text shrinks to fit the box under it.
  await (
    await openCard(page, 'text-box-card')
  )
    .getByRole('radiogroup', { name: 'Box' })
    .locator('[data-value="fixed"]')
    .click()
  await page.keyboard.press('Escape')
  const fixed = await height()
  await enter(page.getByTestId('bar-size-field'), '300')
  await expect.poll(async () => (await copy(page)).shrinkToFit).toEqual({ min: 20, max: 300 })
  expect(await height()).toBe(fixed)
  expect(errors).toEqual([])
})
