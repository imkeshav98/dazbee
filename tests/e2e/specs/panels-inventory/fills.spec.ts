// The panels inventory's rows 29 to 34 (support/inventory.ts): a shape's fills. Swatches and brand
// colours, the fill list, each paint's kind, gradient stops, hex and opacity, and an image into a
// shape.
import { reloads } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { assets, doc, fills, setupInventory, step } from '../../support/inventory.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu, fillList } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('fills', () => {
  row(29, 'fill swatches and brand colours', async (open) => {
    const page = await open()
    await selectLayers(page, ['dot'], { bar: true })
    await step(
      page,
      async () =>
        (await barMenu(page, 'colour'))
          .getByRole('group', { name: 'Brand colours' })
          .getByRole('button', { name: 'Roast' })
          .click(),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.dot?.bindings).toMatchObject({ fill: 'brand:roast' })
      },
    )
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () =>
        (await barMenu(page, 'colour'))
          .getByRole('group', { name: 'Brand colours' })
          .getByRole('button', { name: 'Berry' })
          .click(),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.bindings).toMatchObject({ fill: 'brand:berry' })
      },
    )
    await reloads(page)
  })

  row(30, 'fill list: add, remove, reorder, hide and show', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await fillList(page)
    await step(
      page,
      async () => card.getByRole('button', { name: 'Add fill' }).click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box')).length).toBe(2)
      },
    )
    // Top first: the new fill is the first row; moving it down puts it under the red.
    await expect(card.locator('[data-row]')).toHaveCount(2)
    await enter(card.getByRole('textbox', { name: 'Colour 1 hex' }), '2f6bff')
    await expect.poll(async () => (await fills(page, 'box'))[1]?.color).toBe('#2F6BFF33')
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('row-grip').press('ArrowDown'),
      async () => {
        await expect
          .poll(async () => (await fills(page, 'box')).map((f) => f.color))
          .toEqual(['#2F6BFF33', '#E0262BFF'])
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('paint-visible').click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[1]?.visible).toBe(false)
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('paint-visible').click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[1]?.visible ?? true).toBe(true)
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Remove fill 1' }).click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box')).map((f) => f.color)).toEqual(['#2F6BFF33'])
      },
    )
    await reloads(page)
  })

  row(31, 'paint kind: solid, linear, radial, angular, image', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await (await fillList(page)).locator('[data-row="1"]').getByTestId('paint-swatch').click()
    const editor = page.getByTestId('paint-editor')
    for (const [name, type] of [
      ['Line gradient', 'linear'],
      ['Circle gradient', 'radial'],
      ['Sweep gradient', 'angular'],
      ['Solid', 'solid'],
    ] as const) {
      await step(
        page,
        async () => editor.getByRole('radio', { name }).click(),
        async () => {
          await expect.poll(async () => (await fills(page, 'box'))[0]?.type).toBe(type)
        },
      )
    }
    await step(
      page,
      async () => {
        await editor.getByTestId('paint-image').click()
        await page.getByTestId('paint-image-picker').locator(`li[data-asset="${assets.tile}"] button`).click()
      },
      async () => {
        await expect
          .poll(async () => (await fills(page, 'box'))[0])
          .toMatchObject({ type: 'image', assetId: assets.tile })
      },
    )
    await reloads(page)
  })

  row(32, 'gradient stops, angle, centre and size', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await (await fillList(page)).locator('[data-row="1"]').getByTestId('paint-swatch').click()
    const editor = page.getByTestId('paint-editor')
    await editor.getByRole('radio', { name: 'Line gradient' }).click()
    const stops = async () => ((await fills(page, 'box'))[0]?.stops ?? []) as { offset: number; color: string }[]
    await expect.poll(async () => (await stops()).length).toBe(2)
    const bar = editor.getByTestId('gradient-bar')
    const box = await bar.boundingBox()
    await step(
      page,
      async () => page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * 0.5, (box?.y ?? 0) + (box?.height ?? 0) / 2),
      async () => {
        await expect.poll(async () => (await stops()).length).toBe(3)
      },
    )
    const offset = async () => (await stops()).map((s) => s.offset).sort()[1]
    const was = await offset()
    await step(
      page,
      async () => editor.locator('[data-stop="1"]').press('ArrowRight'),
      async () => {
        await expect.poll(offset).not.toBe(was)
      },
    )
    await step(
      page,
      async () => enter(editor.getByRole('textbox', { name: 'Stop 2 hex' }), '00a889'),
      async () => {
        await expect.poll(async () => (await stops()).some((s) => s.color.startsWith('#00A889'))).toBe(true)
      },
    )
    await step(
      page,
      async () => editor.getByRole('button', { name: 'Remove this stop' }).click(),
      async () => {
        await expect.poll(async () => (await stops()).length).toBe(2)
      },
    )
    const ends = async () => {
      const paint = (await fills(page, 'box'))[0]
      return JSON.stringify([paint?.from, paint?.to])
    }
    const along = await ends()
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient angle' }), '45'),
      async () => {
        await expect.poll(ends).not.toBe(along)
      },
    )
    await editor.getByRole('radio', { name: 'Circle gradient' }).click()
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient centre across' }), '20'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.center).toMatchObject({ x: 0.2 })
      },
    )
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient centre down' }), '70'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.center).toMatchObject({ x: 0.2, y: 0.7 })
      },
    )
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient size' }), '30'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.radius).toBe(0.3)
      },
    )
    await reloads(page)
  })

  row(33, 'colour hex and opacity of each paint', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await fillList(page)
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Colour 1 hex' }), '00a889'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.color).toBe('#00A889FF')
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Colour 1 opacity' }), '80'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.color).toBe('#00A889CC')
      },
    )
    await card.locator('[data-row="1"]').getByTestId('paint-swatch').click()
    await page.getByTestId('paint-editor').getByRole('radio', { name: 'Line gradient' }).click()
    await page.keyboard.press('Escape')
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Colour 1 opacity' }), '50'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.opacity).toBe(0.5)
      },
    )
    await reloads(page)
  })

  row(34, 'add an image into a shape', async (open) => {
    const page = await open()
    await selectLayers(page, ['dot'], { bar: true })
    await step(
      page,
      async () => {
        await (await barMenu(page, 'colour')).getByTestId('add-image').click()
        await page.getByTestId('add-image-picker').locator(`li[data-asset="${assets.tile}"] button`).click()
      },
      async () => {
        await expect
          .poll(async () => (await fills(page, 'dot')).at(-1))
          .toMatchObject({ type: 'image', assetId: assets.tile, fit: 'fill' })
      },
    )
    await reloads(page)
  })
})
