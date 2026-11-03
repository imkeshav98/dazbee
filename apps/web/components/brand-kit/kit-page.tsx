'use client'

// The Brand kit page's form (#200): the kit's whole form, laid out wide, so a brand's colours, fonts,
// logo and voice are set before any design. A change shows in the brief's kit picker at once and is
// saved a moment later.
import { useEffect } from 'react'

import type { BrandKit } from '@dazbee/schema'

import { KitEditor, useKitSaver } from './kit-editor.tsx'
import { loadKit, useBrandKit } from './use-brand-kit.ts'

export function KitPage({
  brandId,
  kit: first,
}: {
  brandId: string
  /** The kit as the page came with it, shown until the shared copy has it. */
  kit: BrandKit
}) {
  const kit = useBrandKit(brandId, first) ?? first
  const { change, error } = useKitSaver(brandId)
  // Fetched again as the panel opens, for a change made in another tab since the page came.
  useEffect(() => {
    void loadKit(brandId)
  }, [brandId])
  return (
    <div data-testid="home-kit">
      <KitEditor brandId={brandId} kit={kit} change={change} error={error} wide />
    </div>
  )
}
