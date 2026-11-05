// Export lists frames: the Export menu lists the shown page's frames, each with a tick, all ticked,
// by the names their files take, numbered where frames share a name; each file type exports the
// ticked frames, byte for byte what Node exports of the same request; a page of one frame exports it
// as itself; and a picked frame's ⋯ opens Export with that frame ticked alone. By mouse and by
// keyboard, at the three screen sizes, with the PR's pictures in both themes.
import { readFileSync } from 'node:fs'

import { exportDesign, readZip } from '@dazbee/export'
import { fixtureResources } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { DesignInput, ExportType } from '@dazbee/schema'

import { solid } from '../../support/edit-in-frame.ts'
import { designOf, editorPath, setCookies, writeOutput } from '../../support/editor.ts'
import { clickLabel, picked, tabToBar } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign, linkedFrames, seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame } from '../../support/stage.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const TYPES = ['png', 'jpg', 'pdf', 'svg'] as const

/** What must not cover each other while Export is open, or a picked frame's ⋯. */
const PIECES = {
  ...EDITOR_CHROME,
  export: '[data-testid="export"]',
  'top bar': '[data-testid="top-bar-row"]',
  'frame menu': '[data-testid="bar-frame-more-menu"]',
}
/** The canvas's frame labels, which cut a long name short by design on a small frame. */
const LABELS = '.stage-overlay'
/**
 * The chrome a menu opened from the header may float over: on a phone the zoom, Pages and the top
 * bar sit under the header, and Export covers them while it is open, as the Share menu does.
 */
const UNDER_MENUS = '[data-zoom], [data-pages], [data-testid="top-bar"]'

/**
 * Page "Summer": Sale (a square), Sale (a story linked to it), Banner and sale (a medium rectangle),
 * each a headline and a badge; page "Diwali": one frame, Sale, its own headline.
 */
const design = (): DesignInput => {
  const summer = linkedFrames(
    frameDesign({
      name: 'Weekend sale',
      frameName: 'Sale',
      fills: solid('#FFD23FFF'),
      nodes: {
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a0',
          name: 'Headline',
          props: {
            x: 80,
            y: 80,
            width: 920,
            height: 140,
            text: 'Weekend sale',
            style: { fontFamily: 'Noto Sans', fontSize: 110, fontWeight: 800, color: '#15121AFF' },
          },
        },
        badge: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a1',
          name: 'Badge',
          props: {
            x: 560,
            y: 520,
            width: 420,
            height: 420,
            shape: { kind: 'star', points: 10, innerRadius: 0.75 },
            fills: solid('#FF48B0FF'),
          },
        },
      },
    }),
    [
      { id: 'story', name: 'Sale', width: 1080, height: 1920, values: { badge: { y: 1300 } } },
      {
        id: 'banner',
        name: 'Banner',
        width: 1200,
        height: 628,
        values: { headline: { width: 700 }, badge: { x: 820, y: 160, width: 300, height: 300 } },
      },
      {
        id: 'mpu',
        name: 'sale',
        width: 300,
        height: 250,
        values: {
          headline: {
            x: 20,
            y: 20,
            width: 260,
            height: 40,
            style: { fontFamily: 'Noto Sans', fontSize: 28, fontWeight: 800, color: '#15121AFF' },
          },
          badge: { x: 180, y: 130, width: 100, height: 100 },
        },
      },
    ],
  )
  return {
    ...summer,
    pages: { p1: { name: 'Summer', order: 'a0' }, p2: { name: 'Diwali', order: 'a1' } },
    frames: {
      ...summer.frames,
      one: {
        pageId: 'p2',
        name: 'Sale',
        width: 1080,
        height: 1080,
        x: 0,
        y: 0,
        fills: solid('#15121AFF'),
        order: 'a0',
      },
    },
    nodes: {
      ...summer.nodes,
      offer: {
        type: 'text',
        parentId: 'one',
        link: 'offer',
        index: 'a0',
        name: 'Offer',
        props: {
          x: 80,
          y: 460,
          width: 920,
          height: 140,
          text: '30% off',
          style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFFFF' },
        },
      },
    },
  }
}

/** The first page's frames in its order, and the names Export lists them by. */
const SUMMER = ['sq', 'story', 'banner', 'mpu']
const LISTED = ['Sale', 'Sale 2', 'Banner', 'sale 3']

/** Opens the design alone in a tab of a theme at a screen size, fitted, with its fonts loaded. */
async function openSized(browser: Browser, viewport: { width: number; height: number }, theme = 'dark') {
  const designId = await seed(design())
  const page = await (await browser.newContext({ viewport, acceptDownloads: true })).newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await page.evaluate(() => window.dazbee?.loaded())
  await fitSettled(page)
  return { page, errors }
}

