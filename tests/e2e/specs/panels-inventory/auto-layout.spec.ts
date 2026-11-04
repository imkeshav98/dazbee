import { reloads } from '../../support/editor.ts'
import { choose, enter } from '../../support/fields.ts'
import { props, setupInventory, step } from '../../support/inventory.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { openCard } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('frames and auto layout', () => {
  const layout = async (page: Page, id = 'stack') =>
    (await props(page, id)).layout as Record<string, unknown> | undefined
  /** The Line up pad's cell that lines up along the flow at `justify` and across it at `align`. */
  const cell = async (page: Page, justify: unknown, align: unknown) =>
    (await openCard(page, 'auto-layout-advanced')).locator(`[data-justify="${justify}"][data-align="${align}"]`)

  row(50, 'add auto layout', async (open) => {
    const page = await open()
    await selectLayers(page, ['plain'], { bar: true })
    await step(
      page,
      async () => (await openCard(page, 'auto-layout-card')).getByRole('switch', { name: 'Stack' }).click(),
      async () => {
        await expect.poll(() => layout(page, 'plain')).toBeTruthy()
      },
    )
    await reloads(page)
  })

  row(51, 'direction and wrap', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-card')
    await step(
      page,
      async () => (await card()).getByRole('radio', { name: 'Column' }).click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ direction: 'column' })
      },
    )
    await (await card()).getByRole('radio', { name: 'Row' }).click()
    await enter((await card()).getByRole('spinbutton', { name: 'Room between' }), '400')
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Wrap onto more lines' }).click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ wrap: true })
      },
    )
    await reloads(page)
  })

  row(52, 'gap', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    await step(
      page,
      async () =>
        enter((await openCard(page, 'auto-layout-card')).getByRole('spinbutton', { name: 'Room between' }), '48'),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ gap: 48 })
      },
    )
    await reloads(page)
  })

  row(53, 'padding, four sides', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-advanced')
    for (const side of ['top', 'right', 'bottom', 'left']) {
      // The stack is wider than its row: padding on the end side moves nothing.
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name: `Room at the ${side}` }), '8'),
        async () => {
          await expect.poll(async () => ((await layout(page))?.padding as Record<string, number>)[side]).toBe(8)
        },
        { draws: side === 'top' || side === 'left' },
      )
    }
    await reloads(page)
  })

  row(54, 'distribute: start, centre, end, space between', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const { align } = (await layout(page)) ?? {}
    for (const justify of ['center', 'end']) {
      await step(
        page,
        async () => (await cell(page, justify, align)).click(),
        async () => {
          await expect.poll(() => layout(page)).toMatchObject({ justify, align })
        },
      )
    }
    const spread = async () =>
      (await openCard(page, 'auto-layout-card')).getByRole('radiogroup', { name: 'Spread out' })
    await step(
      page,
      async () => (await spread()).locator('[data-value="between"]').click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ justify: 'space-between' })
      },
    )
    // Together again, the stack lines up from the start.
    await step(
      page,
      async () => (await spread()).locator('[data-value="packed"]').click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ justify: 'start' })
      },
    )
    await reloads(page)
  })

  row(55, 'align: start, centre, end', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-advanced')
    await enter((await card()).getByRole('spinbutton', { name: 'Room at the top' }), '0')
    await enter((await card()).getByRole('spinbutton', { name: 'Room at the bottom' }), '0')
    const { justify } = (await layout(page)) ?? {}
    for (const align of ['center', 'end', 'start']) {
      await step(
        page,
        async () => (await cell(page, justify, align)).click(),
        async () => {
          await expect.poll(() => layout(page)).toMatchObject({ align, justify })
        },
      )
    }
    await reloads(page)
  })

  row(56, "the frame's own sizing", async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-advanced')
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Width sizing' }), 'hug'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).sizing).toMatchObject({ width: 'hug' })
      },
    )
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Width sizing' }), 'fixed'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).sizing).toMatchObject({ width: 'fixed' })
      },
      { draws: false },
    )
    // Its height is already what its chips need, so hug draws it the same.
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Height sizing' }), 'hug'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).sizing).toMatchObject({ height: 'hug' })
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(57, "a child's sizing", async (open) => {
    const page = await open()
    await selectLayers(page, ['chip1'], { bar: true })
    const card = async () => await openCard(page, 'flow-card')
    const pick = async (axis: 'Width' | 'Height', sizing: string) =>
      choose((await card()).getByRole('combobox', { name: `${axis} sizing` }), sizing)
    await step(
      page,
      async () => pick('Width', 'fill'),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).sizing).toMatchObject({ width: 'fill' })
      },
    )
    // Fixed keeps the width fill gave it; hug, with nothing inside, keeps it too.
    for (const sizing of ['fixed', 'hug']) {
      await step(
        page,
        async () => pick('Width', sizing),
        async () => {
          await expect.poll(async () => (await props(page, 'chip1')).sizing).toMatchObject({ width: sizing })
        },
        { draws: false },
      )
    }
    // The chip is already as tall as the stack's inside.
    await step(
      page,
      async () => pick('Height', 'fill'),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).sizing).toMatchObject({ height: 'fill' })
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(58, 'a child kept where it is, out of the flow', async (open) => {
    const page = await open()
    await selectLayers(page, ['chip1'], { bar: true })
    const box = async () => (await openCard(page, 'flow-card')).getByRole('switch', { name: 'Keep where I put it' })
    // Out of the flow, Chip 2 moves up to where Chip 1 was.
    await step(
      page,
      async () => (await box()).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).absolute).toBe(true)
      },
    )
    await step(
      page,
      async () => (await box()).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).absolute).toBeFalsy()
      },
    )
    await reloads(page)
  })
})
