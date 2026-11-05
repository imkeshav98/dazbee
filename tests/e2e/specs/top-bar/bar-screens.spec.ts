// The top bar without duplicates at the three screen sizes, over the test grid: text in each
// box mode, a shape, a photo, a box, several, a locked layer, a turned one, one in an auto layout
// box and a group. Nothing meets, wraps or is cut, the bar's Position and the text's pop-ups
// included; no row starts or ends with a divider; at tablet size a divider stands before More
// controls; on a phone the bar takes two rows at most, wraps between its groups, ends its first row
// with Position (with Line up before it for several), makes every item a 44 px target 8 px from the
// next, and never covers the selected layer, its handles or its frame's label. And the screenshots
// of every state the approved mock draws.
import { photo, upload } from '../../support/assets.ts'
import { barItems } from '../../support/bar-homes.ts'
import { editorPath, setCookies, shoot } from '../../support/editor.ts'
import { THEMES } from '../../support/glass.ts'
import { layoutProblems, SCREEN_SIZES, wrapped } from '../../support/layout.ts'
import { seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'
import { barMenu, PIECES, UNCUT } from '../../support/top-bar.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ mode: 'parallel', timeout: 300_000 })

/** The test grid's selections in the top bar design, by name; a text's box mode is set first. */
const GRID: {
  name: string
  ids: string[]
  boxMode?: 'autoWidth' | 'autoHeight' | 'fixed'
  /** The text in a font with a long name, turned, so its Position button shows the angle. */
  long?: true
}[] = [
  { name: 'text auto width', ids: ['headline'], boxMode: 'autoWidth' },
  { name: 'text auto height', ids: ['headline'], boxMode: 'autoHeight' },
  { name: 'text fixed', ids: ['headline'], boxMode: 'fixed' },
  { name: 'text in a long-named font, turned', ids: ['headline'], boxMode: 'autoHeight', long: true },
  { name: 'shape', ids: ['star'] },
  { name: 'photo', ids: ['photo'] },
  { name: 'box', ids: ['card'] },
  { name: 'several', ids: ['box', 'card'] },
  { name: 'several shapes of one kind', ids: ['box', 'turned'] },
  { name: 'several photos', ids: ['photo', 'photoB'] },
  { name: 'locked', ids: ['locked'] },
  { name: 'turned', ids: ['turned'] },
  { name: 'in auto layout', ids: ['inStack'] },
  { name: 'group', ids: ['group'] },
]

/** The touch target a phone's bar items make, and the room between two, in pixels. */
const TARGET = 44
const APART = 8

/** Opens the top bar design at a screen size, in a theme, taking touches on a phone. */
async function openAt(
  browser: Browser,
  designId: string,
  [width, height]: readonly [number, number],
  theme = 'dark',
  locale = 'en',
) {
  const touch = width < 640
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme, locale })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await fitSettled(page)
  return { page, errors }
}

/** Selects a case of the grid, setting the text's box mode first. */
async function selectCase(page: Page, { ids, boxMode, long }: (typeof GRID)[number]) {
  if (boxMode)
    await page.evaluate(
      ({ boxMode, long }) =>
        window.dazbee?.session.run('node.update', {
          ids: ['headline'],
          patch: {
            boxMode,
            rotation: long ? 345 : 0,
            style: {
              fontFamily: long ? 'Noto Naskh Arabic' : 'Noto Sans',
              fontSize: 64,
              fontWeight: 400,
              color: '#111111FF',
            },
          },
        }),
      { boxMode, long: long === true },
    )
  await selectLayers(page, ids, { bar: true })
  await nextFrame(page)
}

