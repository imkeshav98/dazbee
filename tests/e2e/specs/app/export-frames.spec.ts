// Export lists frames: the Export menu lists the shown page's frames, each with a tick, all ticked,
// by the names their files take, numbered where frames share a name; each file type exports the
// ticked frames, byte for byte what Node exports of the same request; a page of one frame exports it
// as itself; and a picked frame's ⋯ opens Export with that frame ticked alone. By mouse and by
// keyboard, at the three screen sizes, with the PR's pictures in both themes.
import { readFileSync } from 'node:fs'

import { readZip } from '@dazbee/export'

import { writeOutput } from '../../support/editor.ts'
import { expectNode, openExport, runExport } from '../../support/export.ts'
import { adsDesign, LISTED, names, openSized, rows, SUMMER } from '../../support/export-frames.ts'
import { choose } from '../../support/fields.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

const TYPES = ['png', 'jpg', 'pdf', 'svg'] as const

/**
 * The words of each element a locator finds in the order they are drawn, from left to right: a
 * size reads "1080 × 1920" here when its width is drawn first.
 */
const asRead = (found: Locator) =>
  found.evaluateAll((els) =>
    els.map((el) => {
      const words: [number, string][] = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        for (const match of text.matchAll(/\S+/g)) {
          const range = document.createRange()
          range.setStart(node, match.index)
          range.setEnd(node, match.index + match[0].length)
          words.push([range.getBoundingClientRect().left, match[0]])
        }
      }
      return words
        .sort((a, b) => a[0] - b[0])
        .map(([, word]) => word)
        .join(' ')
    }),
  )

/** The frames lit on the canvas from outside the stage, by id, and those whose label is lit so. */
const lit = (page: Page) =>
  page.locator('.stage-overlay').evaluate((overlay) => ({
    frames: [...overlay.querySelectorAll<HTMLElement>('.frame-lit')].map((el) => el.dataset.frame),
    labels: [...overlay.querySelectorAll<HTMLElement>('.frame-label[data-lit]')].map((el) => el.dataset.frame),
  }))

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
  await dialog.locator('label:has([data-frame="sq"])').click()
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
  await choose(dialog.getByTestId('export-page'), 'p2')
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
  await choose(dialog.getByTestId('export-page'), 'p1')
  expect(await names(dialog)).toEqual(['All frames', ...LISTED])
  expect((await rows(dialog)).every((row) => row.on === true)).toBe(true)

  // A page with no frames says so, and Export waits.
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dazbee?.showPage('p2'))
  await page.evaluate(() => window.dazbee?.pickFrame('one'))
  await page.evaluate(() => window.dazbee?.perform('delete'))
  await expect.poll(() => page.evaluate(() => window.dazbee?.pickedFrame() ?? null)).toBeNull()
  await openExport(page)
  await choose(dialog.getByTestId('export-page'), 'p2')
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

test('each row shows its frame’s own name, as its label does, and the number its file takes after it, muted', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const dialog = await openExport(page)
  await page.mouse.move(0, 759)
  const muted = await dialog.getByText('Frames', { exact: true }).evaluate((el) => getComputedStyle(el).color)
  const shown = (frameId: string) =>
    dialog.locator(`label:has([data-frame="${frameId}"])`).evaluate((label) => {
      const [name, number] = ['name', 'number'].map((part) => label.querySelector(`[data-part="${part}"]`))
      return {
        name: name?.textContent,
        number: number?.textContent ?? null,
        colours: [name, number].map((el) => el && getComputedStyle(el).color),
      }
    })
  const text = await dialog.evaluate((el) => getComputedStyle(el).color)
  expect(await shown('sq')).toEqual({ name: 'Sale', number: null, colours: [text, null] })
  expect(await shown('story')).toEqual({ name: 'Sale', number: '2', colours: [text, muted] })
  expect(await shown('mpu')).toEqual({ name: 'sale', number: '3', colours: [text, muted] })
  expect(muted).not.toBe(text)
  // The name is the one on the frame's label.
  for (const frameId of SUMMER)
    expect((await shown(frameId)).name).toBe(
      await page.locator(`.stage-overlay .frame-label[data-frame="${frameId}"] .frame-name`).textContent(),
    )
  expect(errors).toEqual([])
})

test('frames whose names file alike are numbered by the names their files take, the list and the files agreeing, one exported alone too', async ({
  browser,
}) => {
  const ads = adsDesign(2)
  const named = (frameId: string, name: string) => ({ ...ads.frames[frameId], name }) as (typeof ads.frames)[string]
  const input = { ...ads, frames: { ad1: named('ad1', 'Sale/Promo'), ad2: named('ad2', 'Sale-Promo') } }
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { input })
  const dialog = await openExport(page)
  expect((await rows(dialog)).map((row) => row.name)).toEqual(['All frames', 'Sale/Promo', 'Sale-Promo 2'])
  const both = await runExport(page)
  expect(both.files.map((f) => f.path)).toEqual(['Sale-Promo.png', 'Sale-Promo 2.png'])
  await dialog.getByText('Sale/Promo', { exact: true }).click()
  expect((await runExport(page)).name).toBe('Sale-Promo 2.png')
  expect(errors).toEqual([])
})