/**
 * The layout problems while Export is open: the chrome it floats over is hidden while they are
 * measured, so what is left is Export's own and the rest of the chrome's.
 */
async function problemsWithExport(page: Page) {
  const hide = (hidden: boolean) =>
    page.evaluate(
      ([selector, hidden]) => {
        for (const el of document.querySelectorAll<HTMLElement>(selector)) el.style.visibility = hidden ? 'hidden' : ''
      },
      [UNDER_MENUS, hidden] as const,
    )
  await hide(true)
  try {
    return await layoutProblems(page, { pieces: PIECES, uncut: LABELS })
  } finally {
    await hide(false)
  }
}

/** Each row of the frames list: its name, its size and whether it is ticked, the All frames row first when it shows. */
const rows = (dialog: Locator) =>
  dialog
    .getByTestId('export-frames')
    .locator('label')
    .evaluateAll((labels) =>
      labels.map((label) => {
        const input = label.querySelector('input')
        const [name, size] = [...label.querySelectorAll('span:not([aria-hidden])')].map((span) => span.textContent)
        return {
          name,
          size,
          on: input?.indeterminate ? 'mixed' : (input?.checked ?? false),
          frame: input?.dataset.frame,
        }
      }),
    )
const names = async (dialog: Locator) => (await rows(dialog)).map((row) => row.name)

/** Node's export of a request over the design as the page holds it now, with the shipped fonts. */
async function nodeExport(page: Page) {
  const ck = await loadCanvasKit()
  const json = JSON.parse(await designOf(page)) as unknown
  return (request: { frameIds: string[]; type: ExportType }) => exportDesign(ck, json, request, fixtureResources())
}

/** Clicks Export and reads what downloads: its name, and each file in it with its bytes. */
async function runExport(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  const bytes = new Uint8Array(readFileSync(await download.path()))
  const name = download.suggestedFilename()
  return { name, files: name.endsWith('.zip') ? readZip(bytes) : [{ path: name, bytes }] }
}

/** Whether what downloaded is, file for file and byte for byte, what Node exports of the same request. */
async function expectNode(
  page: Page,
  request: { frameIds: string[]; type: ExportType },
  got: Awaited<ReturnType<typeof runExport>>,
) {
  const node = (await nodeExport(page))(request)
  const want = node.name.endsWith('.zip') ? readZip(node.bytes) : [{ path: node.name, bytes: node.bytes }]
  expect(got.name, `${request.type} download`).toBe(node.name)
  expect(got.files.map((f) => f.path)).toEqual(want.map((f) => f.path))
  for (const [i, file] of got.files.entries())
    expect(Buffer.from(file.bytes).equals(Buffer.from(want[i]?.bytes ?? [])), `${file.path} is Node's`).toBe(true)
}

async function openExport(page: Page) {
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  return dialog
}

test('Export lists the shown page’s frames, all ticked, numbered where names repeat; each file type exports the ticked frames as Node does', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const dialog = await openExport(page)
  expect(await rows(dialog)).toEqual([
    { name: 'All frames', size: undefined, on: true, frame: undefined },
    { name: 'Sale', size: '1080 × 1080', on: true, frame: 'sq' },
    { name: 'Sale 2', size: '1080 × 1920', on: true, frame: 'story' },
    { name: 'Banner', size: '1200 × 628', on: true, frame: 'banner' },
    { name: 'sale 3', size: '300 × 250', on: true, frame: 'mpu' },
  ])
  await expect(page.getByTestId('export-run')).toHaveText('Export 4 files')
  // The page is the shown one, and the field lists the other.
  await expect(dialog.getByTestId('export-page')).toContainText('Summer')

  // Every frame, as each file type: one flat zip, named after the design, its files after the frames.
  for (const type of TYPES) {
    await dialog.locator(`[data-type="${type}"]`).click()
    const got = await runExport(page)
    expect(got.name).toBe('Weekend sale.zip')
    expect(got.files.map((f) => f.path)).toEqual(LISTED.map((name) => `${name}.${type}`))
    await expectNode(page, { frameIds: SUMMER, type }, got)
  }

  // Untick the first Sale and Banner by a click: All frames shows some, and the two left keep their numbers.
  await dialog.getByText('Sale', { exact: true }).click()
  await dialog.getByText('Banner', { exact: true }).click()
  expect((await rows(dialog)).map((row) => row.on)).toEqual(['mixed', false, true, false, true])
  await expect(page.getByTestId('export-run')).toHaveText('Export 2 files')
  writeOutput('export-frames-1-some.png', await page.screenshot({ animations: 'disabled' }))
  for (const type of TYPES) {
    await dialog.locator(`[data-type="${type}"]`).click()
    const got = await runExport(page)
    expect(got.files.map((f) => f.path)).toEqual([`Sale 2.${type}`, `sale 3.${type}`])
    await expectNode(page, { frameIds: ['story', 'mpu'], type }, got)
  }
  // The File names field's {frame} is the numbered name too.
  await page.getByTestId('export-name').fill('{design} - {frame}')
  const named = await runExport(page)
  expect(named.files.map((f) => f.path)).toEqual(['Weekend sale - Sale 2.svg', 'Weekend sale - sale 3.svg'])

  // All frames from some ticks them all; again unticks them all, and Export waits for one.
  await dialog.getByText('All frames').click()
  expect((await rows(dialog)).map((row) => row.on)).toEqual([true, true, true, true, true])
  await dialog.getByText('All frames').click()
  expect((await rows(dialog)).map((row) => row.on)).toEqual([false, false, false, false, false])
  await expect(page.getByTestId('export-run')).toBeDisabled()
  // Exporting wrote nothing to the design.
  expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)
  expect(errors).toEqual([])
})

