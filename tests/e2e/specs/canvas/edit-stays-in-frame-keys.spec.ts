// Every edit stays in the frame it is made in, in Chromium with real input, by shortcut and in the
// layers panel, and deleting a frame leaves the layers of every other frame; the design and the
// check are support/edit-in-frame.ts's.
import { added, editInSquare, inFrame, propsOf } from '../../support/edit-in-frame.ts'
import { openLayers, row, tree } from '../../support/layers-panel.ts'
import { copyIn } from '../../support/seed.ts'
import { press, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

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

test('deleting the square frame deletes its layers; their copies in the story and the poster stay', async ({
  browser,
}) => {
  await editInSquare(
    browser,
    (a) => a.evaluate(() => void window.dazbee?.session.run('frame.delete', { frameId: 'sq' })),
    (before, after) => {
      expect(after.frames.sq).toBeUndefined()
      expect(Object.keys(inFrame(after, 'sq').layers)).toEqual([])
      const others = [...Object.keys(inFrame(before, 'story').layers), ...Object.keys(inFrame(before, 'poster').layers)]
      expect(Object.keys(after.nodes).sort()).toEqual(others.sort())
    },
  )
})
