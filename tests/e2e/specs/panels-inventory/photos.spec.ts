import { reloads } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { assets, fills, props, setupInventory, step } from '../../support/inventory.ts'
import { drag, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { moreAction, openCard } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('photos', () => {
  const image = async (page: Page) => (await fills(page, 'photo')).at(-1) ?? {}

  row(43, 'replace the image', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    await step(
      page,
      async () => {
        await page.getByTestId('bar-replace').click()
        await page.getByTestId('bar-replace-picker').locator(`li[data-asset="${assets.tile}"] button`).click()
      },
      async () => {
        await expect.poll(() => image(page)).toMatchObject({ assetId: assets.tile })
      },
    )
    await reloads(page)
  })

  row(44, 'crop on the canvas', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    await page.getByTestId('bar-crop').click()
    await expect(page.locator('.crop-image')).toBeVisible()
    await step(
      page,
      async () => drag(page, { x: 540, y: 350 }, { x: 600, y: 350 }),
      async () => {
        await expect.poll(() => image(page)).toMatchObject({ fit: 'crop' })
        expect((await image(page)).crop).toBeTruthy()
      },
    )
    await page.keyboard.press('Escape')
    await reloads(page)
  })

  row(45, 'fit: fill, fit inside, crop, tile', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    // The fit is a part of the Edit image panel.
    const field = async () => (await openCard(page, 'fill-card')).getByRole('radiogroup', { name: 'Fit' })
    for (const fit of ['fit', 'tile', 'crop', 'fill']) {
      // Crop with no crop box shows what fill shows.
      await step(
        page,
        async () => (await field()).locator(`[data-value="${fit}"]`).click(),
        async () => {
          await expect.poll(() => image(page)).toMatchObject({ fit })
        },
        { draws: fit !== 'crop' && fit !== 'fill' },
      )
    }
    await reloads(page)
  })

  row(46, 'filter', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const filters = async () => (await openCard(page, 'look-card')).getByRole('radiogroup', { name: 'Filter' })
    for (const [name, filter] of [
      ['Mono', 'mono'],
      ['Sepia', 'sepia'],
      ['Vivid', 'vivid'],
      ['Fade', 'fade'],
      ['Warm', 'warm'],
      ['Cool', 'cool'],
      ['Original', undefined],
    ] as const) {
      await step(
        page,
        async () => (await filters()).getByRole('radio', { name }).click(),
        async () => {
          await expect.poll(async () => (await image(page)).filter).toBe(filter)
        },
      )
    }
    await reloads(page)
  })

  row(47, 'adjust: exposure, contrast, saturation, temperature, tint', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const card = async () => await openCard(page, 'adjust-card')
    for (const [name, key] of [
      ['Light', 'exposure'],
      ['Contrast', 'contrast'],
      ['Saturation', 'saturation'],
      ['Warmth', 'temperature'],
      ['Tint', 'tint'],
    ] as const) {
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name }), '40'),
        async () => {
          await expect
            .poll(async () => ((await image(page)).adjust as Record<string, number> | undefined)?.[key])
            .toBe(40)
        },
      )
    }
    await reloads(page)
  })

  row(48, 'image opacity', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const card = async () => await openCard(page, 'adjust-card')
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Image opacity' }), '50'),
      async () => {
        await expect.poll(async () => (await image(page)).opacity).toBe(0.5)
      },
    )
    await reloads(page)
  })

  row(49, 'use as mask', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const mask = () => moreAction(page, 'Use as mask')
    await step(page, mask, async () => {
      await expect.poll(async () => (await props(page, 'photo')).mask).toBe('alpha')
    })
    await step(page, mask, async () => {
      await expect.poll(async () => (await props(page, 'photo')).mask).toBeFalsy()
    })
    await reloads(page)
  })
})
