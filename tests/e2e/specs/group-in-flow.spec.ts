// Grouping and framing layers inside an auto layout frame in Chromium, with real input (#233): a
// layer the flow sizes is double-clicked into and grouped with Mod+G, or framed with Mod+Alt+G,
// and every layer stays where it is drawn; around a layer that keeps where it is, the group does too.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { screenPoint, writeOutput } from '../support/editor.ts'
import { openStage, press, read, selection } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const rect = (name: string, parentId: string, index: string, width: number, height: number, color: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'graphic', parentId, index, name, props: { x: 0, y: 0, width, height, shape: { kind: 'rect' }, fills: [{ type: 'solid', color }], ...extra } }) as DesignInput['nodes'][string]
const design: DesignInput = {
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Group in a flow', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    auto: {
      type: 'frame', parentId: 'p1', index: 'a0', name: 'Auto layout',
      props: { x: 40, y: 240, width: 700, height: 160, sizing: { width: 'fixed', height: 'hug' }, fills: [{ type: 'solid', color: '#E6F4EFFF' }], layout: { direction: 'row', gap: 20, padding: { top: 20, right: 20, bottom: 20, left: 20 } } },
    },
    fixed: rect('Fixed', 'auto', 'a0', 120, 120, '#00A88AFF'),
    fill: rect('Fill', 'auto', 'a1', 100, 120, '#1F2329FF', { sizing: { width: 'fill', height: 'fixed' } }),
    last: rect('Last', 'auto', 'a2', 120, 120, '#FF2E7EFF'),
    kept: rect('Kept', 'auto', 'a3', 60, 60, '#2F6BFFFF', { x: 660, y: 410, absolute: true }),
  },
  overrides: {},
}
const IDS = ['auto', 'fixed', 'fill', 'last', 'kept']
const boxes = (page: Page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.dazbee?.boxOf(id, 'p1', 'sq') ?? null])), IDS)

for (const [name, action] of [['groups', 'group'], ['frames', 'frameSelection']] as const) {
  test(`Mod+${action === 'group' ? '' : 'Alt+'}G ${name} the layer the flow fills without moving anything`, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design)
    const before = await boxes(page)
    // A click picks the auto layout frame; a second goes into it and picks the layer the flow fills.
    const fill = before.fill as { x: number; y: number; width: number; height: number }
    const at = await screenPoint(page, fill.x + fill.width / 2, fill.y + fill.height / 2)
    await page.mouse.dblclick(at.x, at.y)
    await page.evaluate(() => window.dazbee?.drawn())
    expect(await selection(page)).toEqual(['fill'])
    await press(page, action)
    const [wrapper] = await selection(page)
    expect(wrapper).not.toBe('fill')
    expect(await boxes(page)).toEqual(before)
    writeOutput(`group-in-flow-${action}.png`, await page.screenshot())
    await press(page, 'undo')
    expect((await read(page)).nodes[wrapper ?? '']).toBeUndefined()
    expect(errors).toEqual([])
  })
}

test('a group around a layer that keeps where it is keeps where it is', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  const before = await boxes(page)
  await page.evaluate(() => window.dazbee?.select(['kept'], 'p1', 'sq'))
  await press(page, 'group')
  const [wrapper] = await selection(page)
  expect((await read(page)).nodes[wrapper ?? '']?.props.absolute).toBe(true)
  expect(await boxes(page)).toEqual(before)
  expect(errors).toEqual([])
})
