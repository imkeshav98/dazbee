import { BrandKit, BrandSummary, type DesignInput, DesignSummary, EMPTY_BRAND_KIT } from '@dazbee/schema'

export const API_URL = process.env.API_URL ?? 'http://localhost:8787'
/** A brand of the development workspace the API seeds (apps/api/src/sign-in/session.ts). */
export const DEV_BRAND = 'dev-brand-coffee'

/** A design for the live editing checks: shapes to drag, and English and Arabic text to type into. */
export const liveDesign = (): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Live editing',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 80,
        y: 80,
        width: 300,
        height: 200,
        shape: { kind: 'rect', cornerRadius: 24 },
        fills: [{ type: 'solid', color: '#FF5A36FF' }],
      },
    },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Dot',
      props: {
        x: 700,
        y: 120,
        width: 240,
        height: 240,
        shape: { kind: 'ellipse' },
        fills: [{ type: 'solid', color: '#2F6BFFFF' }],
      },
    },
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a2',
      name: 'Headline',
      role: 'headline',
      props: {
        x: 80,
        y: 480,
        width: 920,
        height: 120,
        text: 'Summer sale',
        style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 800, color: '#111111FF' },
      },
    },
    arabic: {
      type: 'text',
      parentId: 'p1',
      index: 'a3',
      name: 'Arabic',
      role: 'body',
      props: {
        x: 80,
        y: 680,
        width: 920,
        height: 100,
        text: 'تخفيضات الصيف',
        style: { fontFamily: 'Noto Naskh Arabic', fontSize: 64, color: '#1B5E20FF' },
      },
    },
  },
  overrides: {},
})

/** Which brand a helper works in; the development brand when none is given. */
export interface InBrand {
  brandId?: string
}

/** Sends a request to the API, with `body` as JSON when given, and returns the JSON it answers; throws when it refuses. */
export async function callApi(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(
    `${API_URL}${path}`,
    body === undefined
      ? { method }
      : {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  ).catch(() => {
    throw new Error(`no API at ${API_URL}; run docker compose up -d --wait`)
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`the API refused ${method} ${path}: ${response.status} ${text}`)
  return JSON.parse(text) as unknown
}

/** Creates a design for a brand through the API, starting from `content`, and returns its id. */
export async function seed(
  content: DesignInput,
  { name = content.meta.name, brandId = DEV_BRAND }: InBrand & { name?: string } = {},
): Promise<string> {
  return DesignSummary.parse(await callApi('POST', `/brands/${brandId}/designs`, { name, content })).id
}

/**
 * Creates a brand in the development workspace through the API and returns its id: a brand of its
 * own for a spec that writes a brand kit or reads Recent in order, so no spec running alongside
 * changes its kit or puts designs before its own. Its kit starts empty.
 */
export async function newBrand(name: string): Promise<string> {
  return BrandSummary.parse(await callApi('POST', '/brands', { name })).id
}

/** A brand's kit as the API has it now. */
export async function getKit(brandId: string): Promise<BrandKit> {
  return BrandKit.parse(await callApi('GET', `/brands/${brandId}/kit`))
}

/** Saves a brand's whole kit through the API: the parts given, the rest empty. */
export async function putKit(brandId: string, kit: Partial<BrandKit>): Promise<BrandKit> {
  return BrandKit.parse(await callApi('PUT', `/brands/${brandId}/kit`, { ...EMPTY_BRAND_KIT, ...kit }))
}
