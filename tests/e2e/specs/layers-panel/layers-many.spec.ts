// The layers panel (#59) with 300 layers: only the rows in view are in the page as it scrolls, the
// focused row stays focused and reachable by Tab when it scrolls away, and what scrolling the panel
// takes.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { layerIds, openLayers, rect, ROW, row, tabIntoTree, tree } from '../../support/layers-panel.ts'
import { PERF, report, spread } from '../../support/perf.ts'
import { frameDesign, type Seeded } from '../../support/seed.ts'
import { openStage, props, selection } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

/** How far one turn of the wheel scrolls the 300 layers, in pixels. */
const WHEEL = 420

/** A design of 300 layers. */
const threeHundred = (): DesignInput => {
  const nodes: Record<string, Seeded> = {}
  for (let i = 0; i < 300; i++) {
    const index = `a${String(i).padStart(3, '0')}`
    nodes[`n${i}`] = {
      type: 'graphic',
      parentId: 'sq',
      index,
      name: `Layer ${i + 1}`,
      props: rect(20 + (i % 20) * 52, 20 + Math.floor(i / 20) * 70, 44, 60, i % 2 ? '#14213DFF' : '#FCA311FF'),
    }
  }
  return frameDesign({ name: 'Layers panel', nodes })
}

/**
 * The rows in the page: how many, the first one's place in the list (from 0, by where it is drawn),
 * the first row in view, how many rows the view holds, and how far the panel can scroll. The row Tab
 * lands on stays in the page wherever the list is scrolled, so it counts for the first only when it
 * is next to the other rows.
 */
const mounted = (scroller: Locator) =>
  scroller.evaluate((el, row) => {
    const rows = [...el.querySelectorAll<HTMLElement>('[role=treeitem]')]
    const places = rows.map((r) => Math.round(Number.parseFloat(r.style.top) / row))
    const tab = rows.findIndex((r) => r.tabIndex === 0)
    const run = places.filter((at, i) => i !== tab || places.includes(at - 1) || places.includes(at + 1))
    return {
      count: rows.length,
      first: Math.min(...run),
      inView: Math.floor(el.scrollTop / row),
      fits: Math.ceil(el.clientHeight / row),
      range: el.scrollHeight - el.clientHeight,
    }
  }, ROW)

/** Turns the wheel over the panel, then waits until the panel has scrolled. */
async function wheel(page: Page, scroller: Locator, dy: number) {
  const before = await scroller.evaluate((el) => el.scrollTop)
  await page.mouse.wheel(0, dy)
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).not.toBe(before)
}

/**
 * Of 300 layers, clicks Layer 168 (listed 133rd, topmost first), then turns the wheel twice so its
 * row is well above the view.
 */
async function clickThenScrollAway(page: Page) {
  const scroller = page.getByTestId('layers-scroller')
  await scroller.evaluate((el, row) => (el.scrollTop = 128 * row), ROW)
  await expect(row(page, 'Layer 168')).toBeInViewport()
  await row(page, 'Layer 168').click()
  await expect(row(page, 'Layer 168')).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['n167'])
  await scroller.hover()
  await wheel(page, scroller, WHEEL)
  await wheel(page, scroller, WHEEL)
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(133 * ROW)
}

