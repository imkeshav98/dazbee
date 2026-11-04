// The panels inventory's rows 35 to 42 (support/inventory.ts): strokes on a shape and a box,
// corners, polygon and star options, a line's ends, and combine.
import { reloads } from '../../support/editor.ts'
import { choose, enter } from '../../support/fields.ts'
import { doc, props, setupInventory, step } from '../../support/inventory.ts'
import { perform, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu, openCard, strokeList } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('shapes and frames', () => {
  row(35, 'stroke list: add, remove, reorder, several, on a shape and a box', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await strokeList(page)
    const strokes = async () => (await props(page, 'box')).strokes ?? []
    await step(
      page,
      async () => card.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await strokes()).length).toBe(1)
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await strokes()).length).toBe(2)
      },
    )
    // Top first: Outline 1 is the newest, drawn on top; a colour of its own shows which is on top.
    await enter(card.getByRole('spinbutton', { name: 'Outline 1 width' }), '12')
    await enter(card.getByRole('textbox', { name: 'Outline 1 colour hex' }), 'ff48b0')
    await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([2, 12])
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('row-grip').press('ArrowDown'),
      async () => {
        await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([12, 2])
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="2"]').getByTestId('row-grip').dragTo(card.locator('[data-row="1"]')),
      async () => {
        await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([2, 12])
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="2"]').getByTestId('row-grip').press('ArrowUp'),
      async () => {
        await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([12, 2])
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Remove outline 1' }).click(),
      async () => {
        await expect.poll(async () => (await strokes()).length).toBe(1)
      },
    )
    // A box's stroke list works the same.
    await page.keyboard.press('Escape')
    await selectLayers(page, ['plain'], { bar: true })
    const boxList = await strokeList(page)
    const boxStrokes = async () => (await props(page, 'plain')).strokes ?? []
    await step(
      page,
      async () => boxList.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await boxStrokes()).length).toBe(1)
      },
    )
    // The second stroke is the same as the first, so the box draws the same with one or two.
    await step(
      page,
      async () => boxList.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await boxStrokes()).length).toBe(2)
      },
      { draws: false },
    )
    await step(
      page,
      async () => boxList.getByRole('button', { name: 'Remove outline 1' }).click(),
      async () => {
        await expect.poll(async () => (await boxStrokes()).length).toBe(1)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(36, 'stroke paint, width, position, on a shape and a box', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await strokeList(page)
    await card.getByRole('button', { name: 'Add outline' }).click()
    const stroke = async () => (await props(page, 'box')).strokes?.[0] ?? {}
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Outline 1 colour hex' }), '2f6bff'),
      async () => {
        await expect.poll(stroke).toMatchObject({ paint: { type: 'solid', color: '#2F6BFFFF' } })
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Outline 1 width' }), '10'),
      async () => {
        await expect.poll(stroke).toMatchObject({ width: 10 })
      },
    )
    for (const align of ['inside', 'outside', 'center']) {
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: 'Outline 1 position' }), align),
        async () => {
          await expect.poll(stroke).toMatchObject({ align })
        },
      )
    }
    // A box takes strokes too, from its bar's Outline.
    await page.keyboard.press('Escape')
    await selectLayers(page, ['plain'], { bar: true })
    const outline = await strokeList(page)
    const boxStroke = async () => (await props(page, 'plain')).strokes?.[0] ?? {}
    await step(
      page,
      async () => outline.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).strokes ?? []).toHaveLength(1)
      },
    )
    await step(
      page,
      async () => enter(outline.getByRole('spinbutton', { name: 'Outline 1 width' }), '12'),
      async () => {
        await expect.poll(boxStroke).toMatchObject({ width: 12 })
      },
    )
    for (const align of ['outside', 'inside']) {
      await step(
        page,
        async () => choose(outline.getByRole('combobox', { name: 'Outline 1 position' }), align),
        async () => {
          await expect.poll(boxStroke).toMatchObject({ align })
        },
      )
    }
    await reloads(page)
  })

  row(37, 'dashes, dash offset, ends, corners, on a shape and a box', async (open) => {
    const page = await open()
    await selectLayers(page, ['poly'], { bar: true })
    const card = await strokeList(page)
    await card.getByRole('button', { name: 'Add outline' }).click()
    await enter(card.getByRole('spinbutton', { name: 'Outline 1 width' }), '16')
    const stroke = async () => (await props(page, 'poly')).strokes?.[0] ?? {}
    for (const join of ['round', 'bevel', 'miter']) {
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: 'Outline 1 corners' }), join),
        async () => {
          await expect.poll(stroke).toMatchObject({ join })
        },
      )
    }
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Outline 1 dashes' }), '30, 12'),
      async () => {
        await expect.poll(stroke).toMatchObject({ dashes: [30, 12] })
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Outline 1 dash offset' }), '9'),
      async () => {
        await expect.poll(stroke).toMatchObject({ dashOffset: 9 })
      },
    )
    for (const cap of ['round', 'square', 'butt']) {
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: 'Outline 1 ends' }), cap),
        async () => {
          await expect.poll(stroke).toMatchObject({ cap })
        },
      )
    }
    // A box's stroke takes dashes and corners the same.
    await page.keyboard.press('Escape')
    await selectLayers(page, ['plain'], { bar: true })
    const boxList = await strokeList(page)
    await boxList.getByRole('button', { name: 'Add outline' }).click()
    const boxStroke = async () => (await props(page, 'plain')).strokes?.[0] ?? {}
    await step(
      page,
      async () => enter(boxList.getByRole('textbox', { name: 'Outline 1 dashes' }), '20, 10'),
      async () => {
        await expect.poll(boxStroke).toMatchObject({ dashes: [20, 10] })
      },
    )
    await step(
      page,
      async () => choose(boxList.getByRole('combobox', { name: 'Outline 1 corners' }), 'round'),
      async () => {
        await expect.poll(boxStroke).toMatchObject({ join: 'round' })
      },
    )
    await reloads(page)
  })

  row(38, 'rectangle and box corners, each corner its own', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    await expect.soft((await card()).getByRole('heading')).toHaveText('Rectangle')
    const shape = async () => (await props(page, 'box')).shape as Record<string, unknown>
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Corners' }), '60'),
      async () => {
        await expect.poll(shape).toMatchObject({ cornerRadius: 60 })
      },
    )
    // Each corner starts at the radius all four had.
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(async () => (await shape()).corners).toEqual([60, 60, 60, 60])
      },
      { draws: false },
    )
    for (const [i, corner, radius] of [
      [0, 'Top left', 0],
      [1, 'Top right', 20],
      [2, 'Bottom right', 90],
      [3, 'Bottom left', 40],
    ] as const) {
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name: `${corner} radius` }), String(radius)),
        async () => {
          await expect.poll(async () => ((await shape()).corners as number[])[i]).toBe(radius)
        },
      )
    }
    // Back to one radius: the top left's, and the corners go.
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Top left radius' }), '30'),
      async () => {
        await expect.poll(async () => ((await shape()).corners as number[])[0]).toBe(30)
      },
    )
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(shape).toEqual({ kind: 'rect', cornerRadius: 30 })
      },
    )
    // A box has the same corners, in its Box card.
    await selectLayers(page, ['plain'], { bar: true })
    const box = async () => await openCard(page, 'frame-card')
    await step(
      page,
      async () => enter((await box()).getByRole('spinbutton', { name: 'Corners' }), '50'),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toBe(50)
      },
    )
    await step(
      page,
      async () => (await box()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toEqual([50, 50, 50, 50])
      },
      { draws: false },
    )
    await step(
      page,
      async () => enter((await box()).getByRole('spinbutton', { name: 'Top right radius' }), '0'),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toEqual([50, 0, 50, 50])
      },
    )
    // Back to one radius: the top left's.
    await step(
      page,
      async () => (await box()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toBe(50)
      },
    )
    await reloads(page)
  })

  row(39, 'polygon sides and corners', async (open) => {
    const page = await open()
    await selectLayers(page, ['poly'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    await expect.soft((await card()).getByRole('heading')).toHaveText('Polygon')
    const shape = async () => (await props(page, 'poly')).shape
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Sides' }), '8'),
      async () => {
        await expect.poll(shape).toMatchObject({ sides: 8 })
      },
    )
    // Sides are at least three: Home takes them there.
    await step(
      page,
      async () => (await card()).getByRole('spinbutton', { name: 'Sides' }).press('Home'),
      async () => {
        await expect.poll(shape).toMatchObject({ sides: 3 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Corners' }), '20'),
      async () => {
        await expect.poll(shape).toMatchObject({ cornerRadius: 20 })
      },
    )
    await reloads(page)
  })

  row(40, 'star points, inner, corners', async (open) => {
    const page = await open()
    await selectLayers(page, ['star'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    const shape = async () => (await props(page, 'star')).shape
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Points' }), '8'),
      async () => {
        await expect.poll(shape).toMatchObject({ points: 8 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Inner' }), '70'),
      async () => {
        await expect.poll(shape).toMatchObject({ innerRadius: 0.7 })
      },
    )
    // The arrow keys step the points by one and the inner radius by a percent, as it shows.
    await step(
      page,
      async () => (await card()).getByRole('spinbutton', { name: 'Points' }).press('ArrowUp'),
      async () => {
        await expect.soft.poll(shape).toMatchObject({ points: 9 })
      },
    )
    await step(
      page,
      async () => (await card()).getByRole('spinbutton', { name: 'Inner' }).press('ArrowUp'),
      async () => {
        await expect.soft.poll(shape).toMatchObject({ innerRadius: 0.71 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Corners' }), '10'),
      async () => {
        await expect.poll(shape).toMatchObject({ cornerRadius: 10 })
      },
    )
    // A rectangle and a star selected together have no Shape pop-up.
    await selectLayers(page, ['box', 'star'], { bar: true })
    await expect.soft(page.getByTestId('bar-shape')).toHaveCount(0)
    await reloads(page)
  })

  row(41, 'line start and end', async (open) => {
    const page = await open()
    await selectLayers(page, ['rule'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    const shape = async () => (await props(page, 'rule')).shape
    for (const end of ['arrow', 'triangle', 'circle']) {
      await step(
        page,
        async () => choose((await card()).getByRole('combobox', { name: 'Line start' }), end),
        async () => {
          await expect.poll(shape).toMatchObject({ start: end })
        },
      )
    }
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Line end' }), 'arrow'),
      async () => {
        await expect.poll(shape).toMatchObject({ end: 'arrow' })
      },
    )
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Line start' }), 'none'),
      async () => {
        await expect.poll(shape).toMatchObject({ start: 'none' })
      },
    )
    await reloads(page)
  })

  row(42, 'combine: union, subtract, intersect, exclude', async (open) => {
    const page = await open()
    for (const op of ['union', 'subtract', 'intersect', 'exclude']) {
      await selectLayers(page, ['box', 'poly'], { bar: true })
      // A union of two shapes that don't overlap draws the same two shapes.
      // Combine is on the bar by several layers.
      await step(
        page,
        async () =>
          (await barMenu(page, 'combine'))
            .locator(`[data-action="boolean${op[0]?.toUpperCase() + op.slice(1)}"]`)
            .click(),
        async () => {
          await expect
            .poll(async () => {
              const d = await doc(page)
              const parent = d.nodes[d.nodes.box?.parentId ?? '']
              return [parent?.type, parent?.props.op]
            })
            .toEqual(['boolean', op])
        },
        { draws: op !== 'union' },
      )
      if (op !== 'exclude') await perform(page, 'undo')
    }
    await reloads(page)
  })
})
