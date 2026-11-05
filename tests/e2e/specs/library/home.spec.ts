// The brand's home (#84): "What are we making today?" as a brief with a Sizes dropdown and Make
// drafts, alone. The capsule's Recent, Templates and Brand kit are pages of their own, Settings is in
// the account menu, and on a phone the capsule is a tab bar; Recent shows every design as the
// earlier mock's masonry, each picture in its own shape.
import type { DesignInput } from '@dazbee/schema'

import { setCookies, shoot } from '../../support/editor.ts'
import { frameDesign, newBrand, seed } from '../../support/seed.ts'
import { expect, test } from '../../support/test.ts'

test.use({ viewport: { width: 1440, height: 900 } })

/** A design of one coloured frame holding a block, so its picture is easy to tell apart. */
const poster = (name: string, width: number, height: number, fill: string, block: string): DesignInput =>
  frameDesign({
    name,
    frameId: 'f',
    frameName: 'Poster',
    width,
    height,
    fills: [{ type: 'solid', color: fill }],
    nodes: {
      block: {
        type: 'graphic',
        parentId: 'f',
        index: 'a0',
        name: 'Block',
        props: {
          x: width * 0.1,
          y: height * 0.1,
          width: width * 0.5,
          height: height * 0.3,
          shape: { kind: 'rect', cornerRadius: 24 },
          fills: [{ type: 'solid', color: block }],
        },
      },
    },
  })

test('Recent is a page of real pictures, each in its shape, filtered by shape', async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 6)
  const brandId = await newBrand('e2e home')
  await seed(poster(`Story ${run}`, 1080, 1920, '#3D6BFFFF', '#FFD23FFF'), { brandId })
  await seed(poster(`Banner ${run}`, 1500, 500, '#1A1420FF', '#FF48B0FF'), { brandId })
  await seed(poster(`Square ${run}`, 1080, 1080, '#FF48B0FF', '#FFFFFFFF'), { brandId })
  await setCookies(page, { theme: 'dark' })
  await page.goto(`/brands/${brandId}/designs`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recent')
  await expect(page.getByTestId('library-capsule').locator('[data-lit]')).toHaveAttribute('data-entry', 'recent')

  const list = page.getByRole('list', { name: 'Recent' })
  const tile = (name: string) =>
    list.getByTestId('design-tile').filter({ has: page.getByRole('link', { name: new RegExp(name) }) })
  // Newest first: the square, made last, leads.
  await expect(list.getByTestId('design-tile').first()).toContainText(`Square ${run}`)
  // Each picture keeps its shape: a story tall, a banner wide.
  const frame = async (name: string) =>
    tile(name)
      .locator('img')
      .evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().toJSON() as DOMRect)
  const story = await frame(`Story ${run}`)
  const banner = await frame(`Banner ${run}`)
  const square = await frame(`Square ${run}`)
  expect(story.height / story.width).toBeGreaterThan(1.7)
  expect(banner.width / banner.height).toBeGreaterThan(2.8)
  expect(Math.abs(square.width - square.height)).toBeLessThan(3)

  // Each picture is the design itself, drawn by the API, and fills its tile.
  for (const [name, colour] of [
    [`Square ${run}`, [255, 72, 176]],
    [`Story ${run}`, [61, 107, 255]],
    [`Banner ${run}`, [26, 20, 32]],
  ] as const) {
    const img = tile(name).locator('img')
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 20_000 })
      .toBeGreaterThan(100)
    const fit = await img.evaluate((el: HTMLImageElement) => {
      const box = el.getBoundingClientRect()
      const parent = (el.parentElement as HTMLElement).getBoundingClientRect()
      return {
        fills: Math.abs(box.width - parent.width) < 3 && Math.abs(box.height - parent.height) < 3,
        fit: getComputedStyle(el).objectFit,
      }
    })
    expect(fit).toEqual({ fills: true, fit: 'cover' })
    // The page's colour, near the picture's lower right corner (the block sits top left).
    const pixel = await img.evaluate((el: HTMLImageElement) => {
      const canvas = document.createElement('canvas')
      canvas.width = el.naturalWidth
      canvas.height = el.naturalHeight
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
      ctx.drawImage(el, 0, 0)
      return [
        ...ctx.getImageData(Math.floor(el.naturalWidth * 0.9), Math.floor(el.naturalHeight * 0.9), 1, 1).data,
      ].slice(0, 3)
    })
    for (const [i, c] of colour.entries())
      expect(Math.abs((pixel[i] ?? 0) - c), `${name} channel ${i}`).toBeLessThanOrEqual(2)
  }
  await shoot(page, 'home-recent', { fullPage: true })

  // The Story chip keeps only the tall ones.
  await page.getByRole('navigation', { name: 'Filters' }).getByRole('link', { name: 'Story' }).click()
  await expect(page).toHaveURL(/\/designs\?shape=story$/)
  await expect(tile(`Story ${run}`)).toBeVisible()
  await expect(tile(`Banner ${run}`)).toHaveCount(0)
})

