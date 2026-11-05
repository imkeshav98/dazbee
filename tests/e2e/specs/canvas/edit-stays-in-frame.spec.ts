// Every edit stays in the frame it is made in, in Chromium with real input, on the canvas and by the
// top bar and its panels; the design and the check are support/edit-in-frame.ts's. The same check
// by shortcut, in the layers panel and for deleting a frame is edit-stays-in-frame-keys.spec.ts.
import { added, editInSquare, propsOf, solid } from '../../support/edit-in-frame.ts'
import { screenPoint } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { drag, drawn, handle, press, read, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { fillList, moreAction } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

test.describe('on the canvas', () => {
  test('dragging a layer moves it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      (a) => drag(a, { x: 200, y: 180 }, { x: 300, y: 230 }),
      (_, after) => expect(propsOf(after, 'shape')).toMatchObject({ x: 200, y: 150, width: 200, height: 160 }),
    )
  })

  test('resizing a layer by its corner sizes it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await drawn(a)
        const at = await handle(a, 'se')
        await a.mouse.move(at.x, at.y)
        await a.mouse.down()
        await a.mouse.move(at.x + 20, at.y + 16)
        await a.mouse.move(at.x + 40, at.y + 32, { steps: 4 })
        await a.mouse.up()
        await drawn(a)
      },
      (_, after) => expect(propsOf(after, 'shape')).toMatchObject({ x: 100, y: 100, width: 250, height: 200 }),
    )
  })

  test('turning a layer by its corner turns it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await drawn(a)
        const at = await handle(a, 'ne')
        await a.mouse.move(at.x + 12, at.y - 12)
        await a.mouse.down()
        await a.mouse.move(at.x + 26, at.y + 8)
        await a.mouse.move(at.x + 40, at.y + 30, { steps: 4 })
        await a.mouse.up()
        await drawn(a)
      },
      (_, after) => expect(Math.abs(Number(propsOf(after, 'shape').rotation ?? 0))).toBeGreaterThan(5),
    )
  })

  test('typing into a text changes it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        // Past the end of the headline's one line, inside its box.
        const end = await screenPoint(a, 990, 860)
        await a.mouse.dblclick(end.x, end.y)
        await expect(a.locator('.caret')).toBeVisible()
        await a.keyboard.press('End')
        await a.keyboard.type(' now')
        await a.keyboard.press('Escape')
        await drawn(a)
      },
      (_, after) => expect(propsOf(after, 'headline').text).toBe('Summer sale now'),
    )
  })

  test('drawing a layer adds it to the frame drawn in only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await press(a, 'toolRect')
        await drag(a, { x: 700, y: 560 }, { x: 900, y: 700 })
      },
      (before, after) => {
        const made = added(before, after)
        expect(made).toHaveLength(1)
        expect(made[0]?.[1]).toMatchObject({
          parentId: 'sq',
          props: { x: 700, y: 560, width: 200, height: 140 },
        })
      },
    )
  })

  test('pasting a layer into its own frame adds a new layer there only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await a.evaluate(() => localStorage.removeItem('dazbee.copiedLayers'))
        await selectLayers(a, ['shape'])
        await a.keyboard.press('Control+KeyC')
        await a.keyboard.press('Control+KeyV')
        await drawn(a)
      },
      (before, after) => {
        const made = added(before, after)
        expect(made).toHaveLength(1)
        const [, copy] = made[0] ?? []
        expect(copy).toMatchObject({ type: 'graphic', name: 'Shape', parentId: 'sq' })
        // A paste into the frame it came from makes a new layer, linked to nothing.
        const links = Object.values(before.nodes).map((n) => n.link)
        expect(links).not.toContain(copy?.link)
      },
    )
  })
})

test.describe('the top bar and its panels', () => {
  test("a top bar change, the text's font size, sets it in its frame only", async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['headline'], { bar: true })
        await a.getByTestId('bar-size-field').fill('40')
        await a.getByTestId('bar-size-field').press('Enter')
        await expect
          .poll(async () => (propsOf(await read(a), 'headline').style as { fontSize: number }).fontSize)
          .toBe(40)
        await a.keyboard.press('Escape')
      },
      (_, after) => expect(propsOf(after, 'headline').style).toMatchObject({ fontSize: 40, fontWeight: 800 }),
    )
  })

  test("a panel change, the shape's fill, sets it in its frame only", async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'], { bar: true })
        await enter((await fillList(a)).getByRole('textbox', { name: 'Colour 1 hex' }), '14213d')
        await expect
          .poll(async () => (propsOf(await read(a), 'shape').fills as { color: string }[])[0]?.color)
          .toBe('#14213DFF')
        await a.keyboard.press('Escape')
      },
      (_, after) => expect(propsOf(after, 'shape').fills).toEqual(solid('#14213DFF')),
    )
  })

  test('using a layer as a mask from the full menu masks it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['dot'], { bar: true })
        await moreAction(a, 'Use as mask')
      },
      (_, after) => expect(propsOf(after, 'dot').mask).toBe('alpha'),
    )
  })

  test('hiding a layer from the small menu hides it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'], { bar: true })
        await a.getByTestId('small-hide').click()
        await expect(a.getByTestId('small-hide')).toHaveAttribute('aria-pressed', 'true')
      },
      (_, after) => expect(propsOf(after, 'shape').visible).toBe(false),
    )
  })

  test('locking a layer from the small menu locks it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'], { bar: true })
        await a.getByTestId('small-lock').click()
        await expect(a.getByTestId('small-lock')).toHaveAttribute('aria-pressed', 'true')
      },
      (_, after) => expect(Object.values(after.nodes.shape?.lock ?? {}).some(Boolean)).toBe(true),
    )
  })
})
