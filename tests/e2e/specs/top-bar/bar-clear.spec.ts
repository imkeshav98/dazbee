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
