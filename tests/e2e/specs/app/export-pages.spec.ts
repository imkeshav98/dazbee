// Export (#55) of a carousel's pages in Chromium: each page, picked in the Page field, downloads
// its own frame as PNG, and one frame as JPG downloads as itself, each byte for byte what Node
// exports of that frame.
import { readFileSync } from 'node:fs'

import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { fileOf, nodeExport } from '../../support/export.ts'
import { choose } from '../../support/fields.ts'
import { openStage } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

const slide = (pageId: string, color: string) => ({
  pageId,
  name: 'Portrait 4:5',
  width: 1080,
  height: 1350,
  x: 0,
  y: 0,
  fills: [{ type: 'solid' as const, color }],
  order: 'a0',
})

/** A carousel of three pages, each one portrait frame with its own picture: a photo and words, words on dark, a badge on pink. */
const carousel = (assetId: string): DesignInput => ({
  meta: { designId: 'replaced-by-the-api', name: 'Spring carousel' },
  pages: {
    s1: { name: 'Slide 1', order: 'a0' },
    s2: { name: 'Slide 2', order: 'a1' },
    s3: { name: 'Slide 3', order: 'a2' },
  },
  frames: {
    's1-pt': slide('s1', '#FFF6E8FF'),
    's2-pt': slide('s2', '#15121AFF'),
    's3-pt': slide('s3', '#FF48B0FF'),
  },
  nodes: {
    photo: {
      type: 'graphic',
      parentId: 's1-pt',
      link: 'photo',
      index: 'a0',
      name: 'Photo',
      props: {
        x: 80,
        y: 80,
        width: 920,
        height: 760,
        shape: { kind: 'rect', cornerRadius: 40 },
        fills: [{ type: 'image', assetId, fit: 'fill' }],
      },
    },
    title: {
      type: 'text',
      parentId: 's1-pt',
      link: 'title',
      index: 'a1',
      name: 'Title',
      role: 'headline',
      props: {
        x: 80,
        y: 960,
        width: 920,
        height: 140,
        text: 'Spring drop',
        style: { fontFamily: 'Noto Sans', fontSize: 110, fontWeight: 800, color: '#15121AFF' },
      },
    },
    offer: {
      type: 'text',
      parentId: 's2-pt',
      link: 'offer',
      index: 'a0',
      name: 'Offer',
      props: {
        x: 80,
        y: 600,
        width: 920,
        height: 140,
        text: '30% off',
        style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFFFF' },
      },
    },
    badge: {
      type: 'graphic',
      parentId: 's3-pt',
      link: 'badge',
      index: 'a0',
      name: 'Badge',
      props: {
        x: 340,
        y: 300,
        width: 400,
        height: 400,
        shape: { kind: 'star', points: 10, innerRadius: 0.75 },
        fills: [{ type: 'solid', color: '#FFD23FFF' }],
      },
    },
    cta: {
      type: 'text',
      parentId: 's3-pt',
      link: 'cta',
      index: 'a1',
      name: 'Call to action',
      props: {
        x: 80,
        y: 900,
        width: 920,
        height: 120,
        text: 'Shop now',
        style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 700, color: '#15121AFF' },
      },
    },
  },
})

test('each page of a carousel, picked in the Page field, downloads its own frame as PNG, what Node exports of that frame', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, carousel(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  // The shown page's frame, as the export opens.
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  writeOutput('export-5-carousel-menu.png', await page.screenshot())

  // Each file is its own page's frame, byte for byte what Node exports of that frame alone, named
  // after it: the three share a name, each alone on its page.
  const node = await nodeExport(page, [asset.id])
  const files: Buffer[] = []
  for (const [pageId, frameId] of [
    ['s1', 's1-pt'],
    ['s2', 's2-pt'],
    ['s3', 's3-pt'],
  ] as const) {
    await choose(page.getByTestId('export-page'), pageId)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
    expect(download.suggestedFilename()).toBe(fileOf('Portrait 4:5'))
    const browserFile = readFileSync(await download.path())
    expect(
      browserFile.equals(Buffer.from(node({ frameIds: [frameId], type: 'png' }).bytes)),
      `${pageId} is ${frameId} as Node exports it`,
    ).toBe(true)
    writeOutput(`export-6-carousel-${frameId}.png`, browserFile)
    files.push(browserFile)
  }
  expect(new Set(files.map((file) => file.toString('base64'))).size).toBe(3)
  expect(errors).toEqual([])
})

test("one page's only frame as JPG downloads as itself, at the quality picked, the same bytes as Node", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, carousel(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  await choose(page.getByTestId('export-page'), 's2')
  await page.locator('[data-type="jpg"]').click()
  await page.getByTestId('export-quality').fill('70')
  await page.getByTestId('export-quality').press('Enter')
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  writeOutput('export-3-jpg-menu.png', await page.screenshot())
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe(fileOf('Portrait 4:5', 1, 'jpg'))
  const jpg = readFileSync(await download.path())
  const node = await nodeExport(page, [asset.id])
  expect(jpg.equals(Buffer.from(node({ frameIds: ['s2-pt'], type: 'jpg', quality: 70 }).bytes))).toBe(true)
  // Lower quality is a smaller file.
  expect(jpg.length).toBeLessThan(node({ frameIds: ['s2-pt'], type: 'jpg', quality: 100 }).bytes.length)
  writeOutput('export-4-offer.jpg', jpg)
  expect(errors).toEqual([])
})
