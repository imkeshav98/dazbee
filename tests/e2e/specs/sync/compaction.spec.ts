// Compaction (#57): while a tab is connected, a deleted layer stays so undo can bring it back; once
// everyone has left, the sync server drops deleted layers and stores a smaller design, and whoever
// opens it next sees the same design and the same export.
import { designOf, exportHashOf, openTabs, settle, writeOutput } from '../../support/editor.ts'
import { storedSize } from '../../support/local-servers.ts'
import { linkedFrames, liveDesign, seed } from '../../support/seed.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

/** Makes `count` layers in the banner frame, moves each there and deletes it, as commands in the tab. */
const makeAndDelete = (page: Page, count: number) =>
  page.evaluate((count) => {
    const editor = window.dazbee
    if (!editor) throw new Error('no editor')
    for (let i = 0; i < count; i++) {
      const id = editor.session.run('node.create', {
        parentId: 'banner',
        layer: {
          type: 'graphic',
          name: `Try ${i}`,
          props: {
            x: 10 * i,
            y: 40,
            width: 200,
            height: 200,
            shape: { kind: 'ellipse' },
            fills: [{ type: 'solid', color: '#FFC400FF' }],
          },
        },
      })
      editor.session.run('node.update', { ids: [id], patch: { x: 8, y: 4, width: 40, height: 40 } })
      editor.session.run('node.delete', { ids: [id] })
    }
  }, count)

test('undo of a delete still works with another tab connected; once both leave the design is compacted and reopens the same', async ({
  browser,
}) => {
  const designId = await seed(linkedFrames(liveDesign(), [{ id: 'banner', name: 'Banner', width: 1200, height: 628 }]))
  const { tabs, errors } = await openTabs(browser, 2, designId)
  const [a, b] = tabs as [Page, Page]

  await makeAndDelete(a, 300)
  // The two-tab check: B deletes a layer and undoes it while A is connected, and both see it back.
  const kept = await b.evaluate(() => {
    const editor = window.dazbee
    if (!editor) throw new Error('no editor')
    const id = editor.session.run('node.create', {
      parentId: 'sq',
      layer: {
        type: 'graphic',
        name: 'Kept',
        props: {
          x: 600,
          y: 600,
          width: 120,
          height: 120,
          shape: { kind: 'rect' },
          fills: [{ type: 'solid', color: '#1E88E5FF' }],
        },
      },
    })
    editor.session.run('node.delete', { ids: [id] })
    editor.session.undo()
    return id
  })
  await settle([a, b])
  expect(JSON.parse(await designOf(a)).nodes[kept]).toMatchObject({ name: 'Kept' })
  const design = JSON.parse(await designOf(a)) as unknown
  const hash = await exportHashOf(a)
  await expect.poll(() => storedSize(designId), { timeout: 30_000 }).toBeGreaterThan(0)
  // Stored with the deleted layers still in it, while anyone is connected. The size holding for
  // 1.5 s of real time, three times the sync server's 500 ms store debounce, means no store is due.
  await expect
    .poll(
      async () => {
        const s = storedSize(designId)
        await new Promise((r) => setTimeout(r, 1500))
        return s === storedSize(designId)
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  const before = storedSize(designId)

  await a.context().close()
  // 1.5 s of real time, three times the store debounce: a store or a compaction on A leaving would
  // have landed by now, and with B still connected neither does.
  await new Promise((r) => setTimeout(r, 1500))
  expect(storedSize(designId)).toBe(before)
  await b.context().close()
  await expect.poll(() => storedSize(designId), { timeout: 30_000 }).toBeLessThan(before * 0.7)
  const after = storedSize(designId)

  const {
    tabs: [again],
    errors: againErrors,
  } = await openTabs(browser, 1, designId)
  if (!again) throw new Error('no tab')
  expect(JSON.parse(await designOf(again))).toEqual(design)
  expect(await exportHashOf(again)).toBe(hash)
  writeOutput('compaction-sizes.json', JSON.stringify({ deletes: 300, before, after }, null, 2))
  writeOutput('compaction-0-reopened.png', await again.screenshot())
  expect([...errors, ...againErrors]).toEqual([])
})
