// The API seam, against Postgres from Docker Compose (`docker compose up -d --wait postgres`).
import { describe, expect, it } from 'vitest'

import { BrandKit, brandVariables } from '@dazbee/schema'

import { brand, call, run, sibling, uploadImage } from '../test-api.ts'
import { png } from '../test-files.ts'

describe('brand kits (#53)', () => {
  const kit = {
    colors: [
      { token: 'primary', name: 'Harbour red', value: '#E0262BFF' },
      { token: 'ink', name: 'Ink', value: '#14213DFF' },
    ],
    fonts: [{ token: 'heading', name: 'Heading', family: 'Playfair Display' }],
    logoAssetId: null,
    voice: 'Warm, short, no jargon.',
  }

  it('starts empty, saves the whole kit and gives its tokens as variables', async () => {
    expect((await call('a', 'GET', `/brands/${sibling.id}/kit`)).json).toEqual({
      colors: [],
      fonts: [],
      logoAssetId: null,
      voice: '',
    })
    const saved = await call('a', 'PUT', `/brands/${brand.id}/kit`, kit)
    expect(saved).toEqual({ status: 200, json: kit })
    const changed = { ...kit, colors: [{ ...kit.colors[0], value: '#1F9D55FF' }] }
    await call('a', 'PUT', `/brands/${brand.id}/kit`, changed)
    const read = BrandKit.parse((await call('a', 'GET', `/brands/${brand.id}/kit`)).json)
    expect(brandVariables(read)).toEqual({ 'brand:primary': '#1F9D55FF', 'brand:heading': 'Playfair Display' })
  })

  it("takes a logo only from the brand's own assets", async () => {
    const { asset: logo } = await uploadImage('a', brand.id, png(12, 12, `${run}-logo`))
    expect((await call('a', 'PUT', `/brands/${brand.id}/kit`, { ...kit, logoAssetId: logo.id })).json).toMatchObject({
      logoAssetId: logo.id,
    })
    expect((await call('a', 'PUT', `/brands/${sibling.id}/kit`, { ...kit, logoAssetId: logo.id })).json).toEqual({
      error: 'The logo is not an asset of this brand',
    })
  })

  it('refuses a token used twice or badly named, and keeps kits to their workspace', async () => {
    expect(
      (
        await call('a', 'PUT', `/brands/${brand.id}/kit`, {
          ...kit,
          fonts: [{ token: 'primary', name: 'Body', family: 'Inter' }],
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call('a', 'PUT', `/brands/${brand.id}/kit`, {
          ...kit,
          colors: [{ token: 'Primary', name: 'P', value: '#000000FF' }],
        })
      ).status,
    ).toBe(400)
    expect(
      (await call('a', 'PUT', `/brands/${brand.id}/kit`, { ...kit, colors: [{ token: 'p', name: 'P', value: 'red' }] }))
        .status,
    ).toBe(400)
    expect((await call('b', 'GET', `/brands/${brand.id}/kit`)).status).toBe(404)
    expect((await call('b', 'PUT', `/brands/${brand.id}/kit`, kit)).status).toBe(404)
  })
})