/** The bar's items that show, each with its key, its row and its box; a divider is an item too. */
const shownItems = (page: Page) =>
  page.evaluate(() =>
    ['top-bar-row', 'top-bar-overflow'].flatMap((row, at) =>
      [...document.querySelectorAll<HTMLElement>(`[data-testid="${row}"] > *`)]
        .filter((el) =>
          (el.dataset.item === undefined ? el : el.firstElementChild)?.checkVisibility({ visibilityProperty: true }),
        )
        .map((el) => {
          const shown = el.dataset.item === undefined ? el : (el.firstElementChild as HTMLElement)
          const { left, right, top, bottom } = shown.getBoundingClientRect()
          return {
            key: el.dataset.item ?? shown.dataset.testid ?? '',
            group: el.dataset.group,
            row: at,
            left,
            right,
            top,
            bottom,
          }
        }),
    ),
  )

/** The touch targets on the bar: its buttons and fields that show, each with its box. */
const targets = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="top-bar"] :is([data-bar-item], [data-testid="bar-size"] [data-knob])',
      ),
    ]
      .filter((el) => el.checkVisibility({ visibilityProperty: true }))
      .map((el) => {
        const { left, right, top, bottom } = el.getBoundingClientRect()
        return { name: el.getAttribute('aria-label') ?? el.textContent ?? '', left, right, top, bottom }
      }),
  )

/** The selected layers' boxes on screen, grown by the handles' reach, and the labels of their frames. */
const selectionOnScreen = (page: Page, ids: string[]) =>
  page.evaluate((ids) => {
    const editor = window.dazbee
    if (!editor) return { boxes: [], labels: [] }
    const boxes = ids.flatMap((id) => {
      const box = editor.boxOf(id)
      if (!box) return []
      const a = editor.screenPoint(box.x, box.y)
      const b = editor.screenPoint(box.x + box.width, box.y + box.height)
      return [{ left: a.x - 6, top: a.y - 6, right: b.x + 6, bottom: b.y + 6 }]
    })
    const labels = [...document.querySelectorAll('.stage-overlay .frame-label')].map((el) => {
      const { left, top, right, bottom } = el.getBoundingClientRect()
      return { left, top, right, bottom }
    })
    return { boxes, labels }
  }, ids)

const meet = (
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5

/** The mock's checks on the page now: nothing meets or is cut, and no label wraps. */
async function checked(page: Page, what: string) {
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), what).toEqual([])
  expect(await wrapped(page), what).toEqual([])
}

let designId: string
let assetId: string

test.beforeAll(async () => {
  assetId = (await upload(photo)).id
  designId = await seed(topBarDesign(assetId))
})

for (const size of SCREEN_SIZES) {
  const [width, height] = size
  test(`at ${width}×${height} every case of the grid shows its bar, its Position and a text's Align and Text style with nothing meeting, wrapped or cut, and no row starting or ending with a divider`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, designId, size)
    for (const one of GRID) {
      await selectCase(page, one)
      await checked(page, `${width} ${one.name} bar`)
      const items = await shownItems(page)
      for (const row of [0, 1]) {
        const keys = items.filter((item) => item.row === row).map((item) => item.key)
        if (keys.length === 0) continue
        expect(keys[0]?.startsWith('divider'), `${width} ${one.name} row ${row} starts ${keys.join(' ')}`).toBe(false)
        expect(keys.at(-1)?.startsWith('divider'), `${width} ${one.name} row ${row} ends ${keys.join(' ')}`).toBe(false)
      }
      const pops =
        one.ids[0] === 'headline' && one.boxMode === 'autoHeight' ? ['position', 'align', 'text-style'] : ['position']
      for (const pop of pops) {
        await barMenu(page, pop)
        await nextFrame(page)
        await checked(page, `${width} ${one.name} ${pop}`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`bar-${pop}-menu`)).toBeHidden()
      }
    }
    expect(errors).toEqual([])
    await page.context().close()
  })
}

