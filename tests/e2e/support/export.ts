// Export's helpers that more than one spec uses: opening Export from Share, downloading what it
// makes, and Node's export of the same request to hold it against.
import { readFileSync } from 'node:fs'

import { exportDesign, readZip } from '@dazbee/export'
import { fixtureResources } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { ExportType } from '@dazbee/schema'

import { designOf } from './editor.ts'
import { expect, type Page } from './test.ts'

/** Node's export of a request over the design as the page holds it now, with the shipped fonts. */
export async function nodeExport(page: Page) {
  const ck = await loadCanvasKit()
  const json = JSON.parse(await designOf(page)) as unknown
  return (request: { frameIds: string[]; type: ExportType }) => exportDesign(ck, json, request, fixtureResources())
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

export async function openExport(page: Page) {
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  return dialog
}
