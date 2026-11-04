// Where the app opens (#84, ADR-0013): a workspace with one brand starts on that brand's brief; one
// with several starts on the list.
import type { BrandSummary } from '@dazbee/schema'

/** A brand's own pages, beside its home: its designs, its templates and its kit. */
export type BrandPage = 'designs' | 'templates' | 'kit'

const FROM_PANEL: Record<string, BrandPage> = { recent: 'designs', templates: 'templates', kit: 'kit' }

/** The brand to open straight away, or null to show the list. */
export function openingBrand(brands: readonly BrandSummary[]): BrandSummary | null {
  return brands.length === 1 ? (brands[0] ?? null) : null
}

/** Whether the brand list shows beside a brand's page: once there are two. */
export const showsBrandList = (brands: readonly BrandSummary[]) => brands.length > 1

/** The app opens on onboarding (#109) until the workspace has a brand. */
export const needsWelcome = (brands: readonly BrandSummary[]) => brands.length === 0

/** The page an old ?show= panel link means now, or null. */
export const brandPage = (show: string | undefined): BrandPage | null => (show ? (FROM_PANEL[show] ?? null) : null)
