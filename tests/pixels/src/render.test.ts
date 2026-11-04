import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { framesOf, inOrder, parseDesign } from '@dazbee/schema'

import { loadFixtures } from './fixtures.ts'
import { comparePixels, decodePng, encodePng, fixtureResources, OUTPUT_DIR, REFERENCE_DIR } from './pixels.ts'

/** Fixtures with committed reference images. Carousel and stress have parity checks only. */
const CHECKED = [
  'arabic-ad',
  'auto-layout',
  'english-sale-ad',
  'fill-stacks',
  'frame-corners',
  'frame-strokes',
  'groups-and-frames',
  'hindi-ad',
  'image-fills',
  'layer-bounds',
  'shapes-and-booleans',
  'shapes-and-effects',
  'strokes-and-effects',
  'text-and-group-bounds',
  'text-styles',
]
/** Set to rewrite the reference images from the current renderer, after checking the output by eye. */
const UPDATE = process.env.UPDATE_REFERENCES === '1'
if (UPDATE && process.env.CI) throw new Error('UPDATE_REFERENCES rewrites the references, so CI must never set it')

const ck = await loadCanvasKit()
const resources = fixtureResources()

const cases = loadFixtures()
  .filter((f) => CHECKED.includes(f.name))
  .flatMap(({ name, json }) => {
    const parsed = parseDesign(json)
    if (!parsed.success) throw new Error(parsed.errors.join('\n'))
    const { design } = parsed
    return inOrder(design.pages).flatMap(([pageId]) =>
      framesOf(design, pageId).map(([frameId]) => ({ name, json, frameId })),
    )
  })

describe('Node CPU render', () => {
  it('covers every frame of the checked fixtures', () => {
    expect(cases.map((c) => `${c.name}/${c.frameId}`)).toEqual([
      'arabic-ad/sq',
      'auto-layout/sq',
      'english-sale-ad/sq',
      'fill-stacks/sq',
      'frame-corners/square',
      'frame-strokes/square',
      'groups-and-frames/sq',
      'hindi-ad/sq',
      'image-fills/sq',
      'layer-bounds/sq',
      'shapes-and-booleans/sq',
      'shapes-and-effects/sq',
      'strokes-and-effects/sq',
      'text-and-group-bounds/sq',
      'text-styles/pt',
    ])
  })

  it.each(cases)('$name $frameId matches its reference image', ({ name, json, frameId }) => {
    const file = `${frameId}.png`
    const reference = join(REFERENCE_DIR, name, file)
    const out = join(OUTPUT_DIR, name)
    rmSync(join(out, file.replace('.png', '.actual.png')), { force: true })
    rmSync(join(out, file.replace('.png', '.diff.png')), { force: true })

    const rendered = renderDesign(ck, json, frameId, resources)
    if (UPDATE) {
      mkdirSync(join(REFERENCE_DIR, name), { recursive: true })
      writeFileSync(reference, rendered.png)
      return
    }
    if (!existsSync(reference))
      throw new Error(`no reference image ${reference}; run with UPDATE_REFERENCES=1 and check it by eye`)

    const { differing, diff } = comparePixels(decodePng(ck, new Uint8Array(readFileSync(reference))), rendered)
    if (differing > 0) {
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, file.replace('.png', '.actual.png')), rendered.png)
      writeFileSync(join(out, file.replace('.png', '.diff.png')), encodePng(ck, diff))
    }
    expect(differing, `differing pixels; see ${out}`).toBe(0)
  })

  it('renders the same pixels twice in a row', () => {
    const [first] = cases
    if (!first) throw new Error('no cases')
    const a = renderDesign(ck, first.json, first.frameId, resources)
    const b = renderDesign(ck, first.json, first.frameId, resources)
    expect(comparePixels(a, b).differing).toBe(0)
  })
})
