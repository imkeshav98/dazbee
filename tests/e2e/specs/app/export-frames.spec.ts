// Export lists frames: the Export menu lists the shown page's frames, each with a tick, all ticked,
// by the names their files take, numbered where frames share a name; each file type exports the
// ticked frames, byte for byte what Node exports of the same request; a page of one frame exports it
// as itself; and a picked frame's ⋯ opens Export with that frame ticked alone. By mouse and by
// keyboard, at the three screen sizes, with the PR's pictures in both themes.
import { readFileSync } from 'node:fs'

import { readZip } from '@dazbee/export'

import { writeOutput } from '../../support/editor.ts'
import { expectNode, openExport, runExport } from '../../support/export.ts'
import { LISTED, names, openSized, rows, SUMMER } from '../../support/export-frames.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

const TYPES = ['png', 'jpg', 'pdf', 'svg'] as const

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
