// Glass over a bright ad, for the PR's evidence: the editor zoomed so the ad fills the window, with
// the full menu, the edit panel and the Layers flyout open in turn, in dark and light, at desktop,
// tablet and phone sizes. The ad has a white and a black block on its yellow, and a pink circle, so
// each picture shows the glass over all four.
import type { DesignInput } from '@dazbee/schema'

import { editorPath, setCookies, writeOutput } from '../../support/editor.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, moreMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** The ad's side, in design pixels. */
const SIDE = 1080

const solid = (color: string) => [{ type: 'solid' as const, color }]
const shape = (
  name: string,
  index: string,
  box: { x: number; y: number; width: number; height: number },
  color: string,
  kind: 'rect' | 'ellipse' = 'rect',
) => ({
  type: 'graphic' as const,
  parentId: 'p1',
  index,
  name,
  props: { ...box, shape: kind === 'rect' ? { kind, cornerRadius: 0 } : { kind }, fills: solid(color) },
})

const brightAd = (): DesignInput => ({
  meta: { designId: 'replaced-by-the-api', name: 'Bright ad', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: SIDE, height: SIDE, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFD23FFF') } },
  nodes: {
    white: shape('White', 'a0', { x: 0, y: 0, width: 540, height: 380 }, '#FFFFFFFF'),
    black: shape('Black', 'a1', { x: 0, y: 700, width: 540, height: 380 }, '#000000FF'),
    circle: shape('Circle', 'a2', { x: 560, y: 260, width: 520, height: 520 }, '#FF48B0FF', 'ellipse'),
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a3',
      name: 'Headline',
      props: {
        x: 120,
        y: 440,
        width: 840,
        height: 160,
        text: 'Weekend sale',
        style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#1A1420FF' },
      },
    },
  },
  overrides: {},
})

/** Zooms so the ad covers the whole window, centred, so every piece of glass floats over it. */
async function fillWithAd(page: Page, width: number, height: number) {
  await fitSettled(page)
  const zoom = (Math.max(width, height) / SIDE) * 1.05
  const camera = { x: (width - SIDE * zoom) / 2, y: (height - SIDE * zoom) / 2, zoom }
  await page.evaluate((camera) => window.dazbee?.setCamera(camera), camera)
  await drawn(page)
}

async function shot(page: Page, name: string) {
  await nextFrame(page)
  writeOutput(`${name}.png`, await page.screenshot({ animations: 'disabled' }))
}

for (const [width, height] of SCREEN_SIZES) {
  test(
    `glass over a bright ad at ${width}×${height}: a menu, the edit panel and a flyout`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const designId = await seed(brightAd())
      for (const theme of ['dark', 'light'] as const) {
        const context = await browser.newContext({ viewport: { width, height } })
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await setCookies(page, { theme })
        await page.goto(editorPath(designId))
        await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
        await fillWithAd(page, width, height)
        await selectLayers(page, ['headline'], { bar: true })

        await moreMenu(page)
        await shot(page, `glass-${theme}-${width}-menu`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-more-menu')).toBeHidden()

        await barMenu(page, 'position')
        await expect(page.locator('#edit-panel')).toBeVisible()
        await shot(page, `glass-${theme}-${width}-edit-panel`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-position-menu')).toBeHidden()

        await page.getByRole('button', { name: 'Layers', exact: true }).click()
        await expect(page.getByTestId('flyout')).toBeVisible()
        await shot(page, `glass-${theme}-${width}-flyout`)
        expect(errors).toEqual([])
        await context.close()
      }
    },
  )
}
