// The paint editor that + opens in the Colour and Background panels, and Add image under the
// Colour panel's: on a phone or a touch screen every one of the editor's targets is 44 px tall and
// 8 px from the next, for each kind of fill, in a sheet that cuts none off, while a desktop keeps
// their size; with pictures of the editor on a solid, a gradient and an image at the three screen
// sizes in both themes.
import { photo, upload } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { newBrand, putKit } from '../../support/seed.ts'
import { nextFrame } from '../../support/stage.ts'
import {
  expectTouchTargets,
  SWATCH_KIT,
  SWATCH_PANELS,
  type SwatchControl,
  swatchTouches,
  TOUCH_TARGET,
} from '../../support/swatches.ts'
import { expect, type Locator, test } from '../../support/test.ts'
import { PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

/** The kinds of fill a paint editor offers, each by its tab's name. */
const FILL_KINDS = ['Solid', 'Line gradient', 'Circle gradient', 'Sweep gradient', 'Image'] as const

/**
 * The panels whose + shows a paint editor under the design's colours, with the kinds of fill each is
 * measured on: a frame's Background panel on all of them, and a shape's Colour panel on all but an
 * image, which makes the shape a photo, whose bar has no Colour.
 */
const PAINT_PANELS = SWATCH_PANELS.flatMap((panel) =>
  panel.name === "a shape's Colour panel"
    ? [{ ...panel, kinds: FILL_KINDS.filter((kind) => kind !== 'Image') }]
    : panel.name === "a frame's Background panel"
      ? [{ ...panel, kinds: [...FILL_KINDS] }]
      : [],
)

/**
 * Every target of a paint editor, a person presses or types in: a number field is its whole knob,
 * a colour's box the label round it, so the inputs inside those are left out.
 */
const PAINT_TARGETS: SwatchControl = {
  control: 'a target of the paint editor',
  id: 'paint-targets',
  selector:
    'button, select, label, [role="radio"], [data-scrub], input:not([data-scrub] input):not(label input):not([type="file"])',
  size: 0,
}

/** Add image, under the Colour panel's paint editor while the shape has no picture. */
const ADD_IMAGE: SwatchControl = {
  control: 'Add image',
  id: 'add-image',
  selector: '[data-testid="add-image"]',
  size: 34,
}

/**
 * The paint editor's controls that are smaller than a finger off a phone, by a selector in it, with
 * how tall each is there and the space to the next one, where that is set.
 */
const KEPT_ON_DESKTOP = [
  {
    control: 'the fill tabs',
    selector: '[role="radiogroup"][aria-label="Kind of paint"] > button',
    height: 24.5,
    gap: 1.75,
  },
  { control: 'the hex field', selector: 'input[name="colour-hex"]', height: 28 },
  { control: 'Remove this stop', selector: 'button[aria-label="Remove this stop"]', height: 24.5 },
  { control: 'Replace', selector: '[data-testid="paint-replace-image"]', height: 24.5 },
] as const

/** The image picker's targets: its upload and the brand's images. */
const IMAGE_PICKER_TARGETS: SwatchControl = {
  control: 'a target of the image picker',
  id: 'image-picker',
  selector: 'label, li[data-asset] button',
  size: 0,
}

/** A phone or a tablet as a touch screen, which takes no hover. */
const TOUCH_SCREEN = { touch: true, mobile: true }

/**
 * What a touch screen off a phone holds to a finger's size: the fill tabs, the hex field and
 * Replace. The icon buttons are 44 px on a phone alone.
 */
const TOUCH_SCREEN_TARGETS = KEPT_ON_DESKTOP.filter(({ control }) => control !== 'Remove this stop')

/**
 * Switches the paint editor of a panel's + to a kind of fill, an image by picking `assetId`, and
 * gives the editor; `onPicker` is given the image picker before the image is picked.
 */
async function fillAs(
  panel: Locator,
  kind: (typeof FILL_KINDS)[number],
  assetId: string,
  onPicker?: (picker: Locator) => Promise<void>,
) {
  const picker = panel.getByTestId('colour-picker')
  const tab = picker.getByRole('radio', { name: kind })
  if (kind === 'Image') {
    if ((await tab.count()) === 0) {
      await picker.getByTestId('paint-image').click()
      const images = panel.page().getByTestId('paint-image-picker')
      await expect(images.locator(`li[data-asset="${assetId}"] button`)).toBeVisible()
      await onPicker?.(images)
      await images.locator(`li[data-asset="${assetId}"] button`).click()
    }
  } else if ((await tab.getAttribute('aria-checked')) !== 'true') await tab.click()
  await expect(picker.getByRole('radio', { name: kind })).toHaveAttribute('aria-checked', 'true')
  return picker.getByTestId('paint-editor')
}

test('on a phone every target of the paint editor in the Colour and Background panels, for each kind of fill, Add image and the image picker is 44 px tall and 8 px from the next, in a sheet that cuts none off', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e phone paint targets')
  await putKit(brandId, SWATCH_KIT)
  const asset = await upload(photo, { brandId })
  const screen = { width: 390, height: 844 }
  const { page, errors } = await openSized(browser, screen, { brandId, ...TOUCH_SCREEN })
  for (const { name, open, kinds } of PAINT_PANELS) {
    const panel = await open(page)
    const sheet = await panel.boundingBox()
    if (!sheet) throw new Error(`${name} has no box`)
    if (name === "a shape's Colour panel")
      expectTouchTargets(await swatchTouches(panel, ADD_IMAGE), `${name}, ${ADD_IMAGE.control}`, sheet)
    for (const kind of kinds) {
      const editor = await fillAs(panel, kind, asset.id, async (picker) =>
        expectTouchTargets(
          await swatchTouches(picker, IMAGE_PICKER_TARGETS),
          `${name}, ${IMAGE_PICKER_TARGETS.control}`,
          { x: 0, width: screen.width },
        ),
      )
      // A third stop, tapped onto the bar's middle, so Remove this stop can be pressed.
      const stops = editor.locator('[data-stop]')
      if (kind !== 'Solid' && kind !== 'Image' && (await stops.count()) < 3) {
        await editor.getByRole('group', { name: /^Gradient stops/ }).tap()
        await expect(stops).toHaveCount(3)
      }
      const what = `${name}, its paint editor on ${kind}, ${PAINT_TARGETS.control}`
      const touches = await swatchTouches(editor, PAINT_TARGETS)
      expect(touches.length, `${what}: the targets measured`).toBeGreaterThan(5)
      expectTouchTargets(touches, what, sheet)
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('#edit-panel')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('at 820×1180 on a touch screen the paint editor in the Colour and Background panels has its tabs, hex field, Replace and Add image 44 px tall, the tabs 8 px apart, each whole in the editor, and each fill row’s hex whole', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e tablet paint targets')
  await putKit(brandId, SWATCH_KIT)
  const asset = await upload(photo, { brandId })
  const { page, errors } = await openSized(browser, { width: 820, height: 1180 }, { brandId, ...TOUCH_SCREEN })
  const measured = new Set<string>()
  for (const { name, open, kinds } of PAINT_PANELS) {
    const panel = await open(page)
    if (name === "a shape's Colour panel")
      expect((await panel.getByTestId('add-image').boundingBox())?.height, `${name}, ${ADD_IMAGE.control}`).toBeCloseTo(
        TOUCH_TARGET.size,
        1,
      )
    for (const kind of kinds) {
      const editor = await fillAs(panel, kind, asset.id)
      const room = await editor.boundingBox()
      if (!room) throw new Error(`${name} has no paint editor`)
      const tabs = editor.getByRole('radiogroup', { name: 'Kind of paint' })
      // The tabs fit their well, none pushed past its end.
      expect(
        await tabs.evaluate((well) => well.scrollWidth - well.clientWidth),
        `${name}, its paint editor on ${kind}, the fill tabs: past their well`,
      ).toBeLessThanOrEqual(0)
      for (const { control, selector, ...kept } of TOUCH_SCREEN_TARGETS) {
        if ((await editor.locator(selector).count()) === 0) continue
        measured.add(control)
        const what = `${name}, its paint editor on ${kind}, ${control}`
        for (const touch of await swatchTouches(editor, { control, id: control, selector, size: TOUCH_TARGET.size })) {
          expect(touch.height, `${what}: its height`).toBeCloseTo(TOUCH_TARGET.size, 1)
          if ('gap' in kept)
            expect(touch.space, `${what}: the space to the next target`).toBeGreaterThanOrEqual(TOUCH_TARGET.gap)
          expect(touch.x, `${what}: starts in the editor`).toBeGreaterThanOrEqual(room.x)
          expect(touch.x + touch.width, `${what}: ends in the editor`).toBeLessThanOrEqual(room.x + room.width)
        }
      }
    }
    // Each fill row shows its whole hex beside its buttons.
    for (const hex of await panel.locator('[data-row] input[name="colour-hex"]').all())
      expect(
        await hex.evaluate((input) => input.scrollWidth - input.clientWidth),
        `${name}, a fill row's hex: cut short`,
      ).toBeLessThanOrEqual(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('#edit-panel')).toHaveCount(0)
  }
  expect([...measured].sort()).toEqual(TOUCH_SCREEN_TARGETS.map(({ control }) => control).sort())
  expect(errors).toEqual([])
})

test('at 1280×760 the paint editor in the Colour and Background panels keeps its tabs, hex field and buttons, and Add image, at their size', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e desktop paint targets')
  await putKit(brandId, SWATCH_KIT)
  const asset = await upload(photo, { brandId })
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { brandId })
  const measured = new Set<string>()
  for (const { name, open, kinds } of PAINT_PANELS) {
    const panel = await open(page)
    if (name === "a shape's Colour panel")
      expect((await panel.getByTestId('add-image').boundingBox())?.height, `${name}, ${ADD_IMAGE.control}`).toBeCloseTo(
        ADD_IMAGE.size,
        1,
      )
    for (const kind of kinds) {
      const editor = await fillAs(panel, kind, asset.id)
      for (const { control, selector, height, ...kept } of KEPT_ON_DESKTOP) {
        // Each kind of fill shows some of them: the hex on a solid and a gradient, Replace on an image.
        if ((await editor.locator(selector).count()) === 0) continue
        measured.add(control)
        const what = `${name}, its paint editor on ${kind}, ${control}`
        for (const touch of await swatchTouches(editor, { control, id: control, selector, size: height })) {
          expect(touch.height, `${what}: its height`).toBeCloseTo(height, 1)
          if ('gap' in kept) expect(touch.space, `${what}: the space to the next target`).toBeCloseTo(kept.gap, 1)
        }
      }
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('#edit-panel')).toHaveCount(0)
  }
  expect([...measured].sort()).toEqual(KEPT_ON_DESKTOP.map(({ control }) => control).sort())
  expect(errors).toEqual([])
})

// Each screen size as a mouse takes it, and a tablet and a phone as a touch screen too.
const SHOT_SCREENS = [
  ...SCREEN_SIZES.filter(([width]) => width >= 640).map(([width, height]) => ({ width, height, touch: false })),
  ...SCREEN_SIZES.filter(([width]) => width < 1000).map(([width, height]) => ({ width, height, touch: true })),
]

for (const { width, height, touch } of SHOT_SCREENS) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}${touch ? ' on a touch screen' : ''}, ${theme}: the paint editor in the Colour and Background panels on a solid, a gradient and an image`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const brandId = await newBrand('e2e paint editor shots')
        await putKit(brandId, SWATCH_KIT)
        const asset = await upload(photo, { brandId })
        const { page, errors } = await openSized(browser, { width, height }, { theme, brandId, touch, mobile: touch })
        for (const [i, { open, kinds }] of PAINT_PANELS.entries()) {
          const panel = await open(page)
          for (const kind of kinds.filter((k) => k === 'Solid' || k === 'Line gradient' || k === 'Image')) {
            const editor = await fillAs(panel, kind, asset.id)
            // On a phone the editor is under the sheet's fold until scrolled to.
            await editor.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
            await nextFrame(page)
            const slug = kind.split(' ')[0]?.toLowerCase()
            writeOutput(
              `paint-${width}${touch ? '-touch' : ''}-${theme}-${i + 1}-${slug}.png`,
              await page.screenshot({ animations: 'disabled' }),
            )
          }
          await page.keyboard.press('Escape')
          await expect(page.locator('#edit-panel')).toHaveCount(0)
        }
        expect(errors).toEqual([])
      },
    )
  }
}
