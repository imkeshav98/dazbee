// The UI foundation (#51): themes change only tokens, Arabic mirrors the chrome but not the design,
// reduced motion turns chrome animation off. Screenshots go to output/ for the PR.
import { editorPath, setCookies, shoot, writeOutput } from '../support/editor.ts'
import { liveDesign, seed } from '../support/seed.ts'
import { expect, type Page, test } from '../support/test.ts'

test.use({ viewport: { width: 1440, height: 900 } })

/** How long chrome moves, in ms (--chrome in globals.css, CHROME in components/editor/shell.tsx). */
const CHROME_MS = 180

/**
 * Records every animation the page asks an element for from now on, as Motion does to run a fade
 * on the browser's clock: the element's test id, the properties it animates and how long it lasts.
 */
const watchAnimations = (page: Page) =>
  page.evaluate(() => {
    const started: { on: string | null; properties: string[]; ms: number }[] = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = animate.call(this, keyframes, options)
      const frames = Array.isArray(keyframes) ? keyframes : keyframes ? [keyframes] : []
      const properties = [...new Set(frames.flatMap((frame) => Object.keys(frame)))].filter(
        (key) => !['offset', 'easing', 'composite'].includes(key),
      )
      started.push({
        on: this.getAttribute('data-testid'),
        properties,
        ms: Number(animation.effect?.getTiming().duration ?? 0),
      })
      return animation
    }
    ;(window as unknown as { animations: typeof started }).animations = started
  })
const animations = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { animations: { on: string | null; properties: string[]; ms: number }[] }).animations,
  )

test('the system theme is followed until a pick is made, and dark and light change only the tokens', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ colorScheme })
    const system = await context.newPage()
    await system.goto('/')
    await expect(system.locator('html')).toHaveAttribute('data-theme', colorScheme)
    await context.close()
  }

  // A pick: the library and the editor in each theme.
  const designId = await seed(liveDesign())
  for (const theme of ['dark', 'light'] as const) {
    await setCookies(page, { theme })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await shoot(page, `ui-${theme}-brands`)
    await page.goto('/brands/dev-brand-coffee')
    await shoot(page, `ui-${theme}-designs`)
    await page.goto(editorPath(designId))
    await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    await expect(page.getByTestId('flyout')).toBeVisible()
    await shoot(page, `ui-${theme}-editor`)
  }
  // Same markup in both themes: only custom properties differ.
  const backgrounds: string[] = []
  for (const theme of ['dark', 'light'] as const) {
    backgrounds.push(
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t
        return getComputedStyle(document.body).backgroundColor
      }, theme),
    )
  }
  expect(backgrounds[0]).not.toBe(backgrounds[1])
})

test('in Arabic the chrome mirrors and reads right to left, the islands too, the design does not', async ({ page }) => {
  const designId = await seed(liveDesign())
  await setCookies(page, { locale: 'ar', theme: 'dark' })
  await page.goto('/brands/dev-brand-coffee')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: 'اصنع المسودات' })).toBeVisible()
  await shoot(page, 'ui-arabic-designs')

  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect(page.getByTestId('status')).toHaveText('تم الحفظ')
  const rail = await page.getByRole('button', { name: 'الطبقات' }).boundingBox()
  const stage = await page.getByTestId('stage').boundingBox()
  if (!rail || !stage) throw new Error('missing rail or stage')
  // The capsule floats over the right side of the stage in Arabic.
  expect(rail.x).toBeGreaterThan(stage.x + stage.width / 2)
  await expect(page.getByTestId('stage').locator('xpath=..')).toHaveCSS('direction', 'ltr')
  // The islands swap sides: the design's name at the right, its actions at the left, clear of the
  // rulers, which stay on the left.
  const start = await page.getByTestId('island-start').boundingBox()
  const end = await page.getByTestId('island-end').boundingBox()
  if (!start || !end) throw new Error('missing islands')
  expect(start.x).toBeGreaterThan(end.x)
  expect(end.x).toBeGreaterThanOrEqual(20)
  expect(1440 - (start.x + start.width)).toBeLessThan(48)
  await page.getByRole('button', { name: 'الطبقات' }).click()
  await shoot(page, 'ui-arabic-editor')
})

