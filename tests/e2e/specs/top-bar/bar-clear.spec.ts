// On a phone, the move that brings a selection clear under the top bar happens once, for the
// selection as it is made: a zoom, a pan or a drag the person starts straight after a tap or a
// selection made another way is never followed, or interrupted, by a move they didn't ask for.
import { photo, upload } from '../../support/assets.ts'
import { editorPath, setCookies } from '../../support/editor.ts'
import { seed } from '../../support/seed.ts'
import { fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, test } from '../../support/test.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

/** Opens the top bar design on a phone that takes touches. */
async function openPhone(browser: Browser, designId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme: 'dark', locale: 'en' })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await fitSettled(page)
  return { page, errors }
}

let designId: string

test.beforeAll(async () => {
  designId = await seed(topBarDesign((await upload(photo)).id))
})

test('on a phone a zoom, a pan or a drag straight after a selection whose frame label is under the bar is never followed by a move it did not ask for', async ({
  browser,
}) => {
  const { page, errors } = await openPhone(browser, designId)
  const touch = await page.context().newCDPSession(page)
  const touchAt = (type: 'touchStart' | 'touchMove' | 'touchEnd', at?: { x: number; y: number }) =>
    touch.send('Input.dispatchTouchEvent', { type, touchPoints: at ? [at] : [] })
  // Where the bar's lower row ends with the box selected, once it has settled.
  await selectLayers(page, ['box'], { bar: true })
  await nextFrame(page)
  await nextFrame(page)
  const bar = await page.getByTestId('top-bar').boundingBox()
  const barBottom = (bar?.y ?? 0) + (bar?.height ?? 0)
  for (const by of ['tap', 'select'] as const)
    for (const gesture of ['zoom', 'pan', 'drag'] as const) {
      const what = `${gesture} after a ${by}`
      await selectLayers(page, [])
      // At 100% the box sits clear below the bar with its frame's label under it, so the move that
      // clears the label takes the box down less than the finger's 40 px from its top and bottom.
      // The camera is kept as the gesture's first event is heard, past a tap's own press, and once
      // its last has been handled.
      const { at, before } = await page.evaluate(
        ({ top, tap }) => {
          const editor = window.dazbee
          const box = editor?.boxOf('box')
          if (!editor || !box) throw new Error('no box')
          editor.setCamera({ ...editor.camera(), zoom: 1 })
          const now = editor.camera()
          const was = editor.screenPoint(box.x + box.width / 2, box.y)
          editor.setCamera({ ...now, x: now.x + 195 - was.x, y: now.y + top - was.y })
          const seen = { tap, start: '', end: '' }
          const first = (event: Event) => {
            if (seen.tap && event.type === 'pointerdown') seen.tap = false
            else seen.start ||= JSON.stringify(editor.camera())
          }
          const last = () => {
            if (seen.start) seen.end = JSON.stringify(editor.camera())
          }
          for (const type of ['pointerdown', 'wheel']) window.addEventListener(type, first, true)
          for (const type of ['pointerup', 'wheel']) window.addEventListener(type, last)
          ;(window as unknown as { gesture: typeof seen }).gesture = seen
          return { at: { x: 195, y: top + 120 }, before: box }
        },
        { top: barBottom + 156, tap: by === 'tap' },
      )
      await nextFrame(page)
      if (by === 'tap') {
        await touchAt('touchStart', at)
        await touchAt('touchEnd')
      } else await page.evaluate(() => window.dazbee?.select(['box']))
      // A pinch, as Chromium sends it (a wheel with Ctrl), and a scroll, each under the finger.
      const wheel = { type: 'mouseWheel', ...at, deltaX: 0, deltaY: -100 } as const
      if (gesture !== 'drag')
        await touch.send('Input.dispatchMouseEvent', { ...wheel, modifiers: gesture === 'zoom' ? 2 : 0 })
      if (gesture === 'drag') {
        await touchAt('touchStart', at)
        for (let step = 1; step <= 16; step++) await touchAt('touchMove', { x: at.x + step * 2.5, y: at.y })
        await touchAt('touchEnd')
      }
      // Long enough for any look the bar would take once its rows have settled.
      await page.waitForTimeout(500)
      expect(await page.evaluate(() => window.dazbee?.selection()), what).toEqual(['box'])
      const { start, end, now } = await page.evaluate(() => {
        const { start, end } = (window as unknown as { gesture: { start: string; end: string } }).gesture
        return { start: JSON.parse(start), end: JSON.parse(end), now: window.dazbee?.camera() }
      })
      expect(now, `${what}: no move after it`).toEqual(end)
      if (gesture === 'zoom') expect(end.zoom, `${what}: zoomed`).toBeGreaterThan(start.zoom)
      if (gesture === 'pan') expect(end, `${what}: panned by the wheel alone`).toEqual({ ...start, y: start.y + 100 })
      if (gesture === 'drag') {
        expect(end, `${what}: no move during it`).toEqual(start)
        const after = await page.evaluate(() => window.dazbee?.boxOf('box'))
        expect((after?.x ?? 0) - before.x, `${what}: moved with the finger`).toBeCloseTo(40, 0)
        expect(after?.y, `${what}: moved along the finger only`).toBeCloseTo(before.y, 0)
      }
    }
  expect(errors).toEqual([])
  await page.context().close()
})

