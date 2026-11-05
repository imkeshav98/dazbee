// The small menu, its ⋯ (the full menu) and the right-click menu, and paste across frames, in
// Chromium (#456): the small menu acts on this frame; the full menu's Copy ▸ and Paste ▸ take the
// layers or their style; Copy to other frames ▸ writes a style, a text or the layer into the
// linked frames; lock, hide and delete in all frames reach the linked copies, which a dashed
// outline shows while a layer is selected. Each by mouse and by key, as one undo step, at the
// three screen sizes and live in a second tab.
import { photo, upload } from '../../support/assets.ts'
import { openTabs } from '../../support/editor.ts'
import { closeMenus, colourOf, expectGreyed, holders, node, open, redo, undo } from '../../support/linked-menu.ts'
import { INK, linkedMenuDesign, PINK } from '../../support/linked-menu-design.ts'
import { copyIn, seed } from '../../support/seed.ts'
import { selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { moreAction, moreSubmenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

test.describe('Copy to other frames ▸', () => {
  test('Style writes the layer’s style into every linked copy, keeping each one’s font size, one undo step', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['headline'])
    const sub = await moreSubmenu(page, 'copy-to-frames')
    await expectGreyed(page, sub, 'Style', 'Every linked copy has this style already')
    await closeMenus(page)
    await page.evaluate(() =>
      window.dazbee?.setProps(['headline'], (_, p) => ({ style: { ...(p.style as object), color: '#FF4FB0FF' } })),
    )
    await moreAction(page, 'Style')
    await expect.poll(() => colourOf(page, copyIn('story', 'headline'))).toBe(PINK)
    expect(await colourOf(page, copyIn('wide', 'headline'))).toBe(PINK)
    expect(((await node(page, copyIn('wide', 'headline')))?.props.style as { fontSize: number }).fontSize).toBe(72)
    await undo(page)
    await expect.poll(() => colourOf(page, copyIn('story', 'headline'))).toBe(INK)
    expect(await colourOf(page, copyIn('wide', 'headline'))).toBe(INK)
    await redo(page)
    await expect.poll(() => colourOf(page, copyIn('wide', 'headline'))).toBe(PINK)
    await undo(page)

    // A copy locked in one frame keeps its style; by key, the other takes it.
    await page.evaluate(() => window.dazbee?.setLocked(['story-headline'], true))
    await selectLayers(page, ['headline'])
    await page.keyboard.press('Control+Alt+Shift+KeyC')
    await expect.poll(() => colourOf(page, copyIn('wide', 'headline'))).toBe(PINK)
    expect(await colourOf(page, copyIn('story', 'headline'))).toBe(INK)
    await expectGreyed(
      page,
      await moreSubmenu(page, 'copy-to-frames'),
      'Style',
      'The linked copies that differ are locked',
    )
    expect(errors).toEqual([])
  })

  test('Text writes a text’s words into its copies, by mouse and key, one undo step', async ({ browser }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['headline'])
    await page.evaluate(() =>
      window.dazbee?.session.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 12, text: '!' } }),
    )
    await moreAction(page, 'Text')
    await expect.poll(async () => (await node(page, copyIn('story', 'headline')))?.props.text).toBe('Weekend sale!')
    expect((await node(page, copyIn('wide', 'headline')))?.props.text).toBe('Weekend sale!')
    await expectGreyed(
      page,
      await moreSubmenu(page, 'copy-to-frames'),
      'Text',
      'Every linked copy has this text already',
    )
    await closeMenus(page)
    await undo(page)
    await expect.poll(async () => (await node(page, copyIn('story', 'headline')))?.props.text).toBe('Weekend sale')
    await page.keyboard.press('Control+Alt+Shift+KeyT')
    await expect.poll(async () => (await node(page, copyIn('wide', 'headline')))?.props.text).toBe('Weekend sale!')
    expect(errors).toEqual([])
  })

  test('Layer copies a layer into the linked frames, inside its parent’s copy or at the top, and a group takes in its children’s copies', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    // A new layer in the logo group of the square; the landscape frame loses its copy of the group.
    await page.evaluate(() =>
      window.dazbee?.session.run('node.create', {
        id: 'dot',
        parentId: 'logo',
        layer: {
          type: 'graphic',
          name: 'Dot',
          props: {
            x: 970,
            y: 880,
            width: 30,
            height: 30,
            shape: { kind: 'ellipse' },
            fills: [{ type: 'solid', color: '#FF4FB0FF' }],
          },
        },
      }),
    )
    await selectLayers(page, [copyIn('wide', 'logo')])
    await page.getByTestId('small-delete').click()
    const dot = (await node(page, 'dot'))?.link ?? ''
    await selectLayers(page, ['dot'])
    await moreAction(page, 'Layer')
    await expect.poll(async () => Object.keys(await holders(page, dot)).sort()).toEqual(['sq', 'story', 'wide'])
    const placed = await holders(page, dot)
    expect((await node(page, placed.story?.[0] ?? ''))?.parentId).toBe(copyIn('story', 'logo'))
    expect((await node(page, placed.wide?.[0] ?? ''))?.parentId).toBe('wide')
    expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['dot'])
    await expectGreyed(
      page,
      await moreSubmenu(page, 'copy-to-frames'),
      'Layer',
      'Every linked frame has this layer already',
    )
    await closeMenus(page)
    await undo(page)
    await expect.poll(async () => Object.keys(await holders(page, dot))).toEqual(['sq'])

    // The headline and subline grouped in the square: the group goes into each linked frame with
    // that frame's own copies of the two inside it.
    await selectLayers(page, ['headline', 'sub'])
    await page.keyboard.press('Control+KeyG')
    const group = await page.evaluate(() => window.dazbee?.selection()[0] ?? '')
    await moreAction(page, 'Layer')
    const link = (await node(page, group))?.link ?? ''
    await expect.poll(async () => Object.keys(await holders(page, link)).sort()).toEqual(['sq', 'story', 'wide'])
    const story = (await holders(page, link)).story?.[0] ?? ''
    expect((await node(page, copyIn('story', 'headline')))?.parentId).toBe(story)
    expect((await holders(page, 'headline')).story).toEqual([copyIn('story', 'headline')])
    await undo(page)
    await expect.poll(async () => (await node(page, copyIn('story', 'headline')))?.parentId).toBe('story')
    expect(errors).toEqual([])
  })
})

