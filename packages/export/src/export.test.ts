import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { loadFontFiles } from '@dazbee/fonts/node'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { DEFAULT_EXPORT_NAME } from '@dazbee/schema'

import { crc32, exportDesign, fileName, readZip, zip } from './index.ts'

const ck = await loadCanvasKit()
const bytes = {
  fonts: loadFontFiles().map((f) => ({ family: f.family, bytes: f.bytes })),
  fallbackFamilies: [...FALLBACK_FAMILIES],
  images: {},
}

const red = [{ type: 'solid', color: '#FF000080' }]
const box = {
  type: 'graphic',
  index: 'a0',
  name: 'Box',
  props: {
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    shape: { kind: 'rect' },
    fills: [{ type: 'solid', color: '#0000FFFF' }],
  },
}
const title = {
  type: 'text',
  index: 'a0',
  name: 'Title',
  props: {
    x: 4,
    y: 4,
    width: 80,
    height: 40,
    text: 'Sale',
    style: { fontFamily: 'Noto Sans', fontSize: 24, color: '#111111FF' },
  },
}

/** Two pages named alike, each with a square frame and a story frame holding linked copies. */
const design = {
  meta: { designId: 'd', name: 'Summer: sale' },
  pages: {
    p1: { name: 'Hero', order: 'a0' },
    p2: { name: 'Hero', order: 'a1' },
  },
  frames: {
    'p1-sq': { pageId: 'p1', name: 'Square', width: 120, height: 120, x: 0, y: 0, fills: red, order: 'a0' },
    'p1-story': { pageId: 'p1', name: 'Story 9:16', width: 90, height: 160, x: 320, y: 0, fills: red, order: 'a1' },
    'p2-sq': { pageId: 'p2', name: 'Square', width: 120, height: 120, x: 0, y: 0, fills: [], order: 'a0' },
    'p2-story': { pageId: 'p2', name: 'Story 9:16', width: 90, height: 160, x: 320, y: 0, fills: [], order: 'a1' },
  },
  nodes: {
    box: { ...box, parentId: 'p1-sq', link: 'box' },
    'story-box': { ...box, parentId: 'p1-story', link: 'box' },
    title: { ...title, parentId: 'p2-sq', link: 'title' },
    'story-title': { ...title, parentId: 'p2-story', link: 'title' },
  },
}

const pixelAt = (encoded: Uint8Array, x: number, y: number) => {
  const image = ck.MakeImageFromEncoded(encoded)
  if (!image) throw new Error('could not decode')
  const px = image.readPixels(x, y, {
    width: 1,
    height: 1,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB,
  })
  const size = [image.width(), image.height()]
  image.delete()
  return { px: [...(px as Uint8Array)], size }
}

