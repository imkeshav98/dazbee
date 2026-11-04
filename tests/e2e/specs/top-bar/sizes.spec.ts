// The top bar, the small menu by the selection and the edit panel (#287) at desktop, tablet and
// phone sizes: for every kind of selection, every pop-up, panel and the full menu open with nothing
// drawn over anything else, no label wrapping, and the canvas never moving.
import { photo, upload } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { layoutProblems, SCREEN_SIZES, wrapped } from '../../support/layout.ts'
import { nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, moreMenu, PIECES, UNCUT } from '../../support/top-bar.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 240_000 })

/** Selections to check, each one or several layers, with a state or none. */
const SELECTIONS: Record<string, string[]> = {
  text: ['headline'],
  rectangle: ['box'],
  star: ['star'],
  line: ['line'],
  box: ['frame'],
  group: ['group'],
  boolean: ['combo'],
  photo: ['photo'],
  'photo in a box': ['photoFrame'],
  'several shapes': ['box', 'star'],
  'text and a shape': ['headline', 'box'],
  'several photos': ['photo', 'photoB'],
  'several boxes': ['frame', 'frameB'],
  'several booleans': ['combo', 'comboB'],
  rotated: ['turned'],
  'in a group': ['g1'],
  'auto layout': ['stack'],
  'in auto layout': ['inStack'],
  masked: ['cutter'],
  locked: ['locked'],
  hidden: ['hidden'],
}

const camera = (page: Page) => page.evaluate(() => window.dazbee?.camera())

/** What the selection's top bar opens: every item with a pop-up or panel, by its test id, and the full menu. */
const openers = (page: Page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-testid^="bar-"]')]
    return items
      .map((el) => el.dataset.testid ?? '')
      .filter(
        (id) =>
          [
            'bar-overflow',
            'bar-size',
            'bar-bold',
            'bar-italic',
            'bar-underline',
            'bar-strikethrough',
            'bar-crop',
            'bar-replace',
            'bar-size-field',
            'bar-locked',
            'bar-unlock',
          ].indexOf(id) < 0,
      )
  })

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} every selection's pop-ups, panels and full menu open clear of everything else, with no label wrapping and the canvas still`, async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, topBarDesign(asset.id))
    await page.setViewportSize({ width, height })
    await page.evaluate(() => {
      window.dazbee?.select([])
      window.dazbee?.fitAll()
    })
    await nextFrame(page)
    const still = await camera(page)
    const problems: string[] = []
    const check = async (where: string) => {
      await nextFrame(page)
      for (const p of await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })) problems.push(`${where}: ${p}`)
      for (const w of await wrapped(page)) problems.push(`${where}: "${w}" wraps`)
      if (JSON.stringify(await camera(page)) !== JSON.stringify(still)) problems.push(`${where}: the canvas moved`)
    }
    for (const [name, ids] of Object.entries(SELECTIONS)) {
      await selectLayers(page, ids)
      await expect(page.getByTestId('top-bar-row')).toBeVisible()
      await check(name)
      for (const id of await openers(page)) {
        await barMenu(page, id.slice(4))
        await check(`${name}, ${id}`)
        if (width === 390 && id === 'bar-effects')
          writeOutput(
            `top-bar-${width}-${name.replaceAll(' ', '-')}-effects.png`,
            await page.screenshot({ animations: 'disabled' }),
          )
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`${id}-menu`)).toBeHidden()
      }
      if (await page.getByTestId('small-menu').isVisible()) {
        await moreMenu(page)
        await check(`${name}, full menu`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-more-menu')).toBeHidden()
      }
      if (name === 'text' || name === 'photo')
        writeOutput(`top-bar-${width}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
    }
    await selectLayers(page, [])
    await check('nothing selected')
    expect(problems).toEqual([])
    expect(errors).toEqual([])
  })
}