test('reduced motion turns chrome animation off: the flyout appears outright and the blob jumps without sliding or squishing', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const designId = await seed(liveDesign())
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion, viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(editorPath(designId))
    await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
    // The animations the flyout is given from the click on: a fade is an opacity animation that
    // lasts the chrome's duration, appearing outright is none.
    await watchAnimations(page)
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await expect(page.getByTestId('flyout')).toHaveCSS('opacity', '1')
    const onFlyout = (await animations(page)).filter((a) => a.on === 'flyout')
    const tooltipTransition = await page
      .locator('.rise, [role=toolbar] button')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration)
    if (reducedMotion === 'reduce') {
      expect(onFlyout.filter((a) => a.ms > 0)).toEqual([])
      expect(Number.parseFloat(tooltipTransition)).toBeLessThan(0.001)
      // The capsule's blob jumps from Layers to Brand without sliding or squishing.
      const layers = centre(await page.getByRole('button', { name: 'Layers', exact: true }).boundingBox())
      const { landing, frames: path } = await blobPath(page, 'Brand')
      const brand = centre(await page.getByRole('button', { name: 'Brand', exact: true }).boundingBox())
      expect(landing).toBe(1)
      // Every frame has the blob on Layers (before the click lands) or on Brand, never between.
      expect(Math.abs((path.at(-1)?.y ?? Number.NaN) - brand.y)).toBeLessThan(1)
      for (const p of path) {
        expect(Math.min(Math.abs(p.y - layers.y), Math.abs(p.y - brand.y))).toBeLessThan(1)
        expect(p.scaleY).toBe(1)
      }
    } else {
      expect(onFlyout.filter((a) => a.properties.includes('opacity')).map((a) => a.ms)).toEqual([CHROME_MS])
    }
    await context.close()
  }
})

// Riso Pop and frosted surfaces (#81): floating chrome blurs what is under it and carries grain,
// in both themes; close-ups of the dock, zoom pill and flyout go to output/ for the PR.
test('floating chrome is frosted with grain in both themes', async ({ page }) => {
  test.setTimeout(90_000)
  const designId = await seed(liveDesign())
  for (const theme of ['dark', 'light'] as const) {
    await setCookies(page, { theme })
    await page.goto(editorPath(designId))
    await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await expect(page.getByTestId('flyout')).toBeVisible()
    for (const surface of [
      page.getByRole('toolbar'),
      page.getByRole('group', { name: 'Zoom' }),
      page.getByTestId('flyout'),
    ]) {
      const style = await surface.evaluate((el) => {
        const s = getComputedStyle(el)
        return { filter: s.backdropFilter, image: s.backgroundImage }
      })
      expect(style.filter).toContain('blur(18px)')
      expect(style.image).toContain('feTurbulence')
    }
    await shoot(page, `ui-${theme}-frost`)
    const dock = await page.getByRole('toolbar').boundingBox()
    const zoom = await page.getByRole('group', { name: 'Zoom' }).boundingBox()
    if (!dock || !zoom) throw new Error('missing dock or zoom')
    writeOutput(
      `ui-${theme}-frost-dock.png`,
      await page.screenshot({
        clip: { x: dock.x - 40, y: dock.y - 40, width: zoom.x + zoom.width - dock.x + 80, height: dock.height + 80 },
      }),
    )
  }
})

