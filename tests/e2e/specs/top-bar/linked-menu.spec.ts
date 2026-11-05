// The small menu, its ⋯ (the full menu) and the right-click menu, and paste across frames, in
// Chromium (#456): the small menu acts on this frame; the full menu's Copy ▸ and Paste ▸ take the
// layers or their style; Copy to other frames ▸ writes a style, a text or the layer into the
// linked frames; lock, hide and delete in all frames reach the linked copies, which a dashed
// outline shows while a layer is selected. Each by mouse and by key, as one undo step, at the
// three screen sizes and live in a second tab.
import { photo, upload } from '../../support/assets.ts'
import { openTabs } from '../../support/editor.ts'
import { layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { GREEN, INK, linkedMenuDesign, PINK } from '../../support/linked-menu-design.ts'
import { copyIn, seed } from '../../support/seed.ts'
import { fitSettled, openStage, perform, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { moreAction, moreMenu, moreSubmenu, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

/** The full menu's own rows, in their order; the top bar's ⋯ takes the rest. */
const ROWS = [
  'Copy',
  'Paste',
  'Duplicate',
  'Copy to other frames',
  'Put in a box',
  'Use as mask',
  'Lock in all frames',
  'Hide in all frames',
  'Delete from all frames',
]

/** Opens the design in one tab, its page fitted. */
async function open(browser: Parameters<typeof openStage>[0]) {
  const asset = await upload(photo)
  const opened = await openStage(browser, linkedMenuDesign(asset.id))
  await fitSettled(opened.page)
  return opened
}

/** A layer as the tab's design holds it now. */
const node = (page: Page, id: string) =>
  page.evaluate((one) => {
    const found = window.dazbee?.design().nodes[one]
    return found
      ? (JSON.parse(JSON.stringify(found)) as {
          link: string
          parentId: string
          props: Record<string, unknown>
          lock?: Record<string, boolean>
        })
      : null
  }, id)
/** The ids of the layers with a link id, by frame. */
const holders = (page: Page, link: string) =>
  page.evaluate((one) => {
    const design = window.dazbee?.design()
    if (!design) return {}
    const frameOf = (id: string): string => {
      let up = id
      while (design.nodes[up]) up = design.nodes[up]?.parentId ?? ''
      return up
    }
    const out: Record<string, string[]> = {}
    for (const [id, n] of Object.entries(design.nodes)) if (n.link === one) (out[frameOf(id)] ??= []).push(id)
    return out
  }, link)
const fillOf = async (page: Page, id: string) =>
  ((await node(page, id))?.props.fills as { color?: string }[] | undefined)?.[0]?.color
const colourOf = async (page: Page, id: string) => ((await node(page, id))?.props.style as { color: string }).color
const undo = (page: Page) => perform(page, 'undo')
const redo = (page: Page) => perform(page, 'redo')

/** The rows of a menu that are its own, in order, by their words without their keys: buttons straight inside it. */
const rowsOf = (menu: Locator) =>
  menu.locator(':scope > button').evaluateAll((rows) => rows.map((row) => row.firstChild?.textContent?.trim() ?? ''))
/**
 * Checks that the row of a menu named so is greyed and says why: to a screen reader, and in a
 * tooltip as the pointer rests on it.
 */
async function expectGreyed(page: Page, menu: Locator, name: string, why: string) {
  const row = menu.getByRole('button', { name: new RegExp(`^${name}`) }).first()
  await expect(row).toHaveAttribute('aria-disabled', 'true')
  await expect(row).toHaveAttribute('aria-description', why)
  // Over the row in a few moves, as a hand does: the first after leaving another tooltip's row only ends that one.
  await row.hover()
  const box = await row.boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2, { steps: 2 })
  await expect(page.getByRole('tooltip').filter({ hasText: why })).toBeVisible()
}
/** Closes the open menus with Esc, which closes the top-most first: a tooltip, a menu beside a row, the menu. */
async function closeMenus(page: Page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Escape')
      return (await page.getByTestId('bar-more-menu').isVisible()) || (await page.getByTestId('stage-menu').isVisible())
    })
    .toBe(false)
}

