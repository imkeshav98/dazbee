// The glass as the web app serves it, read in the page: the glass utility's backdrop filter and the
// glass tokens of the theme in use, as computed values. Checks on glass surfaces compare with these
// rather than repeat the values, which the token unit test (apps/web/lib/tokens.test.ts) holds to
// the decisions.
import type { Page } from '@playwright/test'

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