test('a page of one frame lists it alone and exports it as itself, the same bytes as Node, its name kept on its own page', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const dialog = await openExport(page)
  await dialog.getByTestId('export-page').click()
  await page.locator('[role="listbox"] [role="option"][data-value="p2"]').click()
  // Sale is Sale here: numbers count within a page. No All frames row for one frame.
  expect(await rows(dialog)).toEqual([{ name: 'Sale', size: '1080 × 1080', on: true, frame: 'one' }])
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  for (const type of TYPES) {
    await dialog.locator(`[data-type="${type}"]`).click()
    const got = await runExport(page)
    expect(got.name).toBe(`Sale.${type}`)
    await expectNode(page, { frameIds: ['one'], type }, got)
  }
  // Back on Summer, every frame is ticked again.
  await dialog.getByTestId('export-page').click()
  await page.locator('[role="listbox"] [role="option"][data-value="p1"]').click()
  expect(await names(dialog)).toEqual(['All frames', ...LISTED])
  expect((await rows(dialog)).every((row) => row.on === true)).toBe(true)

  // A page with no frames says so, and Export waits.
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dazbee?.showPage('p2'))
  await page.evaluate(() => window.dazbee?.pickFrame('one'))
  await page.evaluate(() => window.dazbee?.perform('delete'))
  await expect.poll(() => page.evaluate(() => window.dazbee?.pickedFrame() ?? null)).toBeNull()
  await openExport(page)
  await dialog.getByTestId('export-page').click()
  await page.locator('[role="listbox"] [role="option"][data-value="p2"]').click()
  await expect(dialog.getByTestId('export-no-frames')).toHaveText('This page has no frames')
  await expect(page.getByTestId('export-run')).toBeDisabled()
  expect(errors).toEqual([])
})

test('by keyboard: Export opens on its first control, Tab and Space tick frames and All frames, Enter exports, Esc gives the focus back to Share', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const share = page.getByTestId('share-open')
  await share.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('export-open')).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByTestId('export')
  await expect(dialog.getByTestId('export-page')).toBeFocused()
  await page.keyboard.press('Tab')
  const all = dialog.getByTestId('export-all-frames')
  await expect(all).toBeFocused()
  // The row reached by keyboard shows it: lit and ringed.
  const ring = await all.locator('xpath=..').evaluate((label) => getComputedStyle(label).outlineStyle)
  expect(ring).toBe('solid')
  await page.keyboard.press('Space')
  expect((await rows(dialog)).map((row) => row.on)).toEqual([false, false, false, false, false])
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(dialog.locator('[data-frame="story"]')).toBeFocused()
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(dialog.locator('[data-frame="mpu"]')).toBeFocused()
  await page.keyboard.press('Space')
  expect((await rows(dialog)).map((row) => row.on)).toEqual(['mixed', false, true, false, true])
  // Space never reached the stage: nothing moved, no tool changed.
  expect(await page.evaluate(() => window.dazbee?.tool())).toBe('select')
  // On to the file type, PDF picked, then Export.
  await page.keyboard.press('Tab')
  await expect(dialog.locator('[data-type="png"]')).toBeFocused()
  await dialog.locator('[data-type="pdf"]').focus()
  await page.keyboard.press('Enter')
  await expect(dialog.locator('[data-type="pdf"]')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('export-run').focus()
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
  const files = readZip(new Uint8Array(readFileSync(await download.path())))
  expect(files.map((f) => f.path)).toEqual(['Sale 2.pdf', 'sale 3.pdf'])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(share).toBeFocused()
  expect(errors).toEqual([])
})