test.describe('the small menu', () => {
  test('locks, duplicates, deletes and hides in this frame only, each one undo step, by mouse and key', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['badge'])
    const small = page.getByTestId('small-menu')
    expect(await small.getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).toEqual([
      'Lock',
      'Duplicate',
      'Delete',
      'Hide',
      'More',
    ])
    await page.getByTestId('small-lock').click()
    await expect.poll(async () => (await node(page, 'badge'))?.lock?.move).toBe(true)
    expect((await node(page, copyIn('story', 'badge')))?.lock).toBeUndefined()
    await undo(page)
    await expect.poll(async () => (await node(page, 'badge'))?.lock).toBeUndefined()

    await page.getByTestId('small-hide').click()
    await expect.poll(async () => (await node(page, 'badge'))?.props.visible).toBe(false)
    expect((await node(page, copyIn('wide', 'badge')))?.props.visible).not.toBe(false)
    await expect(page.getByTestId('small-hide')).toHaveAttribute('aria-label', 'Show')
    await undo(page)
    await expect.poll(async () => (await node(page, 'badge'))?.props.visible).not.toBe(false)
    await page.keyboard.press('Control+Shift+KeyH')
    await expect.poll(async () => (await node(page, 'badge'))?.props.visible).toBe(false)
    await undo(page)

    await page.getByTestId('small-duplicate').click()
    await expect.poll(async () => (await holders(page, 'badge')).sq?.length ?? 0).toBe(1)
    expect(await page.evaluate(() => window.dazbee?.selection().length)).toBe(1)
    const duplicate = await page.evaluate(() => window.dazbee?.selection()[0] ?? '')
    expect(duplicate).not.toBe('badge')
    await undo(page)
    await selectLayers(page, ['badge'])
    await page.getByTestId('small-delete').click()
    await expect.poll(() => node(page, 'badge')).toBeNull()
    expect(await node(page, copyIn('story', 'badge'))).not.toBeNull()
    await undo(page)
    await expect.poll(() => node(page, 'badge')).not.toBeNull()
    await redo(page)
    await expect.poll(() => node(page, 'badge')).toBeNull()
    expect(errors).toEqual([])
  })
})

test.describe('the full menu', () => {
  test('opens with the focus on its first item, lists its rows in order, and gives the focus back to ⋯', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await selectLayers(page, ['headline'])
    await page.getByTestId('bar-more').focus()
    await page.keyboard.press('Enter')
    const menu = page.getByTestId('bar-more-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    expect((await rowsOf(menu)).filter((row) => ROWS.includes(row))).toEqual(ROWS)
    // The submenu opens by the arrow with the focus on its first row, and closes back to its row.
    await page.keyboard.press('ArrowRight')
    const copy = page.getByTestId('more-copy-menu')
    await expect(copy).toBeVisible()
    await expect(copy.getByRole('button').first()).toBeFocused()
    await expect(copy.getByRole('button')).toHaveText([/^Copy\s*Ctrl\+C/, /^Copy style\s*Ctrl\+Alt\+C/])
    await page.keyboard.press('ArrowLeft')
    await expect(copy).toBeHidden()
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByTestId('bar-more')).toBeFocused()

    // A right-click on the layer shows the same rows.
    await selectLayers(page, [])
    const box = await page.evaluate(() => window.dazbee?.boxOf('badge'))
    const at = await page.evaluate((b) => window.dazbee?.screenPoint((b?.x ?? 0) + 100, (b?.y ?? 0) + 100), box)
    await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
    const right = page.getByTestId('stage-menu')
    await expect(right).toBeVisible()
    expect((await rowsOf(right)).filter((row) => ROWS.includes(row))).toEqual(ROWS)
    expect(errors).toEqual([])
  })

  test('shows Text only for text layers, for every layer type and several', async ({ browser }) => {
    const { page, errors } = await open(browser)
    for (const [ids, text] of [
      [['headline'], true],
      [['cta'], true],
      [['badge'], false],
      [['photo'], false],
      [['logo'], false],
      [['shapes'], false],
      [['card'], false],
      [['headline', 'sub'], true],
      [['headline', 'badge'], false],
    ] as const) {
      await selectLayers(page, [...ids])
      const sub = await moreSubmenu(page, 'copy-to-frames')
      await expect(sub.getByRole('button')).toHaveText(text ? [/^Style/, /^Text/, /^Layer/] : [/^Style/, /^Layer/])
      await expect(sub.getByText('To the 2 linked frames')).toBeVisible()
      await closeMenus(page)
    }
    // A frame linked to none greys the row and says why.
    await selectLayers(page, ['fresh-title'])
    const menu = await moreMenu(page)
    await expectGreyed(page, menu, 'Copy to other frames', 'No other frame on this page is linked to this one')
    expect(errors).toEqual([])
  })
})

