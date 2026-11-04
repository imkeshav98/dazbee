// The glass as the web app serves it, read in the page: the glass utility's backdrop filter and the
// glass tokens of the theme in use, as computed values. Checks on glass surfaces compare with these
// rather than repeat the values, which the token unit test (apps/web/lib/tokens.test.ts) holds to
// the decisions. And how a control on glass looks, under the pointer and pressed, in a tab of its own.
import { type Browser, type BrowserContextOptions, expect, type Locator, type Page } from '@playwright/test'

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
  /** Muted text in the well. */
  wellMuted: string
  /** The chosen segment's fill on the well. */
  chip: string
  accentText: string
  /** The pink tint of a chosen item, such as a toggle that is on or a tag. */
  accentSoft: string
  danger: string
  /** The solid red of a button that confirms a delete, at rest and under the pointer, and its words. */
  dangerSolid: string
  dangerSolidHover: string
  onAccent: string
  /** What a glass dialog lays over the page behind it. */
  backdrop: string
}

/** How an element looks, as computed: its glass, fill, layered image, text colour, outline and border. */
export interface Look {
  filter: string
  fill: string
  image: string
  colour: string
  outline: string
  border: string
}

export const THEMES = ['dark', 'light'] as const

/** The desktop size a tab opens at unless told otherwise. */
const DESKTOP = { width: 1440, height: 900 }

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
      wellMuted: colour('--glass-well-muted'),
      chip: colour('--glass-chip'),
      accentText: colour('--glass-accent-text'),
      accentSoft: colour('--accent-soft'),
      danger: colour('--glass-danger'),
      dangerSolid: colour('--danger-solid'),
      dangerSolidHover: colour('--danger-solid-hover'),
      onAccent: colour('--on-accent'),
      backdrop: colour('--glass-backdrop'),
    }
    probe.remove()
    return glass
  })

/** How an element looks, as computed. */
export const look = (el: Locator): Promise<Look> =>
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

/** A tint laid over a control's own fill, as its computed background image. */
export const laid = (tint: string) => `linear-gradient(${tint}, ${tint})`

/**
 * Opens a page of the app in a tab of its own in a theme, at a desktop size unless the context says
 * otherwise (a phone's size and touch, say), and gives the tab, its errors and its glass.
 */
export async function openIn(
  browser: Browser,
  path: string,
  theme: (typeof THEMES)[number],
  context: BrowserContextOptions = {},
) {
  const page = await (await browser.newContext({ viewport: DESKTOP, ...context })).newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme })
  await page.goto(path)
  return { page, errors, glass: await servedGlass(page) }
}

/** Opens a design in the editor as openIn does, once the editor is ready. */
export async function openDesignIn(
  browser: Browser,
  designId: string,
  theme: (typeof THEMES)[number],
  context: BrowserContextOptions = {},
) {
  const opened = await openIn(browser, editorPath(designId), theme, context)
  await expect(opened.page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  return opened
}

/**
 * Holds the mouse down on a control until it, or the row it sits in (`on`), looks as expected, then
 * lets go: a click.
 */
export async function pressed(page: Page, control: Locator, expected: Partial<Look>, on = control) {
  await control.hover()
  await page.mouse.down()
  await expect.poll(async () => look(on)).toMatchObject(expected)
  await page.mouse.up()
}

/** Moves the pointer onto a control and waits until it looks as expected. */
export async function hovered(control: Locator, expected: Partial<Look>) {
  await control.hover()
  await expect.poll(async () => look(control)).toMatchObject(expected)
}