test('on a phone the stage has brought a selection clear under the bar by the time it is next drawn, and moves no more', async ({
  browser,
}) => {
  const { page, errors } = await openPhone(browser, designId)
  for (const id of ['box', 'headline', 'photo']) {
    await selectLayers(page, [])
    // The layer's top 100 px down the screen at 40%, where the bar's rows will be.
    const before = await page.evaluate((id) => {
      const editor = window.dazbee
      const box = editor?.boxOf(id)
      if (!editor || !box) throw new Error(`no ${id}`)
      editor.setCamera({ ...editor.camera(), zoom: 0.4 })
      const now = editor.camera()
      const was = editor.screenPoint(box.x + box.width / 2, box.y)
      editor.setCamera({ ...now, x: now.x + 195 - was.x, y: now.y + 100 - was.y })
      return editor.camera()
    }, id)
    await nextFrame(page)
    await page.evaluate((id) => window.dazbee?.select([id]), id)
    await page.evaluate(() => window.dazbee?.drawn())
    const drawn = await page.evaluate(() => window.dazbee?.camera())
    expect(drawn?.y, `${id} moved clear`).toBeGreaterThan(before.y)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.dazbee?.camera()), `${id} moved no more`).toEqual(drawn)
  }
  expect(errors).toEqual([])
  await page.context().close()
})

test('on a phone a press that selects a layer and drags it is not followed by a move', async ({ browser }) => {
  const { page, errors } = await openPhone(browser, designId)
  const touch = await page.context().newCDPSession(page)
  const touchAt = (type: 'touchStart' | 'touchMove' | 'touchEnd', at?: { x: number; y: number }) =>
    touch.send('Input.dispatchTouchEvent', { type, touchPoints: at ? [at] : [] })
  // Long drags, and one just past what the stage takes for a drag, in 1 px moves.
  for (const [id, zoom, steps, by] of [
    ['card', 0.5, 10, 4],
    ['star', 0.5, 10, 4],
    ['photo', 0.5, 10, 4],
    ['headline', 1, 4, 1],
  ] as const) {
    await selectLayers(page, [])
    // The layer's top 100 px down the screen, under where the bar's rows will be, pressed a little
    // below its top.
    const { at, before, camera } = await page.evaluate(
      ({ id, zoom }) => {
        const editor = window.dazbee
        const box = editor?.boxOf(id)
        if (!editor || !box) throw new Error(`no ${id}`)
        editor.setCamera({ ...editor.camera(), zoom })
        const now = editor.camera()
        const was = editor.screenPoint(box.x + box.width / 2, box.y)
        editor.setCamera({ ...now, x: now.x + 195 - was.x, y: now.y + 100 - was.y })
        return { at: { x: 195, y: 100 + Math.min(20, (box.height * zoom) / 2) }, before: box, camera: editor.camera() }
      },
      { id, zoom },
    )
    await nextFrame(page)
    await touchAt('touchStart', at)
    for (let step = 1; step <= steps; step++) await touchAt('touchMove', { x: at.x, y: at.y + step * by })
    await touchAt('touchEnd')
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => window.dazbee?.selection()), id).toEqual([id])
    expect(await page.evaluate(() => window.dazbee?.camera()), `${id}: no move after the drag`).toEqual(camera)
    const after = await page.evaluate((id) => window.dazbee?.boxOf(id), id)
    expect((after?.y ?? 0) - before.y, `${id}: moved with the finger`).toBeGreaterThan((steps * by) / zoom / 2)
  }
  expect(errors).toEqual([])
  await page.context().close()
})

test('on a phone a double tap on a text where the bar will show types in it, the text brought clear under the bar', async ({
  browser,
}) => {
  const { page, errors } = await openPhone(browser, designId)
  const touch = await page.context().newCDPSession(page)
  for (const [zoom, top, gap] of [
    [1, 150, 120],
    [1, 150, 250],
    [0.35, 90, 150],
  ] as const) {
    const what = `top ${top} at ${zoom * 100}%, ${gap} ms apart`
    await page.evaluate(() => window.dazbee?.stopEditing())
    await selectLayers(page, [])
    // Past the browser's window for counting taps at one spot as one multi-click.
    await page.waitForTimeout(800)
    // The headline's top that far down the screen, and its middle where the finger taps twice.
    const at = await page.evaluate(
      ({ zoom, top }) => {
        const editor = window.dazbee
        const box = editor?.boxOf('headline')
        if (!editor || !box) throw new Error('no headline')
        editor.setCamera({ ...editor.camera(), zoom })
        const now = editor.camera()
        const was = editor.screenPoint(box.x + box.width / 2, box.y)
        editor.setCamera({ ...now, x: now.x + 195 - was.x, y: now.y + top - was.y })
        return { x: 195, y: top + (box.height * zoom) / 2 }
      },
      { zoom, top },
    )
    await nextFrame(page)
    for (let tap = 0; tap < 2; tap++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(gap)
    }
    await expect(page.locator('.caret'), what).toBeVisible()
    expect(await page.evaluate(() => window.dazbee?.selection()), what).toEqual(['headline'])
    // Once the double tap is done, the stage brings the text being typed in clear under the bar.
    const caretClear = () =>
      page.evaluate(() => {
        const caret = document.querySelector('.caret')?.getBoundingClientRect()
        const rows = ['top-bar-row', 'top-bar-overflow'].flatMap((row) => {
          const el = document.querySelector(`[data-testid="${row}"]`)
          return el?.checkVisibility({ visibilityProperty: true }) ? [el.getBoundingClientRect().bottom] : []
        })
        return caret !== undefined && rows.length > 0 && rows.every((bottom) => caret.top >= bottom)
      })
    await expect.poll(caretClear, what).toBe(true)
    await expect(page.locator('.caret'), what).toBeVisible()
  }
  expect(errors).toEqual([])
  await page.context().close()
})
