// The panels inventory's rows 69 to 76 (support/inventory.ts): the controls reached from the top
// bar, its pop-ups and the full menu.
import { reloads } from '../../support/editor.ts'
import { assets, doc, fills, props, setupInventory, step, style } from '../../support/inventory.ts'
import { copyIn } from '../../support/seed.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu, moreAction, moreSubmenu, openCard } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('top bar and full menu', () => {
  row(69, 'bold and italic on the top bar', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => page.getByTestId('bar-bold').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontWeight).toBeLessThan(600)
      },
    )
    await step(
      page,
      async () => page.getByTestId('bar-italic').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontStyle).toBe('italic')
      },
    )
    await reloads(page)
  })

  row(70, 'text direction in the full menu', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => (await moreSubmenu(page, 'text-direction')).getByRole('button', { name: 'Right to left' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).direction).toBe('rtl')
      },
    )
    await reloads(page)
  })

  row(71, 'line up and spread selected layers from the top bar', async (open) => {
    const page = await open()
    await selectLayers(page, ['box', 'dot'], { bar: true })
    await step(
      page,
      async () => (await barMenu(page, 'line-up')).getByRole('button', { name: 'Align left' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'dot')).x).toBe(80)
      },
    )
    await page.keyboard.press('Escape')
    // The hexagon between the box and the star moves to leave the same room each side: (900 - 380 - 160) / 2.
    await selectLayers(page, ['box', 'poly', 'star'], { bar: true })
    await step(
      page,
      async () => (await barMenu(page, 'line-up')).getByRole('button', { name: /^Distribute horizontally/ }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'poly')).x).toBe(560)
      },
    )
    await reloads(page)
  })

  row(72, 'lock and hide in this frame from the full menu', async (open) => {
    const page = await open(true)
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () => moreAction(page, 'Lock'),
      async () => {
        await expect.poll(async () => Object.values((await doc(page)).nodes.box?.lock ?? {}).some(Boolean)).toBe(true)
      },
      { draws: false },
    )
    await step(
      page,
      async () => moreAction(page, 'Hide'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).visible).toBe(false)
        // Its linked copy in the Story frame still shows.
        await expect.poll(async () => (await props(page, copyIn('story', 'box'))).visible).not.toBe(false)
      },
    )
    await reloads(page)
  })

  row(73, 'box clipping from the Box pop-up', async (open) => {
    const page = await open()
    await selectLayers(page, ['plain'], { bar: true })
    // Its tiles lie inside it, so the drawing is the same either way.
    await step(
      page,
      async () => (await openCard(page, 'box-card')).getByRole('switch', { name: "Hide what's outside" }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).clip).toBe(false)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(74, 'mask by brightness from the Mask pop-up', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await moreAction(page, 'Use as mask')
    await expect.poll(async () => (await props(page, 'box')).mask).toBe('alpha')
    // Nothing in this design sits under the box for it to mask, so the drawing stays the same.
    await step(
      page,
      async () => (await openCard(page, 'mask-card')).getByRole('radio', { name: 'Brightness' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).mask).toBe('luminance')
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(76, 'several photos: replace and the filters, for all of them', async (open) => {
    const page = await open()
    // The box shows the same picture as the photo, so the two are several photos.
    await page.evaluate(
      (assetId) =>
        window.dazbee?.session.run('node.update', {
          ids: ['box'],
          patch: { fills: [{ type: 'image', assetId, fit: 'fill' }] },
        }),
      assets.photo,
    )
    await selectLayers(page, ['photo', 'box'], { bar: true })
    const card = async () => await openCard(page, 'photos-card')
    const filters = async () => [(await fills(page, 'photo')).at(-1)?.filter, (await fills(page, 'box')).at(-1)?.filter]
    await step(
      page,
      async () =>
        (await card()).getByRole('radiogroup', { name: 'Filter' }).getByRole('radio', { name: 'Mono' }).click(),
      async () => {
        await expect.poll(filters).toEqual(['mono', 'mono'])
      },
    )
    await step(
      page,
      async () => {
        await (await card()).getByTestId('replace-image').click()
        await page.locator(`li[data-asset="${assets.tile}"] button`).first().click()
      },
      async () => {
        await expect
          .poll(async () => [(await fills(page, 'photo')).at(-1)?.assetId, (await fills(page, 'box')).at(-1)?.assetId])
          .toEqual([assets.tile, assets.tile])
      },
    )
    await reloads(page)
  })

  row(75, "a boolean's operation from its Combine pop-up", async (open) => {
    const page = await open()
    await selectLayers(page, ['box', 'poly'], { bar: true })
    await (await barMenu(page, 'combine')).getByRole('button', { name: /^Union/ }).click()
    const made = async () => Object.entries((await doc(page)).nodes).find(([, n]) => n.type === 'boolean')?.[0] ?? ''
    await expect.poll(made).not.toBe('')
    await selectLayers(page, [await made()], { bar: true })
    await step(
      page,
      async () => (await openCard(page, 'combine-card')).getByRole('radio', { name: 'Subtract' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, await made())).op).toBe('subtract')
      },
    )
    await reloads(page)
  })
})