test('on a phone the bar takes two rows at most, wraps between its groups, ends its first row with Position (Line up and Position for several), and every item is a 44 px target 8 px from the next', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser, designId, [390, 844])
  for (const one of GRID) {
    await selectCase(page, one)
    const items = await shownItems(page)
    // The bar settles: a moment later every item is where it was.
    await page.waitForTimeout(400)
    await nextFrame(page)
    expect(await shownItems(page), `${one.name} settles`).toEqual(items)
    const rows = new Set(items.map((item) => Math.round((item.top + item.bottom) / 2)))
    expect(rows.size, `${one.name}: ${[...rows].join(' ')}`).toBeLessThanOrEqual(2)
    const first = items.filter((item) => item.row === 0).map((item) => item.key)
    expect(first.slice(one.ids.length > 1 ? -2 : -1), one.name).toEqual(
      one.ids.length > 1 ? ['line-up', 'position'] : ['position'],
    )
    // A group is split between the rows only when it is too wide for one. The bar's last items end
    // the first row whatever is cut, so they belong to no group here.
    const room = 390 - 16
    const groups = new Map<string, typeof items>()
    for (const item of items)
      if (item.group !== undefined && !['line-up', 'position'].includes(item.key) && !item.key.startsWith('divider'))
        groups.set(item.group, [...(groups.get(item.group) ?? []), item])
    for (const each of groups.values()) {
      const split = new Set(each.map((item) => item.row)).size > 1
      const wide = each.reduce((sum, item) => sum + item.right - item.left + APART, 0)
      if (split) expect(wide, `${one.name} splits ${each.map((item) => item.key).join(' ')}`).toBeGreaterThan(room)
    }
    // Every target is a finger's size, 8 px from the next in its row.
    const shown = await targets(page)
    for (const target of shown) {
      expect(target.right - target.left, `${one.name} ${target.name} width`).toBeGreaterThanOrEqual(TARGET - 0.5)
      expect(target.bottom - target.top, `${one.name} ${target.name} height`).toBeGreaterThanOrEqual(TARGET - 0.5)
    }
    const sorted = [...shown].sort((a, b) => a.top - b.top || a.left - b.left)
    for (const [i, target] of sorted.entries()) {
      const next = sorted[i + 1]
      if (!next || Math.abs(next.top - target.top) > 4) continue
      expect(next.left - target.right, `${one.name} ${target.name} to ${next.name}`).toBeGreaterThanOrEqual(APART - 0.5)
    }
  }
  // A text's Text style, Align, List and Case pop-ups: every toggle and choice a finger's size.
  await selectCase(page, GRID[1] as (typeof GRID)[number])
  for (const pop of ['text-style', 'align', 'list', 'case']) {
    const menu = await barMenu(page, pop)
    const small = await menu.locator('button').evaluateAll((els) =>
      els
        .filter((el) => {
          const { width, height } = el.getBoundingClientRect()
          return width < 43.5 || height < 43.5
        })
        .map((el) => el.textContent || el.ariaLabel),
    )
    expect(small, pop).toEqual([])
    await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
  await page.context().close()
})

test("on a phone the bar never covers the selected layer, its handles or its frame's label", async ({ browser }) => {
  const { page, errors } = await openAt(browser, designId, [390, 844])
  for (const one of GRID) {
    await selectCase(page, one)
    await drawn(page)
    const rows = (await shownItems(page)).length > 0
    expect(rows).toBe(true)
    const bar = await page.evaluate(() =>
      ['top-bar-row', 'top-bar-overflow'].flatMap((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!el?.checkVisibility({ visibilityProperty: true })) return []
        const { left, top, right, bottom } = el.getBoundingClientRect()
        return [{ left, top, right, bottom }]
      }),
    )
    const { boxes, labels } = await selectionOnScreen(page, one.ids)
    for (const box of [...boxes, ...labels])
      for (const row of bar) expect(meet(box, row), `${one.name} ${JSON.stringify(box)}`).toBe(false)
  }
  expect(errors).toEqual([])
  await page.context().close()
})

