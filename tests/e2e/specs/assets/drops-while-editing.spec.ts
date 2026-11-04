// Images dropped from the computer whose uploads finish while something else goes on: a text being
// typed into, an open pen path, a drag on the canvas, or the frame they were dropped on being
// deleted.
import { randomUUID } from 'node:crypto'

import { card1, card2, figmaBadge } from '../../support/assets.ts'
import { screenPoint, writeOutput } from '../../support/editor.ts'
import { assetsOf, dropDesign, dropFiles, images, routeUploads } from '../../support/file-drops.ts'
import { linkedFrames, newBrand, type Seeded } from '../../support/seed.ts'
import { openStage, props, read } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

test('images that finish uploading while a text is typed into end the typing and go on as one undo step of their own', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e dropped files')
  const title: Seeded = {
    type: 'text',
    parentId: 'sq',
    index: 'a0',
    name: 'Title',
    props: {
      x: 100,
      y: 100,
      width: 600,
      height: 60,
      text: 'Hello',
      style: { fontFamily: 'Noto Sans', fontSize: 40, color: '#111111FF' },
    },
  }
  const { page, errors } = await openStage(browser, dropDesign({ title }), { brandId })
  const release = await routeUploads(page, brandId, { hold: true })
  const text = async () =>
    ((await read(page)).nodes as unknown as Record<string, { props: { text: string } }>).title?.props.text

  const files = [
    { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card1 },
    { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card2 },
  ]
  expect(await dropFiles(page, await screenPoint(page, 540, 700), files)).toBe(true)
  await expect(page.getByTestId('notice-toast')).toContainText('Uploading 2 images')
  // Typing into the title, past its end, when the uploads finish.
  const end = await screenPoint(page, 600, 130)
  await page.mouse.dblclick(end.x, end.y)
  await expect(page.locator('.caret')).toBeVisible()
  await page.keyboard.type('abc')
  release()

  await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(2)
  await expect(page.locator('.caret')).toHaveCount(0)
  expect(await text()).toBe('Helloabc')
  // One undo takes both images away and leaves the typing; the next takes the typing back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(await text()).toBe('Helloabc')
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await text()).toBe('Hello')
  expect(errors).toEqual([])
})

test('images that finish uploading while a pen path is open go on within a few seconds as one undo step, the path kept as drawn', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, dropDesign(), { brandId })
  const release = await routeUploads(page, brandId, { hold: true })
  const paths = async () =>
    Object.entries((await read(page)).nodes as unknown as Record<string, { props: { shape?: { kind: string } } }>)
      .filter(([, n]) => n.props.shape?.kind === 'path')
      .map(([id]) => id)

  const files = [
    { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card1 },
    { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card2 },
  ]
  expect(await dropFiles(page, await screenPoint(page, 540, 700), files)).toBe(true)
  await expect(page.getByTestId('notice-toast')).toContainText('Uploading 2 images')
  // A pen path with two anchors, left open, when the uploads finish.
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Pen' }).click()
  for (const [x, y] of [
    [200, 200],
    [420, 260],
  ] as const) {
    const at = await screenPoint(page, x, y)
    await page.mouse.click(at.x, at.y)
  }
  await expect.poll(paths).toHaveLength(1)
  expect(await page.evaluate(() => window.dazbee?.gesturing())).toBe(true)
  const released = Date.now()
  release()

  await expect.poll(async () => (await images(page)).length, { timeout: 20_000 }).toBe(2)
  expect(Date.now() - released).toBeLessThan(12_000)
  await expect(page.getByTestId('notice-toast')).toHaveCount(0)
  const [path] = await paths()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-8-pen.png', await page.screenshot())
  // One undo takes both images away and keeps the path; the next takes the path.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(await paths()).toEqual([path])
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await paths()).toEqual([])
  expect(errors).toEqual([])
})

test('images that finish uploading while a layer is dragged on the canvas go on after it is let go, the drag and the images one undo step each', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e dropped files')
  const square: Seeded = {
    type: 'graphic',
    parentId: 'sq',
    index: 'a0',
    name: 'Square',
    props: {
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      shape: { kind: 'rect' },
      fills: [{ type: 'solid', color: '#2F6BFFFF' }],
    },
  }
  const { page, errors } = await openStage(browser, dropDesign({ square }), { brandId })
  const release = await routeUploads(page, brandId, { hold: true })
  // Where the square is in its frame: a drag on the stage moves it there.
  const x = async () => (await props(page, 'square')).x

  const files = [
    { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card1 },
    { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card2 },
  ]
  expect(await dropFiles(page, await screenPoint(page, 540, 800), files)).toBe(true)
  // The square is pressed and dragged, and still held when the uploads finish, for longer than the pen path's limit.
  const from = await screenPoint(page, 200, 200)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 5 })
  release()
  await page.waitForTimeout(4_500)
  expect(await images(page)).toEqual([])
  await page.mouse.move(from.x + 120, from.y + 60, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await images(page)).length, { timeout: 20_000 }).toBe(2)
  const moved = await x()
  expect(moved).not.toBe(100)
  // One undo takes both images away and leaves the square where it was dragged; the next puts it back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(await x()).toBe(moved)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await x()).toBe(100)
  expect(errors).toEqual([])
})

test('an SVG file whose frame is deleted while it uploads is not placed, and the notice says it is in the library', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(
    browser,
    linkedFrames(dropDesign(), [{ id: 'wide', name: 'Wide', width: 1920, height: 1080 }]),
    { brandId },
  )
  await page.evaluate(() => window.dazbee?.setCamera({ x: 40, y: 80, zoom: 0.35 }))
  await page.evaluate(() => window.dazbee?.drawn())
  const release = await routeUploads(page, brandId, { hold: true })

  const name = `Badge ${randomUUID().slice(0, 8)}`
  expect(
    await dropFiles(page, await screenPoint(page, 500, 500, 'wide'), [
      { name: `${name}.svg`, type: 'image/svg+xml', bytes: figmaBadge },
    ]),
  ).toBe(true)
  await page.evaluate(() => window.dazbee?.session.run('frame.delete', { frameId: 'wide' }))
  release()

  await expect(page.getByTestId('notice-toast')).toContainText('Uploaded to the library', { timeout: 30_000 })
  expect(Object.values((await read(page)).nodes)).toEqual([])
  expect((await assetsOf(brandId)).map((a) => a.name)).toEqual([name])
  expect(Object.keys((await read(page)).frames)).toEqual(['sq'])
  writeOutput('dropped-files-9-frame-gone.png', await page.screenshot())
  expect(errors).toEqual([])
})
