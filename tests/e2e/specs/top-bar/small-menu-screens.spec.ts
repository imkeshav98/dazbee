// The small menu and the selection's size at the three screen sizes: with a layer near a frame's
// top left corner, near its top right corner, in a frame along the stage's left edge, with the
// Colour panel open, and by the dock, the small menu shows clear of every frame's label and the
// size lies wholly on the screen, clear of the chrome; a selection panned off the screen takes its
// size with it; and the PR's pictures of each in both themes.
import { shoot } from '../../support/editor.ts'
import { design, openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 180_000 })

/**
 * Each case: the layer selected, whether the square is moved to the stage's left edge first, the
 * panel opened, and whether the selection is moved down by the dock.
 */
const CASES = [
  { name: 'top-left', layer: 'headline', atEdge: false },
  { name: 'top-right', layer: 'corner', atEdge: false },
  { name: 'at-edge', layer: 'tilt', atEdge: true },
  { name: 'colour-open', layer: 'tilt', atEdge: false, panel: 'colour' },
  { name: 'by-the-dock', layer: 'tilt', atEdge: false, low: true },
] as const satisfies { name: string; layer: string; atEdge: boolean; panel?: string; low?: boolean }[]
/** The floating chrome the size keeps clear of. */
const CHROME = [
  '[data-testid="rail"]',
  '[data-dock]',
  '[data-zoom]',
  '[data-testid="island-start"]',
  '[data-testid="island-end"]',
]

/** The frames-on-canvas design with a small layer in the square's top right corner. */
const withCorner = () => {
  const input = design()
  return {
    ...input,
    nodes: {
      ...input.nodes,
      corner: {
        type: 'graphic' as const,
        parentId: 'sq',
        link: 'corner',
        index: 'a2V',
        name: 'Corner',
        props: {
          x: 860,
          y: 40,
          width: 180,
          height: 100,
          shape: { kind: 'rect' as const },
          fills: [{ type: 'solid' as const, color: '#21885BFF' }],
        },
      },
    },
  }
}

/**
 * What covers what: the small menu over each frame label it meets, and the size label's reach past
 * the screen, over a frame's label or over the chrome.
 */
const problems = (page: Page) =>
  page.evaluate((chrome) => {
    const found: string[] = []
    const menuEl = document.querySelector('[data-testid="small-menu"]')
    const menu = menuEl?.getBoundingClientRect()
    if (!menuEl || !menu || getComputedStyle(menuEl).visibility === 'hidden') found.push('the small menu hides')
    else
      for (const label of document.querySelectorAll<HTMLElement>('.stage-overlay .frame-label')) {
        const box = label.getBoundingClientRect()
        if (menu.left < box.right && box.left < menu.right && menu.top < box.bottom && box.top < menu.bottom)
          found.push(`the small menu covers the ${label.dataset.frame} label`)
      }
    const size = document.querySelector('.stage-overlay .selection-size')?.getBoundingClientRect()
    const width = document.documentElement.clientWidth
    if (!size) found.push('no size label')
    else if (size.left < 0 || size.right > width || size.top < 0 || size.bottom > window.innerHeight)
      found.push(`the size label (${Math.round(size.left)}–${Math.round(size.right)}) runs off the screen (${width})`)
    else {
      for (const label of document.querySelectorAll<HTMLElement>('.stage-overlay .frame-label')) {
        const box = label.getBoundingClientRect()
        if (size.left < box.right && box.left < size.right && size.top < box.bottom && box.top < size.bottom)
          found.push(`the size label covers the ${label.dataset.frame} label`)
      }
      for (const piece of chrome)
        for (const el of document.querySelectorAll(piece)) {
          const box = el.getBoundingClientRect()
          if (
            box.width &&
            size.left < box.right &&
            box.left < size.right &&
            size.top < box.bottom &&
            box.top < size.bottom
          )
            found.push(`the size label is under ${piece}`)
        }
    }
    return found
  }, CHROME)

