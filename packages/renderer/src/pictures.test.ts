import { describe, expect, it } from 'vitest'

import { loadCanvasKit } from './node.ts'
import { layerPictures } from './pictures.ts'
import type { Resources } from './resources.ts'
import type { SceneLayer } from './scene.ts'

const ck = await loadCanvasKit()
const resources = (): Resources => ({ fonts: ck.FontCollection.Make(), fallbackFamilies: [], images: new Map() })
const layer = (id: string) => ({ id }) as unknown as SceneLayer

describe('layerPictures', () => {
  it('records a layer once and replays it while it is kept', () => {
    const pictures = layerPictures(2)
    const drawn = resources()
    const a = layer('a')
    let recordings = 0
    const first = pictures.picture(ck, a, drawn, () => recordings++)
    expect(pictures.picture(ck, a, drawn, () => recordings++)).toBe(first)
    expect(recordings).toBe(1)
    pictures.delete()
  })

  it('frees the least recently used picture past the limit', () => {
    const pictures = layerPictures(2)
    const drawn = resources()
    const [a, b, c] = [layer('a'), layer('b'), layer('c')]
    const pa = pictures.picture(ck, a, drawn, () => {})
    const pb = pictures.picture(ck, b, drawn, () => {})
    pictures.picture(ck, a, drawn, () => {})
    const pc = pictures.picture(ck, c, drawn, () => {})
    expect([pa.isDeleted(), pb.isDeleted(), pc.isDeleted()]).toEqual([false, true, false])
    expect(pictures.picture(ck, a, drawn, () => {})).toBe(pa)
    expect(pictures.picture(ck, c, drawn, () => {})).toBe(pc)
    expect(pictures.picture(ck, b, drawn, () => {})).not.toBe(pb)
    expect(pa.isDeleted()).toBe(true)
    pictures.delete()
  })

  it('frees every picture when the resources change, and on delete', () => {
    const pictures = layerPictures(4)
    const a = layer('a')
    const before = pictures.picture(ck, a, resources(), () => {})
    const after = pictures.picture(ck, a, resources(), () => {})
    expect(before.isDeleted()).toBe(true)
    pictures.delete()
    expect(after.isDeleted()).toBe(true)
  })
})
