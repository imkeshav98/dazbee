import {
  BrandKit,
  BrandSummary,
  type DesignInput,
  DesignSummary,
  EMPTY_BRAND_KIT,
  frameIdOf,
  framesOf,
  newFramePosition,
} from '@dazbee/schema'

export const API_URL = process.env.API_URL ?? 'http://localhost:8787'
/** A brand of the development workspace the API seeds (apps/api/src/sign-in/session.ts). */
export const DEV_BRAND = 'dev-brand-coffee'

type Node = DesignInput['nodes'][string]
type FrameInput = DesignInput['frames'][string]
/** A layer as the builders take it: its link may be left out, and is then its own id. */
export type Seeded = Node extends unknown ? Omit<Node, 'link'> & { link?: string } : never

const WHITE: FrameInput['fills'] = [{ type: 'solid', color: '#FFFFFFFF' }]

/**
 * A design of one page, `p1`, holding one frame at 0, 0 (`sq`, 1080 × 1080, white and named Square
 * unless given), which holds `nodes`; each layer's link is its own id unless given.
 */
export function frameDesign({
  name,
  frameId = 'sq',
  frameName = 'Square',
  width = 1080,
  height = 1080,
  fills = WHITE,
  nodes = {},
}: {
  name: string
  frameId?: string
  frameName?: string
  width?: number
  height?: number
  fills?: FrameInput['fills']
  nodes?: Record<string, Seeded>
}): DesignInput {
  return {
    meta: { designId: 'replaced-by-the-api', name },
    pages: { p1: { name: 'Page 1', order: 'a0' } },
    frames: { [frameId]: { pageId: 'p1', name: frameName, width, height, x: 0, y: 0, fills, order: 'a0' } },
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, node]) => [id, { ...node, link: node.link ?? id } as Node]),
    ),
  }
}

/** The layers a frame holds, however deep, as `[id, layer]` pairs in the design's order. */
export const layersIn = <L extends { parentId: string }>(
  design: { frames: Record<string, unknown>; nodes: Record<string, L> },
  frameId: string,
): [string, L][] => Object.entries(design.nodes).filter(([id]) => frameIdOf(design, id) === frameId)

/** The id of a layer's linked copy in another frame, as `linkedFrames` names it. */
export const copyIn = (frameId: string, id: string) => `${frameId}-${id}`

/** A frame `linkedFrames` adds: its id, name and size, and the copies' own values, by the layer each copies. */
export interface LinkedFrame {
  id: string
  name: string
  width: number
  height: number
  values?: Record<string, Record<string, unknown>> | undefined
}

/**
 * Adds frames to a page, `p1` by default, each where the frame rule puts it (newFramePosition) with
 * the fills of the page's first frame, holding a linked copy of every layer of that frame:
 * `copyIn(frame, id)` of layer `id`, with its link, inside the copy of its parent, its props with
 * `values[id]` on top.
 */
export function linkedFrames(design: DesignInput, frames: LinkedFrame[], pageId = 'p1'): DesignInput {
  const all = { ...design.frames }
  const nodes = { ...design.nodes }
  const onPage = () => framesOf({ frames: all }, pageId)
  const [first] = onPage()
  if (!first) throw new Error(`page ${pageId} has no frame`)
  const [firstId, firstFrame] = first
  const layers = layersIn(design, firstId)
  for (const { id: frameId, name, width, height, values = {} } of frames) {
    const placed = onPage().map(([, frame]) => ({ x: frame.x, y: frame.y, width: frame.width }))
    all[frameId] = {
      pageId,
      name,
      width,
      height,
      ...newFramePosition(placed),
      fills: firstFrame.fills,
      order: `a${placed.length}`,
    }
    for (const [id, node] of layers) {
      nodes[copyIn(frameId, id)] = {
        ...node,
        parentId: node.parentId === firstId ? frameId : copyIn(frameId, node.parentId),
        props: { ...node.props, ...values[id] },
      } as Node
    }
  }
  return { ...design, frames: all, nodes }
}

/** A design for the live editing checks: shapes to drag, and English and Arabic text to type into. */
export const liveDesign = (): DesignInput =>
  frameDesign({
    name: 'Live editing',
    fills: [{ type: 'solid', color: '#FFF8F0FF' }],
    nodes: {
      box: {
        type: 'graphic',
        parentId: 'sq',
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
        parentId: 'sq',
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
        parentId: 'sq',
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
        parentId: 'sq',
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