test('300 layers: only the rows in view are in the page, and they follow the scroll', async ({ browser }) => {
  const { page, errors } = await openStage(browser, threeHundred())
  await openLayers(page)
  const scroller = page.getByTestId('layers-scroller')
  const top = await mounted(scroller)
  expect(top.count).toBeLessThan(60)
  // The frame's row, then its 300 layers.
  expect(await tree(page).evaluate((el) => el.getBoundingClientRect().height)).toBe(301 * ROW)
  // The rows the panel keeps in the page past the end of the view, read once at the top.
  const overscan = top.count - top.fits
  expect(overscan).toBeGreaterThan(0)
  // Twenty turns down stay well inside the scroll range, so every turn scrolls.
  expect(top.range).toBeGreaterThan(20 * WHEEL + 10 * ROW)

  // Scroll top to bottom and back with the wheel. After every turn the first row in the page is
  // the first in view or at most the overscan above it, however long the machine took to scroll.
  await scroller.hover()
  for (let i = 0; i < 40; i++) {
    await wheel(page, scroller, i < 20 ? WHEEL : -WHEEL)
    await expect
      .poll(async () => {
        const { first, inView } = await mounted(scroller)
        return { first, inView, followed: first <= inView && first >= inView - overscan }
      })
      .toMatchObject({ followed: true })
    expect((await mounted(scroller)).count).toBeLessThan(60)
  }
  // Back at the top, the first row shows.
  await expect(row(page, 'Layer 300')).toBeInViewport()

  // End reaches the last row, which is then in the page and in view.
  await tree(page).getByRole('treeitem').first().focus()
  await page.keyboard.press('End')
  await expect(row(page, 'Layer 1')).toBeFocused()
  await expect(row(page, 'Layer 1')).toBeInViewport()
  expect(await tree(page).getByRole('treeitem').count()).toBeLessThan(60)
  writeOutput('layers-5-300-layers.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('300 layers: the arrows keep moving through the tree after the focused row scrolls out of view', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, threeHundred())
  await openLayers(page)
  await clickThenScrollAway(page)
  // The focus is still on Layer 168's row, out of view.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-layer'))).toBe('n167')

  // Down selects the next row and scrolls to it; the layer on the canvas stays where it was.
  const before = await props(page, 'n167')
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Layer 167')).toBeFocused()
  await expect(row(page, 'Layer 167')).toBeInViewport()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['n166'])
  expect(await props(page, 'n167')).toMatchObject({ x: before.x, y: before.y })
  writeOutput('layers-10-arrow-after-scroll.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('300 layers: Tab reaches the tree on the selected row when it is scrolled out of view', async ({ browser }) => {
  const { page, errors } = await openStage(browser, threeHundred())
  await openLayers(page)
  await clickThenScrollAway(page)

  await tabIntoTree(page)
  await expect(row(page, 'Layer 168')).toBeFocused()
  await expect(row(page, 'Layer 168')).toBeInViewport()
  writeOutput('layers-11-tab-to-scrolled-row.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('300 layers: the bottom row deleted and brought back by undo is focused and selected', async ({ browser }) => {
  const { page, errors } = await openStage(browser, threeHundred())
  await openLayers(page)
  await tree(page).getByRole('treeitem').first().focus()
  await page.keyboard.press('End')
  await expect(row(page, 'Layer 1')).toBeFocused()

  // Delete the last row: the focus and the selection go to the row now last.
  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('n0')
  await expect(row(page, 'Layer 2')).toBeFocused()
  await expect.poll(() => selection(page)).toEqual(['n1'])
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 'Layer 3')).toBeFocused()

  // Undo: Layer 1 is back, focused and selected, and Delete deletes it, not Layer 3.
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => layerIds(page)).toContain('n0')
  await expect(row(page, 'Layer 1')).toBeFocused()
  await expect.poll(() => selection(page)).toEqual(['n0'])
  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('n0')
  expect(await layerIds(page)).toContain('n2')
  expect(errors).toEqual([])
})

test('300 layers: what scrolling the panel takes', PERF, async ({ browser }) => {
  const { page } = await openStage(browser, threeHundred())
  await openLayers(page)
  const scroller = page.getByTestId('layers-scroller')

  // Records every frame's time, in ms, until the returned function stops it and hands them over.
  const recordFrames = async () => {
    await page.evaluate(() => {
      const frames: number[] = []
      const state = { frames, recording: true }
      ;(window as unknown as { frameTimes: typeof state }).frameTimes = state
      let last = performance.now()
      const tick = (now: number) => {
        frames.push(now - last)
        last = now
        if (state.recording) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return () =>
      page.evaluate(() => {
        const state = (window as unknown as { frameTimes: { frames: number[]; recording: boolean } }).frameTimes
        state.recording = false
        return state.frames.slice(1)
      })
  }
  // The page at rest with the panel open: what this machine's frames take with nothing moving. In
  // headless Chromium the frosted panels are composited in software, which is most of a frame here.
  await scroller.hover()
  const stopIdle = await recordFrames()
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)))
  const idle = await stopIdle()
  // Script time in every long frame (over 50 ms) while scrolling, from the long animation frame
  // timings: what the panel itself costs, apart from compositing.
  await page.evaluate(() => {
    const seen: number[] = []
    ;(window as unknown as { scripts: number[] }).scripts = seen
    new PerformanceObserver((list) => {
      for (const frame of list.getEntries() as unknown as { scripts: { duration: number }[] }[])
        seen.push(frame.scripts.reduce((sum, s) => sum + s.duration, 0))
    }).observe({ type: 'long-animation-frame' })
  })
  // Then scroll top to bottom and back with the wheel.
  const stopScrolling = await recordFrames()
  for (let i = 0; i < 40; i++) await wheel(page, scroller, i < 20 ? WHEEL : -WHEEL)
  const scrolling = await stopScrolling()
  const scripts = await page.evaluate(() => (window as unknown as { scripts: number[] }).scripts)
  report('Layers panel, 300 layers', {
    'frame at rest': spread(idle),
    'frame while scrolling': spread(scrolling),
    'script in a long frame while scrolling': spread(scripts),
  })
})
