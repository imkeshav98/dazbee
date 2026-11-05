// The small menu and the selection's size at the three screen sizes: with a layer near a frame's
// top left corner, near its top right corner, in a frame along the stage's left edge, and with the
// Colour panel open, the small menu shows clear of every frame's label and the size lies wholly on
// the screen; and the PR's pictures of each in both themes.
import { shoot } from '../../support/editor.ts'
import { design, openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { drawn, nextFrame, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 180_000 })

/** Each case: the layer selected, whether the square is moved to the stage's left edge first, and the panel opened. */
const CASES = [
  { name: 'top-left', layer: 'headline', atEdge: false },
  { name: 'top-right', layer: 'corner', atEdge: false },
  { name: 'at-edge', layer: 'tilt', atEdge: true },
  { name: 'colour-open', layer: 'tilt', atEdge: false, panel: 'colour' },
] as const satisfies { name: string; layer: string; atEdge: boolean; panel?: string }[]

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
        index: 'a5',
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

/** What covers what: the small menu over each frame label it meets, and the size label's reach past the screen. */
const problems = (page: Page) =>
  page.evaluate(() => {
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
    return found
  })

/** Places the case's frame, selects its layer and opens its panel. */
async function openCase(page: Page, one: (typeof CASES)[number]) {
  const { layer, atEdge } = one
  if (atEdge)
    await page.evaluate(() => {
      const camera = window.dazbee?.camera()
      if (camera) window.dazbee?.setCamera({ ...camera, x: 0 })
    })
  await selectLayers(page, [layer])
  if ('panel' in one) await barMenu(page, one.panel)
  await drawn(page)
  await nextFrame(page)
}

for (const [width, height] of SCREEN_SIZES) {
  for (const one of CASES) {
    test(`at ${width}×${height} with a layer ${one.name}, the small menu keeps off the frames’ labels and the size stays on the screen`, async ({
      browser,
    }) => {
      const { page, errors } = await openSized(browser, { width, height }, { input: withCorner() })
      await openCase(page, one)
      await expect(page.getByTestId('small-menu')).toBeVisible()
      await expect.poll(() => problems(page)).toEqual([])
      expect(errors).toEqual([])
    })
  }
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