// The floating capsule (#82): it floats over the canvas, a pink blob slides between its buttons,
// flyouts are only as tall as their content, and on phones it is a tab bar at the bottom.
const centre = (box: { x: number; y: number; width: number; height: number } | null) => {
  if (!box) throw new Error('missing box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * The blob's centre and vertical scale on every frame and style change from clicking the named
 * panel button until the blob rests on it, round, and the vertical scale the blob starts from when
 * it lands (read as it mounts, since a slow machine may draw no frame before it settles). The slide
 * is a spring Motion runs frame by frame, with no duration to read, so the watch lasts until it
 * ends however slow the machine is; 10 s without resting ends it too, for the checks to report.
 */
async function blobPath(page: Page, name: string) {
  const path = page.evaluate(
    (name) =>
      new Promise<{ landing: number; frames: { y: number; scaleY: number }[] }>((resolve) => {
        const seen: { y: number; scaleY: number }[] = []
        let landing = 1
        const rail = document.querySelector('[data-testid=rail]')
        const button = rail?.querySelector(`button[aria-label="${name}"]`)
        if (!rail || !button) throw new Error(`no ${name} button in the capsule`)
        const target = button.getBoundingClientRect()
        /** Where the blob is now and how stretched, recorded; null with no blob. */
        const look = () => {
          const blob = document.querySelector('[data-testid=rail-blob]')
          const squish = blob?.firstElementChild
          if (!blob || !(squish instanceof HTMLElement)) return null
          const box = blob.getBoundingClientRect()
          const at = {
            y: box.y + box.height / 2,
            scaleY: new DOMMatrix(getComputedStyle(squish).transform).d,
            on: blob.closest('button') === button,
          }
          seen.push({ y: at.y, scaleY: at.scaleY })
          return at
        }
        // Motion writes the blob's style on each step of the slide, so this also sees the steps a busy
        // machine draws no frame for.
        let moved = true
        const watch = new MutationObserver(() => {
          moved = true
          const squish = document.querySelector('[data-testid=rail-blob]')?.firstElementChild
          if (squish instanceof HTMLElement)
            landing = Math.max(landing, new DOMMatrix(squish.style.transform || 'none').d)
          look()
        })
        watch.observe(rail, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
        let finished = false
        const finish = () => {
          finished = true
          watch.disconnect()
          resolve({ landing, frames: seen })
        }
        const giveUp = setTimeout(finish, 10_000)
        // At rest: on the button, round, and not moved since the last frame, which a spring passing
        // through its end on the way back would be.
        const tick = () => {
          if (finished) return
          const at = look()
          const still = !moved
          moved = false
          if (
            still &&
            at?.on &&
            Math.abs(at.y - (target.y + target.height / 2)) < 1 &&
            Math.abs(at.scaleY - 1) < 0.001
          ) {
            clearTimeout(giveUp)
            finish()
          } else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    name,
  )
  await page.getByRole('button', { name }).click()
  return path
}

test('the panels live in a capsule floating over the canvas', async ({ page }) => {
  const designId = await seed(liveDesign())
  await setCookies(page, { theme: 'dark' })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const rail = page.getByTestId('rail')
  const stage = await page.getByTestId('stage').boundingBox()
  const box = await rail.boundingBox()
  if (!stage || !box) throw new Error('missing rail or stage')
  // Over the canvas at the start edge, centred top to bottom, round ends, frosted.
  expect(box.x).toBeGreaterThan(stage.x)
  expect(box.x - stage.x).toBeLessThan(24)
  expect(Math.abs(centre(box).y - centre(stage).y)).toBeLessThan(4)
  expect(box.height).toBeGreaterThan(box.width)
  expect(
    Number.parseFloat(await rail.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)),
  ).toBeGreaterThanOrEqual(box.width / 2)
  expect(await rail.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur(18px)')

  // The blob lands on the open panel's button and slides there, stretched, when another opens.
  await expect(page.getByTestId('rail-blob')).toHaveCount(0)
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  const layers = centre(await page.getByRole('button', { name: 'Layers', exact: true }).boundingBox())
  await expect
    .poll(async () => Math.abs(centre(await page.getByTestId('rail-blob').boundingBox()).y - layers.y))
    .toBeLessThan(1)
  await shoot(page, 'ui-capsule-layers')
  const { landing, frames: path } = await blobPath(page, 'Brand')
  const brand = centre(await page.getByRole('button', { name: 'Brand', exact: true }).boundingBox())
  // A slide, not a jump: the blob is seen on its way, between the two buttons. A jump is never
  // there, though it may draw a frame back on Layers. (How many steps between a busy machine draws
  // depends on its frame rate.) It lands stretched and settles on Brand.
  const between = path.filter((p) => p.y > layers.y + 4 && p.y < brand.y - 4)
  expect(
    between.length,
    `the blob's centre on each step: ${path.map((p) => Math.round(p.y)).join(', ')}`,
  ).toBeGreaterThan(0)
  expect(landing).toBeGreaterThan(1.05)
  await expect
    .poll(async () => Math.abs(centre(await page.getByTestId('rail-blob').boundingBox()).y - brand.y))
    .toBeLessThan(1)
  await expect(page.getByRole('button', { name: 'Brand', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Layers', exact: true })).toHaveAttribute('aria-expanded', 'false')

  // The flyout opens beside the capsule.
  const flyout = await page.getByTestId('flyout').boundingBox()
  if (!flyout) throw new Error('missing flyout')
  expect(flyout.x).toBeGreaterThan(box.x + box.width)

  // Keyboard: the buttons take focus and toggle their panel with Enter. (Space is the canvas's pan
  // key, which the editor takes before any button does.)
  const ai = page.getByRole('button', { name: 'AI', exact: true })
  await ai.focus()
  await page.keyboard.press('Enter')
  await expect(ai).toHaveAttribute('aria-expanded', 'true')
  await expect(ai).toBeFocused()
  // A flyout is only as tall as what it holds: the AI one, still empty, is short, where Brand's holds
  // the brand kit. Brand's flyout leaves first, then AI's settles at its height.
  await expect(page.getByTestId('flyout')).toHaveCount(1)
  await expect.poll(async () => (await page.getByTestId('flyout').boundingBox())?.height).toBeLessThan(stage.height / 2)
  await shoot(page, 'ui-capsule-ai')
  await page.keyboard.press('Enter')
  await expect(ai).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('flyout')).toHaveCount(0)
})

test('on a phone the capsule is a tab bar at the bottom', async ({ browser }) => {
  const designId = await seed(liveDesign())
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await setCookies(page, { theme: 'dark' })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const rail = await page.getByTestId('rail').boundingBox()
  const dock = await page.getByRole('toolbar').boundingBox()
  const zoom = await page.getByRole('group', { name: 'Zoom' }).boundingBox()
  if (!rail || !dock || !zoom) throw new Error('missing chrome')
  expect(rail.width).toBeGreaterThan(rail.height)
  expect(Math.abs(centre(rail).x - 390 / 2)).toBeLessThan(2)
  expect(844 - (rail.y + rail.height)).toBeLessThan(24)
  // The dock sits above the tab bar and the zoom pill moves to the top, so nothing overlaps.
  expect(dock.y + dock.height).toBeLessThanOrEqual(rail.y)
  expect(zoom.y + zoom.height).toBeLessThan(dock.y)
  await shoot(page, 'ui-capsule-phone')
  await page.getByRole('button', { name: 'Layers', exact: true }).tap()
  const flyout = await page.getByTestId('flyout').boundingBox()
  if (!flyout) throw new Error('missing flyout')
  expect(flyout.y + flyout.height).toBeLessThanOrEqual(dock.y)
  expect(flyout.x).toBeGreaterThanOrEqual(0)
  expect(flyout.x + flyout.width).toBeLessThanOrEqual(390)
  await shoot(page, 'ui-capsule-phone-layers')
  await context.close()
})