test('the brief is alone on the home, and the capsule goes to Recent, Templates and Brand kit pages, Settings to the account menu', async ({
  page,
}) => {
  await page.goto('/brands/dev-brand-coffee')
  const capsule = page.getByTestId('library-capsule')
  // A tall capsule at the start edge, Home lit.
  await expect(capsule.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  const shape = await capsule.boundingBox()
  if (!shape) throw new Error('no capsule')
  expect(shape.x).toBeLessThanOrEqual(20)
  expect(shape.height).toBeGreaterThan(shape.width)
  const brief = page.getByRole('heading', { level: 1 })
  // One line, "today" in the AI gradient, the editor's top bar (the brand switcher in the crumb,
  // the account avatar), no list beside the page.
  await expect(brief).toHaveText('What are we making today?')
  expect((await brief.boundingBox())?.height).toBeLessThan(70)
  expect(await brief.getByText('today').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
    'linear-gradient',
  )
  await expect(page.getByTestId('brand-switcher')).toContainText('Harbour Coffee')
  await expect(page.getByTestId('account-open')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Recent' })).toHaveCount(0)
  await expect(capsule.locator('[data-lit]')).toHaveAttribute('data-entry', 'home')
  await shoot(page, 'home-brief-alone')

  for (const [entry, name, path, heading] of [
    ['recent', 'Recent', 'designs', 'Recent'],
    ['templates', 'Templates', 'templates', 'Templates'],
    ['kit', 'Brand kit', 'kit', 'Brand kit'],
  ] as const) {
    await capsule.getByRole('link', { name }).click()
    await expect(page).toHaveURL(new RegExp(`/brands/dev-brand-coffee/${path}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(capsule.locator('[data-lit]')).toHaveAttribute('data-entry', entry)
    await expect(capsule.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
  }
  await capsule.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/brands\/dev-brand-coffee$/)

  // The old panel links still land, on the pages.
  await page.goto('/brands/dev-brand-coffee?show=templates')
  await expect(page).toHaveURL(/\/brands\/dev-brand-coffee\/templates$/)

  // Settings is in the account menu, not the capsule, which lights nothing there.
  await expect(capsule.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  await page.getByTestId('account-open').click()
  await page.getByTestId('settings-link').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  await expect(capsule.locator('[data-lit]')).toHaveCount(0)
})

test('a size under the brief opens a blank design in that size', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/brands/dev-brand-coffee')
  await page.getByRole('button', { name: 'Start a blank Story and Reel' }).click()
  await expect(page).toHaveURL(/\/brands\/dev-brand-coffee\/designs\/[\w-]+$/)
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const design = await page.evaluate(() => window.dazbee?.design())
  expect(design?.meta.name).toBe('Untitled design')
  // One page holding one frame of that size.
  expect(Object.keys(design?.pages ?? {})).toHaveLength(1)
  expect(Object.values(design?.frames ?? {}).map((f) => [f.width, f.height])).toEqual([[1080, 1920]])
})

test('the Sizes dropdown keeps one size picked, and Make drafts opens a design of one frame per size picked in a row, named by the brief', async ({
  page,
}) => {
  // The home, then the editor opening, which alone may take its 30 s on a busy runner.
  test.setTimeout(60_000)
  await page.goto('/brands/dev-brand-coffee')
  const brief = `Autumn roast launch ${crypto.randomUUID().slice(0, 6)}`
  await page.getByLabel('Brief').fill(`${brief}\nWarm, cosy, a cup on a wooden table`)
  // Feed square is picked from the start, and as the only one picked it stays; add Story.
  const button = page.getByTestId('brief-sizes')
  const dropdown = page.getByRole('dialog', { name: 'Sizes' })
  await expect(button).toHaveText(/1 size/)
  await expect(page.getByTestId('brief-size-feed-square')).toBeChecked()
  await button.click()
  await expect(page.getByTestId('brief-size-feed-square')).toBeChecked()
  // Each size is named as the frame it makes is.
  await dropdown.getByText('Feed square', { exact: true }).click()
  await expect(page.getByTestId('brief-size-feed-square')).toBeChecked()
  await dropdown.getByText('Story and Reel', { exact: true }).click()
  await expect(page.getByTestId('brief-size-story')).toBeChecked()
  await expect(button).toHaveText(/2 sizes/)
  await shoot(page, 'home-sizes')
  // Esc closes the dropdown and gives the focus back to its button.
  await page.keyboard.press('Escape')
  await expect(dropdown).toBeHidden()
  await expect(button).toBeFocused()
  await shoot(page, 'home-brief')
  await page.getByRole('button', { name: 'Make drafts' }).click()
  await expect(page).toHaveURL(/\/brands\/dev-brand-coffee\/designs\/[\w-]+$/, { timeout: 20_000 })
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const design = await page.evaluate(() => window.dazbee?.design())
  expect(design?.meta.name).toBe(brief)
  // One page, a frame per size named after it, in a row by the frame rule: the first at 0, 0, the
  // next 200 px right of it, tops aligned.
  expect(Object.keys(design?.pages ?? {})).toEqual(['p1'])
  expect(
    Object.entries(design?.frames ?? {})
      .sort(([, a], [, b]) => (a.order < b.order ? -1 : 1))
      .map(([id, f]) => [id, f.pageId, f.name, f.width, f.height, f.x, f.y]),
  ).toEqual([
    ['f1', 'p1', 'Feed square', 1080, 1080, 0, 0],
    ['f2', 'p1', 'Story and Reel', 1080, 1920, 1280, 0],
  ])
  // Both frames start empty, and the canvas shows the two.
  expect(design?.nodes).toEqual({})
  await expect(page.locator('.frame-label[data-frame]')).toHaveCount(2)
})

test('on a phone the brief and the Recent page fit the screen, and the capsule is a tab bar at the bottom', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto('/brands/dev-brand-coffee')
  await expect(page.getByRole('button', { name: 'Make drafts' })).toBeVisible()
  // Nothing runs off the side.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const bar = await page.getByTestId('library-capsule').boundingBox()
  expect(bar?.width).toBeGreaterThan(bar?.height ?? 0)
  expect(844 - ((bar?.y ?? 0) + (bar?.height ?? 0))).toBeLessThan(24)
  await shoot(page, 'home-phone', { fullPage: true })

  await page.getByTestId('library-capsule').getByRole('link', { name: 'Recent' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recent')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await shoot(page, 'home-phone-recent')
  await context.close()
})
