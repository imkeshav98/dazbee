// The panels inventory's rows 3 to 11 (support/inventory.ts): what every selection has. X, Y, W
// and H, rotation, opacity, blend mode, mixed values, the effects, and the arrange actions.
import { reloads } from '../../support/editor.ts'
import { choose, enter } from '../../support/fields.ts'
import { doc, fills, props, setupInventory, solid, step, style } from '../../support/inventory.ts'
import { perform, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { arrangeMenu, barMenu, fillList, moreAction, openCard } from '../../support/top-bar.ts'

const row = setupInventory()

const children = async (page: Page, parentId: string) =>
  Object.entries((await doc(page)).nodes)
    .filter(([, n]) => n.parentId === parentId)
    .sort(([, a], [, b]) => (a.index < b.index ? -1 : 1))
    .map(([id]) => id)

test.describe('every selection', () => {
  row(3, 'X, Y, W, H', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = async () => await openCard(page, 'layout-card')
    for (const [name, key, value] of [
      ['X position', 'x', 140],
      ['Y position', 'y', 120],
      ['Width', 'width', 320],
      ['Height', 'height', 220],
    ] as const) {
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name }), String(value)),
        async () => {
          await expect.poll(async () => (await props(page, 'box'))[key]).toBe(value)
        },
      )
    }
    await reloads(page)
  })

  row(4, 'rotation', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () => enter((await arrangeMenu(page)).getByRole('spinbutton', { name: 'Rotation in degrees' }), '15'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).rotation).toBe(15)
      },
    )
    await reloads(page)
  })

  row(5, 'opacity', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () => enter((await openCard(page, 'appearance-card')).getByRole('spinbutton', { name: 'Opacity' }), '50'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).opacity).toBe(0.5)
      },
    )
    await reloads(page)
  })

  row(6, 'blend mode, pass-through for groups and boxes', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const blend = async () => (await openCard(page, 'appearance-card')).getByRole('combobox', { name: 'Blend mode' })
    await step(
      page,
      async () => choose(await blend(), 'difference'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).blendMode).toBe('difference')
      },
    )
    await (await blend()).click()
    await expect(page.locator('[role="listbox"] [role="option"]')).toHaveCount(16)
    await page.keyboard.press('Escape')
    // A box starts as pass-through, which only groups and boxes are offered.
    await selectLayers(page, ['stack'], { bar: true })
    await expect(await blend()).toHaveAttribute('data-value', 'pass-through')
    await (await blend()).click()
    await expect(page.locator('[role="listbox"] [role="option"]')).toHaveCount(17)
    await page.keyboard.press('Escape')
    // Over a white page, the stack draws the same blended as a whole or layer by layer.
    await step(
      page,
      async () => choose(await blend(), 'normal'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).blendMode).toBe('normal')
      },
      { draws: false },
    )
    await step(
      page,
      async () => choose(await blend(), 'pass-through'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).blendMode).toBe('pass-through')
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(7, 'mixed values on a multi-selection', async (open) => {
    const page = await open()
    await selectLayers(page, ['box', 'dot'], { bar: true })
    const x = async () => (await openCard(page, 'layout-card')).getByRole('spinbutton', { name: 'X position' })
    await expect(await x()).toHaveValue('')
    await expect(await x()).toHaveAttribute('placeholder', 'Mixed')
    await expect(await fillList(page)).toContainText('The selected layers differ.')
    await step(
      page,
      async () => (await x()).press('ArrowUp'),
      async () => {
        await expect.poll(async () => [(await props(page, 'box')).x, (await props(page, 'dot')).x]).toEqual([81, 701])
      },
    )
    await step(
      page,
      async () => (await fillList(page)).getByRole('button', { name: 'Use one for all' }).click(),
      async () => {
        await expect
          .poll(async () => [await fills(page, 'box'), await fills(page, 'dot')])
          .toEqual([solid('#D9D9D9FF'), solid('#D9D9D9FF')])
      },
    )
    await reloads(page)
  })

  row(8, 'effect tiles: none, shadow, glow, blur, outline', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const tiles = await barMenu(page, 'effects')
    const types = async () => ((await props(page, 'box')).effects ?? []).map((e) => e.type)
    await step(
      page,
      async () => tiles.locator('[data-tile="dropShadow"]').click(),
      async () => {
        await expect.poll(types).toEqual(['dropShadow'])
      },
    )
    await step(
      page,
      async () => tiles.locator('[data-tile="glow"]').click(),
      async () => {
        await expect.poll(types).toEqual(['dropShadow', 'glow'])
      },
    )
    await step(
      page,
      async () => tiles.locator('[data-tile="layerBlur"]').click(),
      async () => {
        await expect.poll(types).toEqual(['dropShadow', 'glow', 'layerBlur'])
      },
    )
    await step(
      page,
      async () => tiles.locator('[data-tile="none"]').click(),
      async () => {
        await expect.poll(types).toEqual([])
      },
    )
    // Text has its tiles in the bar's Effects.
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => (await barMenu(page, 'effects')).locator('[data-tile="outline"]').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toMatchObject({ width: 2 })
      },
    )
    await reloads(page)
  })

  row(9, 'add effect: drop shadow, inner shadow, glow, layer blur, background blur', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await barMenu(page, 'effects')
    const added: string[] = []
    for (const type of ['dropShadow', 'innerShadow', 'glow', 'layerBlur', 'backgroundBlur']) {
      added.push(type)
      const want = [...added]
      // A background blur blurs what is behind the box: the white page, which looks the same.
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), type),
        async () => {
          await expect.poll(async () => ((await props(page, 'box')).effects ?? []).map((e) => e.type)).toEqual(want)
        },
        { draws: type !== 'backgroundBlur' },
      )
    }
    await reloads(page)
  })

  row(10, 'each effect: X, Y, blur, spread, radius, colour, remove, several', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await barMenu(page, 'effects')
    const effects = async () => (await props(page, 'box')).effects ?? []
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'dropShadow')
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'dropShadow')
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'glow')
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'layerBlur')
    await expect.poll(async () => (await effects()).length).toBe(4)
    for (const [field, key, value] of [
      ['X', 'x', 30],
      ['Y', 'y', -20],
      ['Blur', 'blur', 40],
      ['Spread', 'spread', 12],
    ] as const) {
      await step(
        page,
        async () => enter(card.getByRole('spinbutton', { name: `Drop shadow 1 ${field}` }), String(value)),
        async () => {
          await expect.poll(async () => (await effects())[0]?.[key]).toBe(value)
        },
      )
    }
    // The second shadow has its own numbers and colour.
    const second = card.locator('[data-item="effects-1"]')
    await step(
      page,
      async () => enter(second.getByRole('spinbutton', { name: 'Drop shadow 2 Blur' }), '8'),
      async () => {
        await expect.poll(async () => (await effects())[1]?.blur).toBe(8)
      },
    )
    await step(
      page,
      async () => enter(second.getByRole('textbox', { name: /hex$/ }), '2f6bff'),
      async () => {
        await expect.poll(async () => String((await effects())[1]?.color)).toMatch(/^#2F6BFF/)
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Glow 3 Spread' }), '10'),
      async () => {
        await expect.poll(async () => (await effects())[2]?.spread).toBe(10)
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Layer blur 4 Radius' }), '6'),
      async () => {
        await expect.poll(async () => (await effects())[3]?.radius).toBe(6)
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Remove drop shadow 1' }).click(),
      async () => {
        await expect.poll(async () => (await effects()).map((e) => e.type)).toEqual(['dropShadow', 'glow', 'layerBlur'])
      },
    )
    await reloads(page)
  })

  row(11, 'arrange: duplicate, order, group, ungroup, put in a box, use as mask', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    // Several layers group by their key and go in a box from the full menu.
    // One layer's actions are in the full menu, and its order in the top bar's Arrange ⋯.
    const more = (name: string) => moreAction(page, name)
    const sit = async (name: string) => moreAction(page, name, await arrangeMenu(page))
    await step(
      page,
      async () => more('Duplicate'),
      async () => {
        await expect.poll(async () => (await children(page, 'sq')).length).toBe(10)
      },
    )
    await perform(page, 'undo')
    await selectLayers(page, ['box'], { bar: true })
    // The box overlaps nothing, so its place in the order changes only the document.
    const at = async () => (await children(page, 'sq')).indexOf('box')
    await step(
      page,
      async () => sit('Bring to front'),
      async () => {
        await expect.poll(at).toBe(8)
      },
      { draws: false },
    )
    await step(
      page,
      async () => sit('Send backward'),
      async () => {
        await expect.poll(at).toBe(7)
      },
      { draws: false },
    )
    await step(
      page,
      async () => sit('Send to back'),
      async () => {
        await expect.poll(at).toBe(0)
      },
      { draws: false },
    )
    await step(
      page,
      async () => sit('Bring forward'),
      async () => {
        await expect.poll(at).toBe(1)
      },
      { draws: false },
    )
    await step(
      page,
      async () => more('Use as mask'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).mask).toBe('alpha')
      },
    )
    await perform(page, 'undo')
    await selectLayers(page, ['box', 'poly'], { bar: true })
    await step(
      page,
      async () => page.keyboard.press('Control+KeyG'),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.parentId).not.toBe('sq')
      },
      { draws: false },
    )
    const group = (await doc(page)).nodes.box?.parentId ?? ''
    await selectLayers(page, [group], { bar: true })
    await step(
      page,
      async () => page.keyboard.press('Control+Shift+KeyG'),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.parentId).toBe('sq')
      },
      { draws: false },
    )
    await selectLayers(page, ['box', 'poly'], { bar: true })
    await step(
      page,
      async () => more('Put in a box'),
      async () => {
        await expect
          .poll(async () => {
            const d = await doc(page)
            return d.nodes[d.nodes.box?.parentId ?? '']?.type
          })
          .toBe('box')
      },
      { draws: false },
    )
    await reloads(page)
  })
})
