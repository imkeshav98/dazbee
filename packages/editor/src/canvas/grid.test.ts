import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { COLUMN_GAP, frameAt, frameGrid, ROW_GAP } from './grid.ts'

const design = (() => {
  const parsed = parseDesign({
    meta: { schemaVersion: 5, designId: 'd', name: 'D', kind: 'carousel', primaryFormatId: 'sq' },
    formats: {
      story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
      sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
      mpu: { name: 'MPU', width: 300, height: 250, order: 'a2' },
    },
    pages: { two: { name: 'Two', order: 'a1' }, one: { name: 'One', order: 'a0' } },
    nodes: {},
  })
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
})()

describe('frameGrid', () => {
  it('puts pages in rows and formats in columns, in their order, with nothing stored', () => {
    const { frames, bounds } = frameGrid(design)
    expect(frames.map((f) => f.key)).toEqual(['one/sq', 'one/story', 'one/mpu', 'two/sq', 'two/story', 'two/mpu'])
    expect(frames.find((f) => f.key === 'one/story')).toMatchObject({ x: 1080 + COLUMN_GAP, y: 0 })
    expect(frames.find((f) => f.key === 'two/mpu')).toMatchObject({
      x: 2160 + 2 * COLUMN_GAP,
      y: 1920 + ROW_GAP,
      width: 300,
    })
    expect(bounds).toEqual({ x: 0, y: 0, width: 2160 + 300 + 2 * COLUMN_GAP, height: 2 * 1920 + ROW_GAP })
    expect(frameAt(frames, { x: 1080 + COLUMN_GAP + 5, y: 1920 + ROW_GAP + 5 })?.key).toBe('two/story')
    expect(frameAt(frames, { x: 1080 + 5, y: 5 })).toBeUndefined()
  })

  it('shows one format alone in the focus view, and every format for one it does not have', () => {
    expect(frameGrid(design, 'story').frames.map((f) => f.key)).toEqual(['one/story', 'two/story'])
    expect(frameGrid(design, 'story').frames[0]).toMatchObject({ x: 0, y: 0 })
    expect(frameGrid(design, 'gone').frames).toHaveLength(6)
  })
})