test('on a phone a tap on a layer where the bar shows selects it, presses nothing on the bar, and the stage moves the layer clear of the bar', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser, designId, [390, 844])
  for (const id of ['headline', 'star', 'photo']) {
    await selectLayers(page, [])
    // The layer's middle brought to 120 px down the screen, where the bar's rows will be.
    await page.evaluate((id) => {
      const editor = window.dazbee
      const box = editor?.boxOf(id)
      const camera = editor?.camera()
      if (!editor || !box || !camera) return
      const at = editor.screenPoint(box.x + box.width / 2, box.y + box.height / 2)
      editor.setCamera({ ...camera, y: camera.y + 120 - at.y })
    }, id)
    await nextFrame(page)
    const at = await page.evaluate((id) => {
      const box = window.dazbee?.boxOf(id)
      return box ? window.dazbee?.screenPoint(box.x + box.width / 2, box.y + box.height / 2) : undefined
    }, id)
    await page.touchscreen.tap(at?.x ?? 0, at?.y ?? 0)
    await expect.poll(() => page.evaluate(() => window.dazbee?.selection()), id).toEqual([id])
    await page.waitForTimeout(500)
    await expect(page.locator('[data-radix-popper-content-wrapper]'), id).toHaveCount(0)
    await expect(page.locator('#edit-panel'), id).toBeHidden()
    const bar = await page.evaluate(() =>
      ['top-bar-row', 'top-bar-overflow'].flatMap((row) => {
        const el = document.querySelector(`[data-testid="${row}"]`)
        if (!el?.checkVisibility({ visibilityProperty: true })) return []
        const { left, top, right, bottom } = el.getBoundingClientRect()
        return [{ left, top, right, bottom }]
      }),
    )
    const { boxes } = await selectionOnScreen(page, [id])
    for (const box of boxes) for (const row of bar) expect(meet(box, row), `${id} under the bar`).toBe(false)
  }
  expect(errors).toEqual([])
  await page.context().close()
})

test('at tablet size with a flyout open, a bar too long for its room shows a divider just before More controls', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser, designId, [820, 1180])
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await selectCase(page, GRID[1] as (typeof GRID)[number])
  await expect(page.getByTestId('bar-overflow')).toBeVisible()
  const keys = (await shownItems(page)).filter((item) => item.row === 0).map((item) => item.key)
  const at = keys.indexOf('bar-overflow')
  expect(keys[at - 1]?.startsWith('divider'), keys.join(' ')).toBe(true)
  expect(keys[at - 2]?.startsWith('divider'), keys.join(' ')).toBe(false)
  await checked(page, 'tablet with a flyout')
  expect(errors).toEqual([])
  await page.context().close()
})

/** Each state the approved mock draws, by its name there, and how to reach it. */
const STATES: { name: string; reach: (page: Page) => Promise<void> }[] = [
  { name: '1-text', reach: (page) => selectLayers(page, ['headline'], { bar: true }) },
  { name: '2-shape', reach: (page) => selectLayers(page, ['star'], { bar: true }) },
  { name: '3-photo', reach: (page) => selectLayers(page, ['photo'], { bar: true }) },
  { name: '4-box', reach: (page) => selectLayers(page, ['card'], { bar: true }) },
  { name: '5-several', reach: (page) => selectLayers(page, ['box', 'card'], { bar: true }) },
  { name: '6-locked', reach: (page) => selectLayers(page, ['locked'], { bar: true }) },
  {
    name: '7-align-open',
    reach: async (page) => {
      await selectLayers(page, ['headline'], { bar: true })
      await barMenu(page, 'align')
    },
  },
  {
    name: '8-position',
    reach: async (page) => {
      await selectLayers(page, ['headline'], { bar: true })
      await barMenu(page, 'position')
    },
  },
  {
    name: '9-position-locked',
    reach: async (page) => {
      await selectLayers(page, ['locked'], { bar: true })
      const panel = await barMenu(page, 'position')
      // Reached by the keyboard, as the mock draws it with its reason beside it.
      await panel.getByRole('spinbutton', { name: 'Width' }).focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('tooltip')).toHaveText('The layer is locked')
    },
  },
  {
    name: '10-position-several',
    reach: async (page) => {
      await selectLayers(page, ['box', 'card'], { bar: true })
      await barMenu(page, 'position')
    },
  },
  {
    name: '11-position-turned',
    reach: async (page) => {
      await selectLayers(page, ['turned'], { bar: true })
      await barMenu(page, 'position')
    },
  },
  { name: 'option-R2', reach: (page) => selectLayers(page, ['turned'], { bar: true }) },
  {
    name: 'option-S1',
    reach: async (page) => {
      await selectLayers(page, ['headline'], { bar: true })
      await barMenu(page, 'text-style')
    },
  },
  {
    name: 'option-T1',
    reach: async (page) => {
      await selectLayers(page, ['headline'], { bar: true })
      await barMenu(page, 'align')
    },
  },
]