test.describe('Copy ▸ and Paste ▸', () => {
  test('copy a layer’s style and paste it on another, by mouse and by key, each one undo step', async ({ browser }) => {
    const { page, errors } = await open(browser)
    await page.evaluate(() => {
      localStorage.removeItem('dazbee.copiedStyle')
      localStorage.removeItem('dazbee.copiedLayers')
    })
    await selectLayers(page, ['photo'])
    const paste = await moreSubmenu(page, 'paste')
    await expectGreyed(page, paste, 'Paste style', 'Copy a style first')
    await expectGreyed(page, paste, 'Paste', 'Copy layers first')
    await closeMenus(page)

    await selectLayers(page, ['headline', 'badge'])
    await expectGreyed(page, await moreSubmenu(page, 'copy'), 'Copy style', 'Select one layer to copy its style')
    await closeMenus(page)

    await selectLayers(page, ['badge'])
    await moreAction(page, 'Copy style')
    await selectLayers(page, ['mark'])
    await moreAction(page, 'Paste style')
    await expect.poll(() => fillOf(page, 'mark')).toBe(PINK)
    expect(await fillOf(page, copyIn('story', 'mark'))).toBe(INK)
    await undo(page)
    await expect.poll(() => fillOf(page, 'mark')).toBe(INK)
    await redo(page)
    await expect.poll(() => fillOf(page, 'mark')).toBe(PINK)
    await expectGreyed(page, await moreSubmenu(page, 'paste'), 'Paste style', 'The selection has this style already')
    await closeMenus(page)

    // By key: the shape's green onto the card.
    await selectLayers(page, ['shapes'])
    await page.keyboard.press('Control+Alt+KeyC')
    await selectLayers(page, ['card'])
    await page.keyboard.press('Control+Alt+KeyV')
    await expect.poll(() => fillOf(page, 'card')).toBe(GREEN)
    expect((await node(page, 'card'))?.props).toMatchObject({ x: 80, width: 320 })
    await undo(page)
    await expect.poll(() => fillOf(page, 'card')).toBe(INK)
    expect(errors).toEqual([])
  })

  test('paste onto another frame of the page makes linked copies; into its own frame or another page, new layers', async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await page.evaluate(() => localStorage.removeItem('dazbee.copiedLayers'))
    // The story's copy of the badge goes, in its frame only.
    await selectLayers(page, [copyIn('story', 'badge')])
    await page.getByTestId('small-delete').click()
    await expect.poll(async () => (await holders(page, 'badge')).story).toBeUndefined()

    await selectLayers(page, ['badge'])
    await page.keyboard.press('Control+KeyC')
    await selectLayers(page, [copyIn('story', 'sub')])
    await page.keyboard.press('Control+KeyV')
    await expect.poll(async () => (await holders(page, 'badge')).story?.length).toBe(1)
    // The landscape frame has its own copy, so a paste there is a new layer.
    await selectLayers(page, [copyIn('wide', 'sub')])
    await moreAction(page, 'Paste')
    await expect.poll(async () => (await holders(page, 'badge')).wide?.length).toBe(1)
    const pasted = await page.evaluate(() => window.dazbee?.selection()[0] ?? '')
    expect((await node(page, pasted))?.link).not.toBe('badge')
    await undo(page)
    await undo(page)
    await expect.poll(async () => (await holders(page, 'badge')).story).toBeUndefined()

    // Into the frame it came from, and onto another page: new layers.
    await selectLayers(page, ['sub'])
    await page.keyboard.press('Control+KeyV')
    await expect.poll(() => page.evaluate(() => window.dazbee?.selection()[0])).not.toBe('sub')
    expect((await holders(page, 'badge')).sq).toEqual(['badge'])
    await page.evaluate(() => window.dazbee?.showPage('p2'))
    await selectLayers(page, ['far-title'])
    await page.keyboard.press('Control+KeyV')
    await expect.poll(() => page.evaluate(() => window.dazbee?.selection()[0])).not.toBe('far-title')
    expect((await holders(page, 'badge')).far).toBeUndefined()
    expect(errors).toEqual([])
  })
})

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

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} the small menu, its ⋯ and Copy to other frames ▸ fit with nothing cut or covered`, async ({
    browser,
  }) => {
    const { page, errors } = await open(browser)
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    await selectLayers(page, ['headline'])
    await expect(page.getByTestId('small-menu')).toBeVisible()
    await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    await moreMenu(page)
    await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    const sub = await moreSubmenu(page, 'copy-to-frames')
    if (width > 600) {
      await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    } else {
      // On a phone it opens under its row, laid over the full menu as the mock draws it: wholly on
      // the screen and on top, each row a finger's height, once it has popped in.
      await sub.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))))
      const rows = await sub.getByRole('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const r = button.getBoundingClientRect()
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return {
            inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            onTop: button.contains(top),
            height: r.height,
          }
        }),
      )
      for (const row of rows) expect(row).toMatchObject({ inside: true, onTop: true })
      for (const row of rows) expect(row.height).toBeGreaterThanOrEqual(44)
      // A tap on a greyed row says why, as the pointer resting on it does.
      // Playwright holds back a click on a row marked disabled until it isn't; the tap is the point here.
      await sub.getByRole('button', { name: /^Layer/ }).click({ force: true })
      await expect(
        page.getByRole('tooltip').filter({ hasText: 'Every linked frame has this layer already' }),
      ).toBeVisible()
      await expect(sub).toBeVisible()
    }
    expect(errors).toEqual([])
  })
}
