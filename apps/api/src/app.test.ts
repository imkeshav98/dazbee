// The app's one error mapping, against Postgres from Docker Compose (`docker compose up -d --wait postgres`).
// A design or template the API stored is valid, so `createDesign` is made to refuse one here to reach the
// routes that copy stored content into a new design.
import { describe, expect, it, vi } from 'vitest'

import { DesignSummary, TemplateSummary } from '@dazbee/schema'

import { brand, call } from './test-api.ts'
import { createDesign, InvalidContent } from './workspace/designs.ts'

vi.mock('./workspace/designs.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace/designs.ts')>()
  return { ...actual, createDesign: vi.fn(actual.createDesign) }
})

/** One page holding one empty, white frame. */
const blank = {
  meta: { designId: 'any', name: 'Plain' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    sq: {
      pageId: 'p1',
      name: 'Square',
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      fills: [{ type: 'solid', color: '#FFFFFFFF' }],
      order: 'a0',
    },
  },
  nodes: {},
}

// Saving a template draws its thumbnail with CanvasKit, which takes seconds on a busy CI runner.
describe('errors', { timeout: 60_000 }, () => {
  it('answers a design that is not valid with 400 and why, on the duplicate and start-from-template routes too', async () => {
    const design = DesignSummary.parse((await call('a', 'POST', `/brands/${brand.id}/designs`, { name: 'Plain' })).json)
    vi.mocked(createDesign).mockRejectedValueOnce(new InvalidContent('nodes.x: broken'))
    expect(await call('a', 'POST', `/brands/${brand.id}/designs/${design.id}/duplicate`, {})).toEqual({
      status: 400,
      json: { error: 'The design is not valid: nodes.x: broken' },
    })

    const saved = await call('a', 'POST', `/brands/${brand.id}/templates`, {
      name: 'Plain',
      scope: 'brand',
      content: blank,
    })
    expect(saved.status).toBe(201)
    const template = TemplateSummary.parse(saved.json)
    vi.mocked(createDesign).mockRejectedValueOnce(new InvalidContent('nodes.y: broken'))
    expect(await call('a', 'POST', `/brands/${brand.id}/templates/${template.id}/designs`, {})).toEqual({
      status: 400,
      json: { error: 'The design is not valid: nodes.y: broken' },
    })
  })
})