test('a picked frame’s ⋯ has Export after Rename, before the line and Delete: it opens Export with that frame ticked alone, by mouse and by keyboard', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  await clickLabel(page, 'story')
  expect(await picked(page)).toBe('story')
  const menu = await barMenu(page, 'frame-more')
  const items = await menu
    .locator('button, [role="separator"]')
    .evaluateAll((all) => all.map((el) => el.getAttribute('data-action') ?? el.getAttribute('role')))
  expect(items.slice(items.indexOf('rename'))).toEqual(['rename', 'export', 'separator', 'delete'])
  await menu.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(menu).toBeHidden()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  expect((await rows(dialog)).map((row) => [row.name, row.on])).toEqual([
    ['All frames', 'mixed'],
    ['Sale', false],
    ['Sale 2', true],
    ['Banner', false],
    ['sale 3', false],
  ])
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  // The frame stays picked.
  expect(await picked(page)).toBe('story')
  const got = await runExport(page)
  expect(got.name).toBe('Sale 2.png')
  await expectNode(page, { frameIds: ['story'], type: 'png' }, got)
  // Esc closes Export first, with the focus back on ⋯; the next lets the frame go.
  await page.getByTestId('export-run').focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('bar-frame-more')).toBeFocused()
  expect(await picked(page)).toBe('story')

  // By keyboard, from the banner: Tab to the bar, along to ⋯, Enter, Tab down to Export, Enter.
  await clickLabel(page, 'banner')
  expect(await picked(page)).toBe('banner')
  // The bar's one Tab stop is the item last focused in it, ⋯ here.
  expect(await tabToBar(page)).toBe('bar-frame-more')
  await page.keyboard.press('Enter')
  const exportItem = menu.getByRole('button', { name: 'Export', exact: true })
  for (let i = 0; i < 6 && !(await exportItem.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(exportItem).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('export-page')).toBeFocused()
  expect((await rows(dialog)).filter((row) => row.on === true).map((row) => row.frame)).toEqual(['banner'])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('bar-frame-more')).toBeFocused()
  // Share opens Export with every frame ticked again.
  const share = await openExport(page)
  expect((await rows(share)).every((row) => row.on === true)).toBe(true)
  expect(errors).toEqual([])
})

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} Export and a picked frame’s ⋯ sit clear of everything, the frames list whole and its rows tall enough`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height })
    const dialog = await openExport(page)
    await nextFrame(page)
    expect(await problemsWithExport(page)).toEqual([])
    expect(await names(dialog)).toEqual(['All frames', ...LISTED])
    // Inside the window, every row whole; on a phone each row 44 px tall for a finger.
    const box = await dialog.boundingBox()
    if (!box) throw new Error('no export')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    for (const row of await dialog.getByTestId('export-frames').locator('label').all()) {
      const at = await row.boundingBox()
      expect(at && at.height >= (width < 640 ? 44 : 28)).toBe(true)
    }
    // The page's five rows show whole, with no scrolling.
    expect(await dialog.getByTestId('export-frames').evaluate((list) => list.scrollHeight <= list.clientHeight)).toBe(
      true,
    )
    // A tap on a row unticks it, on every screen.
    await dialog.getByText('Banner', { exact: true }).click()
    await expect(page.getByTestId('export-run')).toHaveText('Export 3 files')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await clickLabel(page, 'sq')
    await barMenu(page, 'frame-more')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: LABELS })).toEqual([])
    await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Export', exact: true }).click()
    await expect(dialog).toBeVisible()
    await nextFrame(page)
    expect(await problemsWithExport(page)).toEqual([])
    expect((await rows(dialog)).filter((row) => row.on === true).map((row) => row.frame)).toEqual(['sq'])
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: Export listing the page's frames, and a picked frame's ⋯ with Export`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, theme)
        const dialog = await openExport(page)
        await dialog.getByText('Banner', { exact: true }).click()
        await page.mouse.move(0, height - 1)
        await drawn(page)
        writeOutput(`export-frames-${width}-${theme}-1-list.png`, await page.screenshot({ animations: 'disabled' }))
        await page.keyboard.press('Escape')
        await clickLabel(page, 'story')
        await barMenu(page, 'frame-more')
        await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Export', exact: true }).hover()
        await drawn(page)
        writeOutput(`export-frames-${width}-${theme}-2-menu.png`, await page.screenshot({ animations: 'disabled' }))
        await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Export', exact: true }).click()
        await expect(dialog).toBeVisible()
        await page.mouse.move(0, height - 1)
        await drawn(page)
        writeOutput(`export-frames-${width}-${theme}-3-one.png`, await page.screenshot({ animations: 'disabled' }))
        expect(errors).toEqual([])
      },
    )
  }
}
