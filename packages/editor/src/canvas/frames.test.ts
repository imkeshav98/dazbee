import { describe, expect, it } from 'vitest'

import { COLUMN_GAP, frameAt, frameGrid, ROW_GAP } from './frames.ts'
import { design } from './test-design.ts'

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
