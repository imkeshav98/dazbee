// Files dropped from the computer, as the browser hands them over: the design they are dropped on,
// the drop itself, the uploads held or failed, and the images placed and stored.
import { AssetSummary, type DesignInput } from '@dazbee/schema'

import { callApi } from './seed.ts'
import { read } from './stage.ts'
import type { Page } from './test.ts'

/** A square design with one white page, and any more formats and pages given. */
export const dropDesign = (
  nodes: DesignInput['nodes'] = {},
  more: Partial<Pick<DesignInput, 'formats' | 'pages'>> = {},
): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Dropped files',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' }, ...more.formats },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] }, ...more.pages },
  nodes,
  overrides: {},
})

/**
 * Drops files from the computer at a point on screen, as the browser does: the drag enters and
 * passes over the element there, and drops only if the page took it on the way over (otherwise
 * the browser would open the file). Says whether the page took it.
 */
export function dropFiles(
  page: Page,
  at: { x: number; y: number },
  files: { name: string; type: string; bytes: Uint8Array }[],
) {
  return page.evaluate(
    ({ at, files }) => {
      const transfer = new DataTransfer()
      for (const f of files)
        transfer.items.add(
          new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.name, { type: f.type }),
        )
      const target = document.elementFromPoint(at.x, at.y)
      if (!target) throw new Error(`nothing on screen at ${at.x}, ${at.y}`)
      const fire = (type: string) =>
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: at.x,
            clientY: at.y,
            dataTransfer: transfer,
          }),
        )
      fire('dragenter')
      const taken = !fire('dragover')
      if (taken) fire('drop')
      return taken
    },
    { at, files: files.map((f) => ({ name: f.name, type: f.type, base64: Buffer.from(f.bytes).toString('base64') })) },
  )
}

/**
 * Holds every upload into the brand's library until the returned function is called; uploads of
 * files whose names start with `fail-` are answered with an error instead.
 */
export async function routeUploads(page: Page, brandId: string, { hold = false } = {}) {
  let release = () => {}
  const held = hold
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()
  await page.route(
    (url) => url.pathname === `/brands/${brandId}/assets`,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      if (/filename="fail-/.test(route.request().postDataBuffer()?.toString('latin1') ?? ''))
        return route.fulfill({ status: 500, json: { error: 'Storage is down' } })
      await held
      return route.continue()
    },
  )
  return release
}

export const assetsOf = async (brandId: string) =>
  AssetSummary.array().parse(await callApi('GET', `/brands/${brandId}/assets`))

/** The graphics on the page filled with an image, and the asset each shows. */
export async function images(page: Page) {
  const nodes = (await read(page)).nodes as unknown as Record<
    string,
    {
      parentId: string
      props: { x: number; y: number; width: number; height: number; fills?: { type: string; assetId?: string }[] }
    }
  >
  return Object.entries(nodes)
    .filter(([, n]) => n.props.fills?.[0]?.type === 'image')
    .map(([id, n]) => ({ id, parentId: n.parentId, assetId: n.props.fills?.[0]?.assetId, ...n.props }))
}
