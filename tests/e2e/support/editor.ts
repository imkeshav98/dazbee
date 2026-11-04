import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Browser, expect, type Page } from '@playwright/test'

import { DEV_BRAND, type InBrand, liveDesign, seed } from './seed.ts'
import { test } from './test.ts'

/** Where the live editing checks leave their screenshots and numbers; CI uploads it. */
export const OUTPUT = join(import.meta.dirname, '..', 'output')

export const editorPath = (designId: string, { brandId = DEV_BRAND }: InBrand = {}) =>
  `/brands/${brandId}/designs/${designId}`

/**
 * Opens a design of a brand in `count` tabs, each in its own browser context, all live. Without a
 * design id it creates a fresh one; with one it opens what the sync server already has.
 */
export async function openTabs(
  browser: Browser,
  count: number,
  existing?: string,
  { brandId = DEV_BRAND }: InBrand = {},
) {
  const designId = existing ?? (await seed(liveDesign(), { brandId }))
  const tabs: Page[] = []
  const errors: string[] = []
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(`tab ${i + 1}: ${error.message}`))
    await page.goto(editorPath(designId, { brandId }))
    await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
    tabs.push(page)
  }
  return { designId, tabs, errors }
}

/**
 * What the stage shows, with the panel capsule masked: it floats over the canvas (#82) and the AI
 * button's glow is always moving, so two shots of the same design would otherwise differ there.
 */
export const stageShot = (page: Page) =>
  // The canvas alone: the chrome floating over it is left out, the capsule and the islands masked.
  page.getByTestId('stage').screenshot({
    animations: 'disabled',
    mask: [page.getByTestId('rail'), page.getByTestId('island-start'), page.getByTestId('island-end')],
  })

/** The design as the tab's document holds it now, as JSON with sorted keys so two tabs compare equal. */
export const designOf = (page: Page) =>
  page.evaluate(() => {
    const sort = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(sort)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([k, x]) => [k, sort(x)]),
            )
          : v
    return JSON.stringify(sort(window.dazbee?.design()))
  })

/** SHA-256 of the tab's export render (CPU surface), so megabytes of pixels need not cross to Node. */
export const exportHashOf = (page: Page) =>
  page.evaluate(async () => {
    const pixels = window.dazbee?.exportPixels()
    if (!pixels) throw new Error('no editor')
    const digest = await crypto.subtle.digest('SHA-256', pixels.slice())
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  })

const synced = (page: Page) => page.evaluate(() => window.dazbee?.synced() ?? false)

/** Waits for the sync server to have every change, reloads, and checks the design came back the same. */
export async function reloads(page: Page) {
  const final = await designOf(page)
  await expect.poll(() => synced(page), { timeout: 15_000 }).toBe(true)
  await page.reload()
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect.poll(() => designOf(page), { message: 'the design is the same after a reload' }).toBe(final)
}

/** Waits until every tab has sent all its changes and all tabs hold the same design. */
export async function settle(tabs: Page[]) {
  await expect
    .poll(
      async () => {
        if (!(await Promise.all(tabs.map(synced))).every(Boolean)) return false
        const designs = await Promise.all(tabs.map(designOf))
        return designs.every((d) => d === designs[0])
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

/**
 * A design pixel of a frame of the shown page as a point on screen, as the tab's camera shows it
 * now: the page's first frame by default.
 */
export async function screenPoint(page: Page, x: number, y: number, frameId?: string) {
  const point = await page.evaluate(({ x, y, frameId }) => window.dazbee?.screenPoint(x, y, frameId), {
    x,
    y,
    frameId,
  })
  if (!point) throw new Error('no editor')
  return point
}

/** A layer's props as the design holds them. */
export function placed(design: { nodes: Record<string, { props: Record<string, unknown> }> }, id: string) {
  return design.nodes[id]?.props
}

export function writeOutput(name: string, content: string | Buffer) {
  mkdirSync(OUTPUT, { recursive: true })
  writeFileSync(join(OUTPUT, name), content)
}

/** Writes a screenshot of the page, with animations off, to `<name>.png` in the output folder. */
export async function shoot(page: Page, name: string, { fullPage = false }: { fullPage?: boolean } = {}) {
  writeOutput(`${name}.png`, await page.screenshot({ fullPage, animations: 'disabled' }))
}

/** Sets cookies by name for the web app the specs open, at the suite's base URL. */
export async function setCookies(page: Page, cookies: Record<string, string>) {
  const url = test.info().project.use.baseURL ?? ''
  await page.context().addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url })))
}