describe('exportDesign', () => {
  it('one frame is one PNG, named after the frame, with its transparency', () => {
    const file = exportDesign(ck, design, { frameIds: ['p1-sq'], type: 'png' }, bytes)
    expect(file.name).toBe('Square.png')
    expect(file.type).toBe('image/png')
    const { px, size } = pixelAt(file.bytes, 100, 100)
    expect(size).toEqual([120, 120])
    expect(px[0]).toBe(255)
    expect(Math.abs((px[3] ?? 0) - 128)).toBeLessThanOrEqual(1)
    const named = exportDesign(
      ck,
      design,
      { frameIds: ['p1-sq'], type: 'png', name: '{design} - {page} - {frame}' },
      bytes,
    )
    expect(named.name).toBe('Summer- sale - Hero - Square.png')
    expect(named.bytes).toEqual(file.bytes)
  })

  it('a JPG is drawn over white, at the quality asked for', () => {
    const low = exportDesign(ck, design, { frameIds: ['p1-sq'], type: 'jpg', quality: 20 }, bytes)
    const high = exportDesign(ck, design, { frameIds: ['p1-sq'], type: 'jpg', quality: 95 }, bytes)
    expect(high.name).toBe('Square.jpg')
    expect(high.type).toBe('image/jpeg')
    expect(low.bytes.length).toBeLessThan(high.bytes.length)
    // Half red over white is pink.
    const [r = 0, g = 0, b = 0] = pixelAt(high.bytes, 100, 100).px
    expect(r).toBeGreaterThan(245)
    expect(Math.abs(g - 127)).toBeLessThanOrEqual(4)
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(4)
  })

  it('several frames are one flat zip, in the order asked for, a name taken in any case numbered', () => {
    const seen: number[] = []
    const shouted = { ...design, frames: { ...design.frames, 'p2-sq': { ...design.frames['p2-sq'], name: 'SQUARE' } } }
    const file = exportDesign(
      ck,
      shouted,
      { frameIds: ['p1-sq', 'p2-sq', 'p1-story', 'p2-story'], type: 'png' },
      bytes,
      undefined,
      (done) => seen.push(done),
    )
    expect(file).toMatchObject({ name: 'Summer- sale.zip', type: 'application/zip' })
    expect(seen).toEqual([1, 2, 3, 4])
    const entries = readZip(file.bytes)
    expect(entries.map((e) => e.path)).toEqual(['Square.png', 'SQUARE 2.png', 'Story 9-16.png', 'Story 9-16 2.png'])
    expect(pixelAt(entries[2]?.bytes ?? new Uint8Array(), 0, 0).size).toEqual([90, 160])
    // Each one is the file a single export gives.
    expect(entries[3]?.bytes).toEqual(exportDesign(ck, design, { frameIds: ['p2-story'], type: 'png' }, bytes).bytes)
    const byPage = exportDesign(ck, design, { frameIds: ['p1-sq', 'p2-sq'], type: 'png', name: '{page}' }, bytes)
    expect(readZip(byPage.bytes).map((e) => e.path)).toEqual(['Hero.png', 'Hero 2.png'])
  })

  it('the same request gives the same bytes every time', () => {
    const request = { frameIds: ['p1-sq', 'p2-sq', 'p1-story', 'p2-story'], type: 'jpg' }
    expect(exportDesign(ck, design, request, bytes).bytes).toEqual(exportDesign(ck, design, request, bytes).bytes)
  })

  it('refuses a frame the design does not have, no frames, or a bad quality', () => {
    for (const id of ['nope', 'p1', 'box'])
      expect(() => exportDesign(ck, design, { frameIds: ['p1-sq', id], type: 'png' }, bytes)).toThrow(
        `no frame "${id}"`,
      )
    expect(() => exportDesign(ck, design, { frameIds: [], type: 'png' }, bytes)).toThrow()
    expect(() => exportDesign(ck, design, { frameIds: ['p1-sq'], type: 'jpg', quality: 0 }, bytes)).toThrow()
  })
})

describe('fileName', () => {
  it('names are safe on every file system', () => {
    expect(fileName('{design}/{page}', { design: 'A:B', page: '..x', frame: 'f' })).toBe('A-B-..x')
    expect(fileName('{frame}', { design: 'd', page: 'p', frame: '   ' })).toBe('untitled')
  })

  it('fills in the design’s, page’s and frame’s names, names by the frame by default, and keeps other braces', () => {
    const values = { design: 'Cold brew', page: 'Cover', frame: 'Story' }
    expect(fileName('{design} - {page} - {frame}', values)).toBe('Cold brew - Cover - Story')
    expect(DEFAULT_EXPORT_NAME).toBe('{frame}')
    expect(fileName(DEFAULT_EXPORT_NAME, values)).toBe('Story')
    expect(fileName('{size}', values)).toBe('{size}')
  })
})

describe('zip', () => {
  it('writes a zip that unzip reads back, names in UTF-8', () => {
    const entries = [
      { path: 'Carré/a.txt', bytes: new TextEncoder().encode('hello') },
      { path: 'b.bin', bytes: new Uint8Array([0, 1, 2, 255]) },
    ]
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    writeFileSync(join(dir, 'out.zip'), zip(entries))
    execFileSync('python3', [
      '-c',
      'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
      join(dir, 'out.zip'),
      join(dir, 'x'),
    ])
    expect(readFileSync(join(dir, 'x', 'Carré', 'a.txt'), 'utf8')).toBe('hello')
    expect([...readFileSync(join(dir, 'x', 'b.bin'))]).toEqual([0, 1, 2, 255])
    expect(readZip(zip(entries))).toEqual(entries)
  })
})

describe('crc32', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})
