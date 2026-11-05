import { type DesignInput, newFramePosition } from '@dazbee/schema'

/** The five sizes a carousel campaign typically ships in, the square first. */
const SIZES = {
  sq: { name: 'Square 1:1', width: 1080, height: 1080 },
  pt: { name: 'Portrait 4:5', width: 1080, height: 1350 },
  story: { name: 'Story 9:16', width: 1080, height: 1920 },
  land: { name: 'Landscape 1.91:1', width: 1200, height: 628 },
  mpu: { name: 'MPU 300×250', width: 300, height: 250 },
} as const

const order = (i: number) => `a${i.toString(36)}`

/**
 * A 20-card carousel in 5 sizes, for the document size and server render checks (#10): each card is
 * a page of five frames placed by the frame rule. The square frame holds a photo, a gradient band,
 * a kicker, a title, a body and a button, `p<card>-<layer>`; each other frame holds their linked
 * copies, `p<card>-<size>-<layer>`, laid out for its size as an agency carousel would be.
 */
export function bigCarousel(cards = 20): DesignInput {
  const pages: DesignInput['pages'] = {}
  const frames: DesignInput['frames'] = {}
  const nodes: DesignInput['nodes'] = {}
  for (let c = 1; c <= cards; c++) {
    const p = `p${c}`
    pages[p] = { name: `Card ${c}`, order: order(c) }
    const placed: { x: number; y: number; width: number }[] = []
    Object.entries(SIZES).forEach(([sizeId, size], i) => {
      const frame = {
        pageId: p,
        ...size,
        ...newFramePosition(placed),
        fills: [{ type: 'solid' as const, color: '#ECEFF1FF' }],
        order: order(i),
      }
      frames[`${p}-${sizeId}`] = frame
      placed.push(frame)
    })
    const text = (fontSize: number, color: string, fontWeight = 400) => ({
      fontFamily: 'Noto Sans',
      fontSize,
      color,
      fontWeight,
    })
    const layers: Record<string, DesignInput['nodes'][string]> = {
      photo: {
        type: 'graphic',
        parentId: `${p}-sq`,
        link: `${p}-photo`,
        index: 'a0',
        name: 'Photo',
        role: 'product',
        props: {
          x: 0,
          y: 0,
          width: 1080,
          height: 700,
          shape: { kind: 'rect' },
          fills: [{ type: 'image', assetId: `card-${((c - 1) % 3) + 1}`, fit: 'fill' }],
        },
      },
      band: {
        type: 'graphic',
        parentId: `${p}-sq`,
        link: `${p}-band`,
        index: 'a1',
        name: 'Band',
        props: {
          x: 0,
          y: 560,
          width: 1080,
          height: 140,
          shape: { kind: 'rect' },
          fills: [
            {
              type: 'linear',
              from: { x: 0, y: 0 },
              to: { x: 0, y: 1 },
              stops: [
                { offset: 0, color: '#26323800' },
                { offset: 1, color: '#263238CC' },
              ],
            },
          ],
        },
      },
      kicker: {
        type: 'text',
        parentId: `${p}-sq`,
        link: `${p}-kicker`,
        index: 'a2',
        name: 'Kicker',
        props: {
          x: 60,
          y: 740,
          width: 960,
          height: 60,
          text: `Step ${c} of ${cards}`,
          style: text(40, '#607D8BFF', 700),
        },
      },
      title: {
        type: 'text',
        parentId: `${p}-sq`,
        link: `${p}-title`,
        index: 'a3',
        name: 'Title',
        role: 'headline',
        props: {
          x: 60,
          y: 800,
          width: 960,
          height: 100,
          text: `Card ${c}: pick what fits`,
          style: text(72, '#263238FF', 800),
        },
      },
      body: {
        type: 'text',
        parentId: `${p}-sq`,
        link: `${p}-body`,
        index: 'a4',
        name: 'Body',
        role: 'body',
        props: {
          x: 60,
          y: 910,
          width: 960,
          height: 80,
          text: 'Every size, every frame, one campaign. Swipe for more.',
          style: text(32, '#455A64FF'),
        },
      },
      cta: {
        type: 'graphic',
        parentId: `${p}-sq`,
        link: `${p}-cta`,
        index: 'a5',
        name: 'Button',
        role: 'cta',
        props: {
          x: 760,
          y: 990,
          width: 260,
          height: 64,
          shape: { kind: 'rect', cornerRadius: 32 },
          fills: [{ type: 'solid', color: '#FF5A36FF' }],
        },
      },
    }
    for (const [id, node] of Object.entries(layers)) nodes[`${p}-${id}`] = node
    for (const [sizeId, size] of Object.entries(SIZES)) {
      if (sizeId === 'sq') continue
      const sx = size.width / 1080
      const sy = size.height / 1080
      for (const [id, node] of Object.entries(layers)) {
        const { x, y, width, height } = node.props
        const props: Record<string, unknown> = {
          ...node.props,
          x: Math.round(x * sx),
          y: Math.round(y * sy),
          width: Math.round(width * sx),
          height: Math.round(height * sy),
        }
        if (id === 'title') props.style = text(Math.round(72 * Math.min(sx, sy)), '#263238FF', 800)
        if (id === 'body' && sizeId === 'mpu') props.visible = false
        nodes[`${p}-${sizeId}-${id}`] = { ...node, parentId: `${p}-${sizeId}`, props } as DesignInput['nodes'][string]
      }
    }
  }
  return { meta: { designId: 'big-carousel', name: 'Big carousel' }, pages, frames, nodes }
}
