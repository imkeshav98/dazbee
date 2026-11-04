// The glass as the web app serves it, read in the page: the glass utility's backdrop filter and the
// glass tokens of the theme in use, as computed values. Checks on glass surfaces compare with these
// rather than repeat the values, which the token unit test (apps/web/lib/tokens.test.ts) holds to
// the decisions.
import { type Browser, expect, type Locator, type Page } from '@playwright/test'

import { editorPath, setCookies } from './editor.ts'

/** What glass paints, as computed values: its backdrop filter, and the colours of what sits on it. */
export interface ServedGlass {
  /** The glass utility's backdrop filter and fill. */
  filter: string
  fill: string
  text: string
  hover: string
  pressed: string
  /** The sunken track a segmented choice sits in. */
  well: string
  /** The chosen segment's fill on the well. */
  chip: string
  accentText: string
  danger: string
  /** What a glass dialog lays over the page behind it. */
  backdrop: string
}

export const THEMES = ['dark', 'light'] as const

/** Reads the glass of the page's theme from a probe element that takes the glass utility. */
export const servedGlass = (page: Page): Promise<ServedGlass> =>
  page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'surface-frost'
    const inside = document.createElement('div')
    probe.append(inside)
    document.body.append(probe)
    const colour = (token: string) => {
      inside.style.color = `var(${token})`
      return getComputedStyle(inside).color
    }
    const glass = {
      filter: getComputedStyle(probe).backdropFilter,
      fill: getComputedStyle(probe).backgroundColor,
      text: colour('--text'),
      hover: colour('--glass-hover'),
      pressed: colour('--glass-pressed'),
      well: colour('--glass-well'),
      chip: colour('--glass-chip'),
      accentText: colour('--glass-accent-text'),
      danger: colour('--glass-danger'),
      backdrop: colour('--glass-backdrop'),
    }
    probe.remove()
    return glass
  })

/** How an element looks, as computed: its glass, fill, layered image, text colour, outline and border. */
export const look = (el: Locator) =>
  el.evaluate((e) => {
    const s = getComputedStyle(e)
    return {
      filter: s.backdropFilter,
      fill: s.backgroundColor,
      image: s.backgroundImage,
      colour: s.color,
      outline: s.outlineStyle,
      border: s.borderTopWidth,
    }
  })

/** Opens a design in a tab of its own in a theme, and gives the tab, its errors and its glass. */
export async function openIn(
  browser: Browser,
  designId: string,
  theme: (typeof THEMES)[number],
  viewport = { width: 1440, height: 900 },
) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  return { page, errors, glass: await servedGlass(page) }
}

/** Holds the mouse down on a control until its fill is the one expected, then lets go: a click. */
export async function pressedFill(page: Page, control: Locator, expected: string) {
  await control.hover()
  await page.mouse.down()
  await expect.poll(async () => (await look(control)).fill).toBe(expected)
  await page.mouse.up()
}