test('with nothing ticked the greyed Export says why in a tooltip, under the pointer and by keyboard, and does nothing', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const dialog = await openExport(page)
  const run = page.getByTestId('export-run')
  const why = page.getByRole('tooltip').filter({ hasText: 'Tick a frame to export' })
  await dialog.getByText('All frames').click()
  await expect(run).toBeDisabled()
  await run.hover()
  await expect(why).toHaveCount(1)
  // A click downloads nothing.
  let downloads = 0
  page.on('download', () => downloads++)
  await run.click({ force: true })
  await page.mouse.move(0, 759)
  await expect(why).toHaveCount(0)
  // Reached by Tab, it says so too; ticking a frame takes the tooltip away.
  await dialog.getByTestId('export-name').focus()
  await page.keyboard.press('Tab')
  await expect(run).toBeFocused()
  await expect(why).toHaveCount(1)
  await dialog.getByText('Banner', { exact: true }).click()
  await expect(run).toBeEnabled()
  await expect(run).toHaveText('Export 1 file')
  await run.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  expect(downloads).toBe(0)
  expect(errors).toEqual([])
})

test('in Arabic each row’s size reads width × height, as its frame’s label on the canvas does', async ({ browser }) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { locale: 'ar' })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  const dialog = await openExport(page)
  const sizes = await asRead(dialog.locator('label:has([data-frame]) > :last-child'))
  expect(sizes).toEqual(['1080 × 1080', '1080 × 1920', '1200 × 628', '300 × 250'])
  // Each label that shows its size, as a small frame's drops it, reads as its row does.
  const labels = await page
    .locator('.stage-overlay .frame-label:has(.frame-size)')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.frame))
  expect(labels.length).toBeGreaterThanOrEqual(3)
  for (const frameId of labels)
    expect(await asRead(page.locator(`.stage-overlay .frame-label[data-frame="${frameId}"] .frame-size`))).toEqual([
      sizes[SUMMER.indexOf(frameId ?? '')],
    ])
  expect(errors).toEqual([])
})

test('a row reached by Tab, down the list and back up, scrolls whole into view, its ring and all', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { input: adsDesign(14) })
  const dialog = await openExport(page)
  const list = dialog.getByTestId('export-frames')
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  /** How much of the focused row the list hides, above and below, in pixels. */
  const hidden = () =>
    list.evaluate((el) => {
      const row = document.activeElement?.closest('label')
      if (!row || !el.contains(row)) throw new Error('no row has the focus')
      const [box, at] = [el.getBoundingClientRect(), row.getBoundingClientRect()]
      return { above: Math.max(0, box.top - at.top), below: Math.max(0, at.bottom - box.bottom) }
    })
  await dialog.getByTestId('export-all-frames').focus()
  for (let i = 1; i <= 14; i++) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(`[data-frame="ad${i}"]`)).toBeFocused()
    expect(await hidden(), `Ad ${i}`).toEqual({ above: 0, below: 0 })
  }
  for (let i = 13; i >= 1; i--) {
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.locator(`[data-frame="ad${i}"]`)).toBeFocused()
    expect(await hidden(), `Ad ${i}`).toEqual({ above: 0, below: 0 })
  }
  expect(errors).toEqual([])
})

test('a row under the pointer or reached by keyboard lights its frame on the canvas, as a layer under the pointer is lit, until it is left', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const dialog = await openExport(page)
  const none = { frames: [], labels: [] }
  expect(await lit(page)).toEqual(none)
  const row = (frameId: string) => dialog.locator(`label:has([data-frame="${frameId}"])`)
  // The two Sales tell apart: each lights its own frame, and the All frames row none.
  await row('story').hover()
  await expect.poll(() => lit(page)).toEqual({ frames: ['story'], labels: ['story'] })
  const outline = await page.locator('.stage-overlay .frame-lit').evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('solid')
  await row('sq').hover()
  await expect.poll(() => lit(page)).toEqual({ frames: ['sq'], labels: ['sq'] })
  await dialog.getByTestId('export-all-frames').locator('xpath=..').hover()
  await expect.poll(() => lit(page)).toEqual(none)
  await row('mpu').hover()
  await expect.poll(() => lit(page)).toEqual({ frames: ['mpu'], labels: ['mpu'] })
  await page.mouse.move(640, 740)
  await expect.poll(() => lit(page)).toEqual(none)

  // By keyboard: the row with the focus lights its frame, and the next takes over.
  await dialog.getByTestId('export-page').focus()
  await page.keyboard.press('Tab')
  await expect.poll(() => lit(page)).toEqual(none)
  await page.keyboard.press('Tab')
  await expect.poll(() => lit(page)).toEqual({ frames: ['sq'], labels: ['sq'] })
  await page.keyboard.press('Tab')
  await expect.poll(() => lit(page)).toEqual({ frames: ['story'], labels: ['story'] })
  // Leaving the list, or closing Export, lets it go.
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => lit(page)).toEqual({ frames: ['sq'], labels: ['sq'] })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(() => lit(page)).toEqual(none)
  expect(errors).toEqual([])
})
