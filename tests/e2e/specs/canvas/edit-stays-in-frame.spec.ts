// Every edit stays in the frame it is made in (#450, Editing), in Chromium with real input. A page
// holds two linked frames, a square `sq` and a story `story` holding a copy of every layer of the
// square: a shape, a dot, a group, a box with auto layout, a masked group and a text. Each kind of
// edit is made in the square: the story's copies are stored exactly as they were, the square's
// layer changed as asked, one undo puts the design back, and a second tab has the change.
import { designOf, openTabs, screenPoint } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { openLayers, row, tree } from '../../support/layers-panel.ts'
import { copyIn, frameDesign, layersIn, linkedFrames, seed } from '../../support/seed.ts'
import { type Design, drag, drawn, handle, perform, press, read, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'
import { fillList, moreAction } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const },
  fills: solid(color),
})

/** The square's layers, and their linked copies in a story where the headline sits lower. */
const design = () =>
  linkedFrames(
    frameDesign({
      name: 'Edit stays in its frame',
      nodes: {
        shape: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a0',
          name: 'Shape',
          props: rect(100, 100, 200, 160, '#E0262BFF'),
        },
        dot: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a1',
          name: 'Dot',
          props: { ...rect(400, 100, 160, 160, '#2F6BFFFF'), shape: { kind: 'ellipse' } },
        },
        group: {
          type: 'group',
          parentId: 'sq',
          index: 'a2',
          name: 'Group',
          props: { x: 100, y: 340, width: 360, height: 120 },
        },
        g1: {
          type: 'graphic',
          parentId: 'group',
          index: 'a0',
          name: 'G1',
          props: rect(100, 340, 160, 120, '#FCA311FF'),
        },
        g2: {
          type: 'graphic',
          parentId: 'group',
          index: 'a1',
          name: 'G2',
          props: rect(300, 340, 160, 120, '#2A9D8FFF'),
        },
        card: {
          type: 'box',
          parentId: 'sq',
          index: 'a3',
          name: 'Card',
          props: {
            x: 560,
            y: 340,
            width: 400,
            height: 160,
            fills: solid('#EEF1F6FF'),
            layout: { direction: 'row', gap: 20, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
          },
        },
        c1: { type: 'graphic', parentId: 'card', index: 'a0', name: 'C1', props: rect(0, 0, 80, 80, '#9747FFFF') },
        c2: { type: 'graphic', parentId: 'card', index: 'a1', name: 'C2', props: rect(0, 0, 80, 80, '#13C4A3FF') },
        masks: {
          type: 'group',
          parentId: 'sq',
          index: 'a4',
          name: 'Masked group',
          props: { x: 100, y: 560, width: 300, height: 200 },
        },
        mask: {
          type: 'graphic',
          parentId: 'masks',
          index: 'a0',
          name: 'Mask',
          props: { ...rect(100, 560, 200, 200, '#000000FF'), shape: { kind: 'ellipse' }, mask: 'alpha' },
        },
        masked: {
          type: 'graphic',
          parentId: 'masks',
          index: 'a1',
          name: 'Masked',
          props: rect(100, 560, 300, 200, '#00A88AFF'),
        },
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a5',
          name: 'Headline',
          props: {
            x: 80,
            y: 820,
            width: 920,
            height: 120,
            text: 'Summer sale',
            style: { fontFamily: 'Noto Sans', fontSize: 80, fontWeight: 800, color: '#111111FF' },
          },
        },
      },
    }),
    [{ id: 'story', name: 'Story', width: 1080, height: 1920, values: { headline: { y: 1500 } } }],
  )

/** What a frame is: the frame as stored, and every layer it holds, by id. */
function inFrame(d: Design, frameId: string) {
  return { frame: d.frames[frameId], layers: Object.fromEntries(layersIn(d, frameId)) }
}
/** The square's layers made since `before`. */
const added = (before: Design, after: Design) =>
  Object.entries(after.nodes).filter(([id]) => !before.nodes[id] && inFrame(after, 'sq').layers[id])