for (const size of SCREEN_SIZES)
  for (const theme of THEMES)
    test(
      `the PR's screenshots at ${size[0]}×${size[1]} in the ${theme} theme: every state the mock draws`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openAt(browser, designId, size, theme)
        for (const state of STATES) {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await state.reach(page)
          if (!state.name.startsWith('9')) await page.mouse.move(2, size[1] / 2)
          await drawn(page)
          await nextFrame(page)
          await shoot(page, `${state.name}-${size[0]}x${size[1]}-${theme}`)
          for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
          await selectLayers(page, [])
          expect(await barItems(page)).toEqual([])
        }
        expect(errors).toEqual([])
        await page.context().close()
      },
    )

/** Changes the headline as one step, for a state that shows a text set some way. */
const setHeadline = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((patch) => window.dazbee?.session.run('node.update', { ids: ['headline'], patch }), patch)

for (const size of SCREEN_SIZES)
  for (const theme of THEMES)
    test(
      `the PR's screenshots at ${size[0]}×${size[1]} in the ${theme} theme: Text style with Bold and Italic on, right-to-left text's Align, and the app in Arabic`,
      { tag: '@evidence' },
      async ({ browser }) => {
        // A design of its own, as these states change the headline.
        const own = await seed(topBarDesign(assetId))
        const name = (state: string) => `${state}-${size[0]}x${size[1]}-${theme}`
        const { page, errors } = await openAt(browser, own, size, theme)
        const style = { fontFamily: 'Noto Sans', fontSize: 64, color: '#111111FF' }
        await setHeadline(page, { style: { ...style, fontWeight: 700, fontStyle: 'italic' } })
        await selectLayers(page, ['headline'], { bar: true })
        await page.mouse.move(2, size[1] / 2)
        await shoot(page, name('styles-on'))
        await barMenu(page, 'text-style')
        await page.mouse.move(2, size[1] / 2)
        await shoot(page, name('styles-on-open'))
        await page.keyboard.press('Escape')
        await setHeadline(page, { direction: 'rtl', style: { ...style, fontWeight: 400 } })
        await barMenu(page, 'align')
        await page.mouse.move(2, size[1] / 2)
        await drawn(page)
        await shoot(page, name('rtl-text-align-open'))
        expect(errors).toEqual([])
        await page.context().close()

        const arabic = await openAt(browser, own, size, theme, 'ar')
        await selectLayers(arabic.page, ['headline'], { bar: true })
        await drawn(arabic.page)
        await shoot(arabic.page, name('arabic-text'))
        await barMenu(arabic.page, 'align')
        await shoot(arabic.page, name('arabic-align-open'))
        await arabic.page.keyboard.press('Escape')
        await barMenu(arabic.page, 'position')
        await shoot(arabic.page, name('arabic-position'))
        expect(arabic.errors).toEqual([])
        await arabic.page.context().close()
      },
    )
