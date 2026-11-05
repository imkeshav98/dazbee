// A browser context a test opens is closed when the test ends, so a worker's memory stays flat
// through a run.
import { expect, test } from '../../support/test.ts'

test.describe.configure({ mode: 'serial' })

let closed = false

test('a test opens a browser context and ends without closing it', async ({ browser }) => {
  const left = await browser.newContext()
  left.on('close', () => {
    closed = true
  })
  await left.newPage()
})

test('the next test finds that context closed', () => {
  expect(closed, 'the context the first test left open').toBe(true)
})