test.describe('in all frames', () => {
  test('lock, hide and delete reach the linked copies, by mouse and key, each one undo step', async ({ browser }) => {
    const { page, errors } = await open(browser)
    const all = ['badge', copyIn('story', 'badge'), copyIn('wide', 'badge')]
    const locked = () => Promise.all(all.map(async (id) => Boolean((await node(page, id))?.lock?.delete)))
    const hidden = () => Promise.all(all.map(async (id) => (await node(page, id))?.props.visible === false))
    // The story's copy is hidden there already: Hide in all frames hides the rest.
    await page.evaluate(() => window.dazbee?.setHidden(['story-badge'], true))
    await selectLayers(page, ['badge'])
    await moreAction(page, 'Hide in all frames')
    await expect.poll(hidden).toEqual([true, true, true])
    await moreAction(page, 'Show in all frames')
    await expect.poll(hidden).toEqual([false, false, false])
    await undo(page)
    await expect.poll(hidden).toEqual([true, true, true])
    await page.keyboard.press('Control+Alt+Shift+KeyH')
    await expect.poll(hidden).toEqual([false, false, false])

    await moreAction(page, 'Lock in all frames')
    await expect.poll(locked).toEqual([true, true, true])
    await page.keyboard.press('Control+Alt+Shift+KeyL')
    await expect.poll(locked).toEqual([false, false, false])
    await undo(page)
    await expect.poll(locked).toEqual([true, true, true])
    await undo(page)
    await expect.poll(locked).toEqual([false, false, false])

    // A copy locked against deleting stays.
    await page.evaluate(() => window.dazbee?.setLocked(['wide-badge'], true))
    await selectLayers(page, ['badge'])
    await moreAction(page, 'Delete from all frames')
    await expect.poll(async () => (await holders(page, 'badge')).sq).toBeUndefined()
    expect(Object.keys(await holders(page, 'badge'))).toEqual(['wide'])
    await undo(page)
    await expect.poll(async () => Object.keys(await holders(page, 'badge')).sort()).toEqual(['sq', 'story', 'wide'])
    expect(errors).toEqual([])
  })
})

test('while a layer is selected its linked copies have a dashed outline, and none once it is let go', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  const outlined = () =>
    page.locator('.stage-overlay .linked-copy').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.layer))
  await selectLayers(page, ['headline'])
  await expect.poll(outlined).toEqual([copyIn('story', 'headline'), copyIn('wide', 'headline')])
  await selectLayers(page, ['fresh-title'])
  await expect.poll(outlined).toEqual([])
  await selectLayers(page, [])
  await expect.poll(outlined).toEqual([])
  expect(errors).toEqual([])
})

test('a second tab sees Copy to other frames ▸ Style and Delete from all frames live', async ({ browser }) => {
  const asset = await upload(photo)
  const { tabs, errors } = await openTabs(browser, 2, await seed(linkedMenuDesign(asset.id)))
  const [a, b] = tabs as [Page, Page]
  await selectLayers(a, ['headline'])
  await a.evaluate(() =>
    window.dazbee?.setProps(['headline'], (_, p) => ({ style: { ...(p.style as object), color: '#FF4FB0FF' } })),
  )
  await a.keyboard.press('Control+Alt+Shift+KeyC')
  await expect.poll(() => colourOf(b, copyIn('wide', 'headline'))).toBe(PINK)
  await selectLayers(a, ['badge'])
  await moreAction(a, 'Delete from all frames')
  await expect.poll(async () => Object.keys(await holders(b, 'badge'))).toEqual([])
  expect(errors).toEqual([])
})
