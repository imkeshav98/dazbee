// Short ids in links: a brand and a design made in the app open at a link of two 12-character ids,
// edits there reach a second tab, and a copy of the design gets a short id too. A design whose id
// is a UUID, as ids were made before, still opens, syncs to a second tab and exports.
import * as Y from 'yjs'

import { loadDesign } from '@dazbee/doc'
import { parseDesign } from '@dazbee/schema'

import { designOf, editorPath, openTabs, reloads, settle, writeOutput } from '../../support/editor.ts'
import { expectNode, openExport, runExport } from '../../support/export.ts'
import { storeDesign } from '../../support/local-servers.ts'
import { DEV_BRAND, liveDesign } from '../../support/seed.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const SHORT = '[0-9a-z]{12}'

/** The ids of the frames in the tab's design. */
const framesOf = async (page: Page) => Object.keys(JSON.parse(await designOf(page)).frames as object)

/** Adds a yellow ellipse to a frame of the tab's design, as a command, and returns its id. */
const addEllipse = (page: Page, frameId: string) =>
  page.evaluate((frameId) => {
    const editor = window.dazbee
    if (!editor) throw new Error('no editor')
    return editor.session.run('node.create', {
      parentId: frameId,
      layer: {
        type: 'graphic',
        name: 'Sun',
        props: {
          x: 60,
          y: 60,
          width: 240,
          height: 240,
          shape: { kind: 'ellipse' },
          fills: [{ type: 'solid', color: '#FFC400FF' }],
        },
      },
    })
  }, frameId)

test('a design made in a new brand opens at a link of two short ids, its edits reach a second tab, and its copy is short too', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 760 })
  const run = crypto.randomUUID().slice(0, 6)
  const brandName = `Short links ${run}`
  const name = `Linked launch ${run}`

  await page.goto('/')
  const brands = page.getByRole('list', { name: 'Brands' })
  await brands.getByRole('button', { name: 'New brand' }).click()
  await brands.getByRole('textbox', { name: 'Website or name' }).fill(brandName)
  await brands.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(new RegExp(`/brands/${SHORT}$`))
  const brandId = new URL(page.url()).pathname.split('/')[2] ?? ''

  await page.getByLabel('Brief').fill(name)
  await page.getByRole('button', { name: 'Make drafts' }).click()
  await expect(page).toHaveURL(new RegExp(`/brands/${brandId}/designs/${SHORT}$`), { timeout: 20_000 })
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const designId = new URL(page.url()).pathname.split('/')[4] ?? ''
  writeOutput('short-ids-1-editor.png', await page.screenshot())

  // A second tab at the same link sees the first tab's edit.
  const { tabs, errors: tabErrors } = await openTabs(browser, 1, designId, { brandId })
  const second = tabs[0] as Page
  const [frameId = ''] = await framesOf(page)
  const sun = await addEllipse(page, frameId)
  await settle([page, second])
  expect(JSON.parse(await designOf(second)).nodes[sun]).toMatchObject({ name: 'Sun', parentId: frameId })

  // Duplicate from the brand's designs: the copy has a short id, and opens at its short link.
  await page.goto(`/brands/${brandId}/designs`)
  const tile = page.getByTestId('design-tile').filter({ hasText: name })
  await tile.first().hover()
  await tile
    .first()
    .getByRole('button', { name: `More for ${name}` })
    .click()
  await tile.first().getByRole('menuitem', { name: 'Duplicate' }).click()
  const copy = page.getByTestId('design-tile').filter({ hasText: `${name} copy` })
  await expect(copy).toHaveAttribute('data-design', new RegExp(`^${SHORT}$`))
  const copyId = (await copy.getAttribute('data-design')) ?? ''
  expect(copyId).not.toBe(designId)
  await page.goto(editorPath(copyId, { brandId }))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  expect(JSON.parse(await designOf(page)).nodes).toHaveProperty([sun])
  expect([...errors, ...tabErrors]).toEqual([])
})

test('a design whose id is a UUID still opens, syncs to a second tab and exports', async ({ browser }) => {
  const id = crypto.randomUUID()
  const name = 'Made with a long id'
  const parsed = parseDesign({ ...liveDesign(), meta: { designId: id, name } })
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  storeDesign(id, DEV_BRAND, name, Y.encodeStateAsUpdate(loadDesign(parsed.design)))

  const { tabs, errors } = await openTabs(browser, 2, id)
  const [a, b] = tabs as [Page, Page]
  await expect(a).toHaveURL(new RegExp(`/designs/${id}$`))
  await expect(a.getByRole('heading', { level: 1 })).toHaveText(name)
  const frameIds = await framesOf(a)
  const sun = await addEllipse(a, frameIds[0] ?? '')
  await settle(tabs)
  await reloads(b)
  expect(JSON.parse(await designOf(b)).nodes).toHaveProperty([sun])

  await openExport(a)
  const got = await runExport(a)
  await expectNode(a, { frameIds, type: 'png' }, got)
  expect(errors).toEqual([])
})