/** Places the case's frame, selects its layer, opens its panel and moves it down by the dock. */
async function openCase(page: Page, one: (typeof CASES)[number]) {
  const { layer, atEdge } = one
  if (atEdge)
    await page.evaluate(() => {
      const camera = window.dazbee?.camera()
      if (camera) window.dazbee?.setCamera({ ...camera, x: 0 })
    })
  await selectLayers(page, [layer])
  if ('panel' in one) await barMenu(page, one.panel)
  if ('low' in one) {
    // Moved down until the selection's top is 100 px above the screen's bottom, by the dock.
    await drawn(page)
    const outline = await page.locator('.stage-overlay .selection').boundingBox()
    const down = page.viewportSize()?.height ?? 0
    await page.evaluate(
      (by) => {
        const camera = window.dazbee?.camera()
        if (camera) window.dazbee?.setCamera({ ...camera, y: camera.y + by })
      },
      down - 100 - (outline?.y ?? 0),
    )
  }
  await drawn(page)
  await nextFrame(page)
}

for (const [width, height] of SCREEN_SIZES) {
  for (const one of CASES) {
    test(`at ${width}×${height} with a layer ${one.name}, the small menu keeps off the frames’ labels, the size stays on the screen, and no tooltip shows`, async ({
      browser,
    }) => {
      const { page, errors } = await openSized(browser, { width, height }, { input: withCorner() })
      await openCase(page, one)
      await expect(page.getByTestId('small-menu')).toBeVisible()
      await expect.poll(() => problems(page)).toEqual([])
      // With nothing hovered no tooltip shows, the top bar's Position's included.
      await nextFrame(page)
      await expect(page.getByRole('tooltip')).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }
}

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} the size goes wholly off the screen with a selection panned wholly past either side, a wide and a narrow one`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height }, { input: withCorner() })
    /** The selection's outline and its size across the screen, and whether the screen shows any of them. */
    const across = () =>
      page.evaluate(() => {
        const outline = document.querySelector('.stage-overlay .selection')?.getBoundingClientRect()
        const size = document.querySelector('.stage-overlay .selection-size')?.getBoundingClientRect()
        const room = document.documentElement.clientWidth
        const shows = (box: DOMRect | undefined) => !!box && box.right > 0 && box.left < room
        return {
          left: outline?.left ?? 0,
          right: outline?.right ?? 0,
          room,
          outline: shows(outline),
          size: shows(size),
        }
      })
    // The headline is wider than its size; the banner's badge, narrower.
    for (const layer of ['headline', 'badge']) {
      await fitSettled(page)
      await selectLayers(page, [layer])
      await page.mouse.move(width / 2, height / 2)
      // Panned by the wheel in small steps, as a person does, past the right side, then past the left.
      for (const step of [-16, 16]) {
        // Counted once the selection has shown and gone, for six steps past the side.
        let shown = false
        let off = 0
        for (let i = 0; i < 400 && off < 6; i++) {
          await page.mouse.wheel(step, 0)
          await drawn(page)
          const now = await across()
          shown ||= now.outline
          if (now.outline || !shown) continue
          off++
          expect(now.size, `${layer} at ${Math.round(now.left)}–${Math.round(now.right)}`).toBe(false)
        }
        expect(off).toBe(6)
      }
    }
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  test(
    `the PR's screenshots at ${width}×${height}: the small menu and the size by a layer near a frame's corners and the stage's edge`,
    { tag: '@evidence' },
    async ({ browser }) => {
      for (const theme of THEMES) {
        for (const one of CASES) {
          const { page } = await openSized(browser, { width, height }, { theme, input: withCorner() })
          await openCase(page, one)
          await expect(page.getByTestId('small-menu')).toBeVisible()
          await shoot(page, `small-menu-${one.name}-${width}-${theme}`)
          await page.context().close()
        }
      }
    },
  )
}