/** Waits until both tabs have sent every change and hold the same design. */
async function bothHave(a: Page, b: Page) {
  await expect
    .poll(
      async () => {
        const synced = await Promise.all([a, b].map((t) => t.evaluate(() => window.dazbee?.synced() ?? false)))
        return synced.every(Boolean) && (await designOf(a)) === (await designOf(b))
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

/**
 * Opens a fresh copy of the design in two tabs, the first 1440 × 1000 with its camera where design
 * pixels in steps of 5 land on whole screen pixels and snapping off, so drags measure exactly. Its
 * fonts are loaded and both tabs agree before it returns, so a text fitted to its font is no edit.
 */
async function open(browser: Browser) {
  const { tabs, errors } = await openTabs(browser, 2, await seed(design()))
  const [a, b] = tabs as [Page, Page]
  await a.setViewportSize({ width: 1440, height: 1000 })
  await a.evaluate(async () => {
    window.dazbee?.setSnapping(false)
    window.dazbee?.setCamera({ x: 100, y: 60, zoom: 0.8 })
    await window.dazbee?.loaded()
  })
  await drawn(a)
  await bothHave(a, b)
  return { a, b, errors }
}

/**
 * Makes one edit in the square of the first tab and checks it stayed there: the story's frame and
 * copies are stored as they were, `check` sees the change asked for, the second tab has it, and one
 * undo puts the design back.
 */
async function editInSquare(
  browser: Browser,
  act: (a: Page) => Promise<void>,
  check: (before: Design, after: Design) => void,
) {
  const { a, b, errors } = await open(browser)
  const json = await designOf(a)
  const before = JSON.parse(json) as Design
  await act(a)
  await bothHave(a, b)
  const after = await read(a)
  expect(after, 'the edit changed the design').not.toEqual(before)
  expect(inFrame(after, 'story'), 'the copies in the story as they were').toEqual(inFrame(before, 'story'))
  check(before, after)
  expect(await read(b), 'the second tab has the change').toEqual(after)
  await perform(a, 'undo')
  await expect.poll(() => designOf(a), { message: 'one undo puts it back' }).toBe(json)
  await bothHave(a, b)
  expect(errors).toEqual([])
}

const propsOf = (d: Design, id: string) => d.nodes[id]?.props as Record<string, unknown>

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

  test('hiding a layer from the full menu hides it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'], { bar: true })
        await moreAction(a, 'Hide')
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

test.describe('shortcuts', () => {
  test('grouping layers groups them in their frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape', 'dot'])
        await press(a, 'group')
      },
      (before, after) => {
        const made = added(before, after)
        expect(made).toHaveLength(1)
        const [group = ''] = made[0] ?? []
        expect(after.nodes[group]).toMatchObject({ parentId: 'sq' })
        expect([after.nodes.shape?.parentId, after.nodes.dot?.parentId]).toEqual([group, group])
      },
    )
  })

  test('ungrouping a group lets its layers go in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['group'])
        await press(a, 'ungroup')
      },
      (_, after) => {
        expect(after.nodes.group).toBeUndefined()
        expect([after.nodes.g1?.parentId, after.nodes.g2?.parentId]).toEqual(['sq', 'sq'])
      },
    )
  })

  test('putting a layer in a box boxes it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await press(a, 'boxSelection')
      },
      (before, after) => {
        const [[box = '', node] = []] = added(before, after)
        expect(node).toMatchObject({ type: 'box', parentId: 'sq' })
        expect(after.nodes.shape?.parentId).toBe(box)
      },
    )
  })

  test('bringing a layer to the front orders it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await press(a, 'bringToFront')
      },
      (_, after) => {
        const top = Object.entries(after.nodes)
          .filter(([, n]) => n.parentId === 'sq')
          .sort(([, x], [, y]) => (x.index < y.index ? -1 : 1))
          .map(([id]) => id)
        expect(top.at(-1)).toBe('shape')
      },
    )
  })

  test('deleting a layer takes it out of its frame; its copy stays', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await press(a, 'delete')
      },
      (_, after) => {
        expect(after.nodes.shape).toBeUndefined()
        expect(after.nodes[copyIn('story', 'shape')]).toBeDefined()
      },
    )
  })

  test('hiding a layer with its shortcut hides it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await press(a, 'hide')
      },
      (_, after) => expect(propsOf(after, 'shape').visible).toBe(false),
    )
  })

  test('locking a layer with its shortcut locks it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await selectLayers(a, ['shape'])
        await press(a, 'lock')
      },
      (_, after) => expect(Object.values(after.nodes.shape?.lock ?? {}).some(Boolean)).toBe(true),
    )
  })
})

test.describe('the layers panel', () => {
  test('renaming a layer renames it in its frame only', async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await openLayers(a)
        await row(a, 'Shape').dblclick()
        const field = tree(a).getByRole('textbox', { name: 'Name of Shape' })
        await expect(field).toBeFocused()
        await field.fill('Badge')
        await field.press('Enter')
      },
      (_, after) => expect(after.nodes.shape?.name).toBe('Badge'),
    )
  })

  test("hiding a layer with its row's eye hides it in its frame only", async ({ browser }) => {
    await editInSquare(
      browser,
      async (a) => {
        await openLayers(a)
        await row(a, 'Shape').hover()
        await row(a, 'Shape').getByRole('button', { name: 'Hide Shape' }).click()
      },
      (_, after) => expect(propsOf(after, 'shape').visible).toBe(false),
    )
  })
})

test('deleting the square frame deletes its layers; their copies in the story stay', async ({ browser }) => {
  await editInSquare(
    browser,
    (a) => a.evaluate(() => void window.dazbee?.session.run('frame.delete', { frameId: 'sq' })),
    (before, after) => {
      expect(after.frames.sq).toBeUndefined()
      expect(Object.keys(inFrame(after, 'sq').layers)).toEqual([])
      expect(Object.keys(after.nodes).sort()).toEqual(Object.keys(inFrame(before, 'story').layers).sort())
    },
  )
})
