// Export's helpers that more than one spec uses: opening Export from Share, downloading what it
// makes, and Node's export of the same request to hold it against.
import { readFileSync } from 'node:fs'

import { exportDesign, readZip } from '@dazbee/export'
import { fixtureResources } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { ExportRequestInput, ExportType } from '@dazbee/schema'

import { designOf } from './editor.ts'
import { expect, type Page } from './test.ts'

/** The file a frame's name gives by default, as the export makes a name safe. */
export const fileOf = (name: string, n = 1, type = 'png') => `${name.replace(':', '-')}${n > 1 ? ` ${n}` : ''}.${type}`

/** Opens Export from the Share menu, and returns the form. */
export async function openExport(page: Page) {
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Node's export of a request over the design as the page holds it now, with the shipped fonts and
 * the stored bytes of each uploaded image asked for.
 */
export async function nodeExport(page: Page, assetIds: readonly string[] = []) {
  const ck = await loadCanvasKit()
  const json = JSON.parse(await designOf(page)) as unknown
  const resources = fixtureResources()
  for (const assetId of assetIds)
    resources.images[assetId] = new Uint8Array(
      await (await page.request.get(`/brands/dev-brand-coffee/assets/${assetId}`)).body(),
    )
  return (request: ExportRequestInput) => exportDesign(ck, json, request, resources)
}

/** Clicks Export and reads what downloads: its name, and each file in it with its bytes. */
export async function runExport(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  const bytes = new Uint8Array(readFileSync(await download.path()))
  const name = download.suggestedFilename()
  return { name, files: name.endsWith('.zip') ? readZip(bytes) : [{ path: name, bytes }] }
}

/** Whether what downloaded is, file for file and byte for byte, what Node exports of the same request. */
export async function expectNode(
  page: Page,
  request: { frameIds: string[]; type: ExportType },
  got: Awaited<ReturnType<typeof runExport>>,
) {
  const node = (await nodeExport(page))(request)
  const want = node.name.endsWith('.zip') ? readZip(node.bytes) : [{ path: node.name, bytes: node.bytes }]
  expect(got.name, `${request.type} download`).toBe(node.name)
  expect(got.files.map((f) => f.path)).toEqual(want.map((f) => f.path))
  for (const [i, file] of got.files.entries())
    expect(Buffer.from(file.bytes).equals(Buffer.from(want[i]?.bytes ?? [])), `${file.path} is Node's`).toBe(true)
}
