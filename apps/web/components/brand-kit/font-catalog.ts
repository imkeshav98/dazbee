'use client'

import { useCallback, useEffect, useState } from 'react'

import { FONT_FACES } from '@dazbee/fonts'
import { FontFamily } from '@dazbee/schema'

/** The fonts we ship, as catalog families; they have no stored preview. */
const SHIPPED: FontFamily[] = [...new Set(FONT_FACES.map((f) => f.family))].map((family) => ({
  family,
  source: 'builtin',
  category: null,
  faces: FONT_FACES.filter((f) => f.family === family).map((f) => ({
    id: `builtin-${f.file.replace(/\.\w+$/, '')}`,
    family,
    weight: f.weight,
    style: f.style,
    source: 'builtin',
    byteSize: 1,
  })),
}))

/** The brand's catalog, with the shipped fonts last; `refresh` fetches it again after an upload. */
export function useFontCatalog(brandId: string) {
  const [catalog, setCatalog] = useState<FontFamily[]>(SHIPPED)
  const refresh = useCallback(async () => {
    // Offline, the list keeps what it had; it is fetched again each time it opens.
    const response = await fetch(`/brands/${encodeURIComponent(brandId)}/fonts`).catch(() => null)
    if (!response?.ok) return
    const families = FontFamily.array().parse(await response.json())
    // A brand's upload of a shipped family's name is the one it sees.
    setCatalog([...families, ...SHIPPED.filter((s) => !families.some((f) => f.family === s.family))])
  }, [brandId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { catalog, refresh }
}

/** The face that previews a family: upright and nearest Regular. */
export const previewFace = (family: FontFamily) =>
  [...family.faces].sort((a, b) =>
    a.style === b.style ? Math.abs(a.weight - 400) - Math.abs(b.weight - 400) : a.style === 'normal' ? -1 : 1,
  )[0]

/** The family's upright weights, or every weight when it has no upright face. */
export const weightsOf = (family: FontFamily | undefined) => {
  const upright = family?.faces.filter((f) => f.style === 'normal') ?? []
  return [...new Set((upright.length > 0 ? upright : (family?.faces ?? [])).map((f) => f.weight))].sort((a, b) => a - b)
}

/** The weight a family is set in: the one it had when the family has it, otherwise the nearest. */
export const nearest = (weights: number[], wanted: number) =>
  weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), weights[0] ?? wanted)
