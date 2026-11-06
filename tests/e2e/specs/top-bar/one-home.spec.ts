// The top bar without duplicates: for each kind of selection, every control the bar offers,
// on the bar or in what one of its items opens, has exactly one home, the one `HOMES` names.
import { photo, upload } from '../../support/assets.ts'
import { type BarCase, expectedHomes, homesOf } from '../../support/bar-homes.ts'
import { openStage, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 300_000 })

/** The layers each case selects in the top bar design. */
const SELECTED: Record<BarCase, string[]> = {
  text: ['headline'],
  shape: ['star'],
  photo: ['photo'],
  photos: ['photo', 'photoB'],
  box: ['card'],
  several: ['box', 'card'],
  locked: ['locked'],
}

test('every control the bar offers has exactly one home, for text, a shape, a photo, several photos, a box, several layers and a locked layer', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 1280, height: 760 })
  for (const [which, ids] of Object.entries(SELECTED) as [BarCase, string[]][]) {
    await selectLayers(page, ids, { bar: true })
    expect(await homesOf(page), which).toEqual(expectedHomes(which))
  }
  expect(errors).toEqual([])
})
