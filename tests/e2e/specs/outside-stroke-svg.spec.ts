// An outside stroke exported as SVG from the Share menu, with real input (#270): the stroke lies
// outside the shape's edge only, as the stage draws it, never on a band inside it.
import { readFileSync } from 'node:fs'
import { expect, test } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { writeOutput } from '../support/editor.ts'
import { openStage } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const design: DesignInput = {
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Outside stroke', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 300, height: 300, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    box: {
      type: 'graphic', parentId: 'p1', index: 'a0', name: 'Box',
      props: { x: 50, y: 50, width: 200, height: 200, shape: { kind: 'rect', cornerRadius: 24 }, fills: [{ type: 'solid', color: '#2050E0FF' }], strokes: [{ paint: { type: 'solid', color: '#000000FF' }, width: 10, align: 'outside' }] },
    },
  },
  overrides: {},
}

test('a shape with an outside stroke exports as SVG with the stroke outside its edge only', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  await page.locator('[data-type="svg"]').click()
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toMatch(/\.svg$/)
  const svg = readFileSync(await download.path(), 'utf8')
  writeOutput('outside-stroke.svg', svg)
  // The file drawn in the page, read back at a few points: the left edge is at x 50.
  const at = await page.evaluate(async (text) => {
    const image = new Image()
    image.src = `data:image/svg+xml;base64,${btoa(text)}`
    await image.decode()
    const canvas = new OffscreenCanvas(300, 300)
    const context = canvas.getContext('2d')
    context?.drawImage(image, 0, 0, 300, 300)
    const pixel = (x: number, y: number) => [...(context?.getImageData(x, y, 1, 1).data ?? [])].slice(0, 3)
    return { outside: pixel(45, 150), inside: pixel(55, 150), middle: pixel(150, 150) }
  }, svg)
  expect(at.outside).toEqual([0, 0, 0])
  expect(at.inside).toEqual([32, 80, 224])
  expect(at.middle).toEqual([32, 80, 224])
  writeOutput('outside-stroke-export.png', await page.screenshot())
  expect(errors).toEqual([])
})
