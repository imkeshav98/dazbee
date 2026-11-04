// Every control in the editor's panels (#235), one test per row of the inventory, in Chromium with
// real input. Each control is used and the design checked: the document holds the change, the
// export draws it, one undo takes it back and redo brings it again, and it is there after a reload.
// The panel redesign runs the same list, so a control that goes missing fails here. Rows 64 to 68
// (snap and rulers, the layers, assets and brand panels, export) are checked by their own specs:
// snapping, layers, assets with image-into-shape, brand-kit and export. Rows known to fail have
// their bug in KNOWN; such a test is expected to fail, and passes once the bug is fixed.
import { type DesignInput, inOrder } from '@dazbee/schema'

import { photo, righteous, tile, upload } from '../../support/assets.ts'
import { designOf, openTabs, placed, reloads, settle, writeOutput } from '../../support/editor.ts'
import { choose, enter } from '../../support/fields.ts'
import { importGoogleFonts } from '../../support/fonts.ts'
import { newBrand, putKit } from '../../support/seed.ts'
import { backgroundPanel, drag, nextFrame, openStage, perform, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import {
  barMenu,
  fillList,
  moreAction,
  moreMenu,
  moreSubmenu,
  openCard,
  pagesPanel,
  scopeMenu,
  sizesPanel,
  strokeList,
  textColourHex,
} from '../../support/top-bar.ts'

// Each row opens its own design, so CI spreads the rows over its shards.
test.describe.configure({ mode: 'parallel', timeout: 180_000 })
// A control that isn't there fails the row soon, not at the end of its time.
test.use({ actionTimeout: 15_000 })

/** Rows that fail today, with the bug filed for each. */
const KNOWN: Record<number, number> = {}

const KIT = {
  colors: [
    { token: 'berry', name: 'Berry', value: '#FF3D6EFF' },
    { token: 'roast', name: 'Roast', value: '#2A140AFF' },
  ],
  fonts: [{ token: 'body', name: 'Body', family: 'Noto Sans' }],
}

let brandId: string
let assets: { photo: string; tile: string }
test.beforeAll(async () => {
  brandId = await newBrand('e2e panels-inventory')
  assets = { photo: (await upload(photo, { brandId })).id, tile: (await upload(tile, { brandId })).id }
  await putKit(brandId, KIT)
})

const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const, cornerRadius: 16 },
  fills: solid(color),
})

/** One of each kind of layer the panels have cards for, in a Square format, and a Story with `withStory`. */
const design = (withStory = false): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Panels inventory',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    ...(withStory ? { story: { name: 'Story', width: 1080, height: 1920, order: 'a1' } } : {}),
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes: {
    box: { type: 'graphic', parentId: 'p1', index: 'a0', name: 'Box', props: rect(80, 80, 300, 200, '#E0262BFF') },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Dot',
      props: { ...rect(700, 120, 240, 240, '#2F6BFFFF'), shape: { kind: 'ellipse' } },
    },
    poly: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a2',
      name: 'Hex',
      props: { ...rect(420, 80, 160, 160, '#FCA311FF'), shape: { kind: 'polygon', sides: 6, cornerRadius: 0 } },
    },
    star: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a3',
      name: 'Star',
      props: {
        ...rect(900, 400, 160, 160, '#8E44ADFF'),
        shape: { kind: 'star', points: 5, innerRadius: 0.4, cornerRadius: 0 },
      },
    },
    rule: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a4',
      name: 'Rule',
      props: {
        x: 80,
        y: 300,
        width: 300,
        height: 120,
        shape: { kind: 'line', start: 'none', end: 'none' },
        fills: [],
        strokes: [{ paint: { type: 'solid', color: '#1A1420FF' }, width: 8, align: 'center' }],
      },
    },
    photo: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a5',
      name: 'Photo',
      props: {
        x: 420,
        y: 260,
        width: 240,
        height: 180,
        shape: { kind: 'rect', cornerRadius: 0 },
        fills: [{ type: 'image', assetId: assets.photo, fit: 'fill' }],
      },
    },
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a6',
      name: 'Headline',
      props: {
        x: 80,
        y: 480,
        width: 760,
        height: 260,
        boxMode: 'fixed',
        text: 'Summer sale\nAll week long',
        style: { fontFamily: 'Noto Sans', fontSize: 72, fontWeight: 800, color: '#111111FF' },
      },
    },
    stack: {
      type: 'frame',
      parentId: 'p1',
      index: 'a7',
      name: 'Stack',
      props: {
        x: 80,
        y: 760,
        width: 600,
        height: 160,
        fills: solid('#F4EDE4FF'),
        layout: { direction: 'row', gap: 16, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
      },
    },
    chip1: {
      type: 'graphic',
      parentId: 'stack',
      index: 'a0',
      name: 'Chip 1',
      props: rect(100, 780, 120, 120, '#FCA311FF'),
    },
    chip2: {
      type: 'graphic',
      parentId: 'stack',
      index: 'a1',
      name: 'Chip 2',
      props: rect(236, 780, 120, 120, '#14213DFF'),
    },
    plain: {
      type: 'frame',
      parentId: 'p1',
      index: 'a8',
      name: 'Plain',
      props: { x: 720, y: 760, width: 300, height: 280, fills: solid('#DDEEFFFF') },
    },
    tile1: {
      type: 'graphic',
      parentId: 'plain',
      index: 'a0',
      name: 'Tile 1',
      props: rect(740, 780, 100, 100, '#11744AFF'),
    },
    tile2: {
      type: 'graphic',
      parentId: 'plain',
      index: 'a1',
      name: 'Tile 2',
      props: rect(900, 900, 100, 100, '#C8156AFF'),
    },
  },
  overrides: {},
})

type Props = Record<string, unknown> & {
  style?: Record<string, unknown>
  fills?: Record<string, unknown>[]
  strokes?: Record<string, unknown>[]
  effects?: Record<string, unknown>[]
}
type Doc = {
  meta: { primaryFormatId: string }
  formats: Record<string, { name: string; order: string; width: number; height: number }>
  pages: Record<string, { name: string; order: string; fills: Record<string, unknown>[] }>
  nodes: Record<
    string,
    {
      type: string
      parentId: string
      index: string
      name: string
      lock?: Record<string, boolean>
      bindings?: Record<string, string>
      props: Props
    }
  >
  overrides: Record<string, Record<string, Props>>
}
const doc = async (page: Page) => JSON.parse(await designOf(page)) as Doc
/** A layer's props as the Square format shows them. */
const props = async (page: Page, id: string) => placed(await doc(page), id, 'sq') as Props
const style = async (page: Page, id: string) => (await props(page, id)).style ?? {}
const boxOf = async (page: Page, id: string) => {
  const p = await props(page, id)
  return { width: Number(p.width), height: Number(p.height) }
}
/** Makes the headline size itself to its words, as the Text box card's tiles do. */
const autoBox = async (page: Page, mode: 'autoWidth' | 'autoHeight') => {
  await (
    await openCard(page, 'text-box-card')
  )
    .getByRole('radiogroup', { name: 'Box' })
    .locator(`[data-value="${mode}"]`)
    .click()
  await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe(mode)
}
const fills = async (page: Page, id: string) => (await props(page, id)).fills ?? []
const children = async (page: Page, parentId: string) =>
  Object.entries((await doc(page)).nodes)
    .filter(([, n]) => n.parentId === parentId)
    .sort(([, a], [, b]) => (a.index < b.index ? -1 : 1))
    .map(([id]) => id)

/** SHA-256 of the Square's PNG export, which waits for every image and font it draws. */
const picture = (page: Page) =>
  page.evaluate(async () => {
    const file = await window.dazbee?.exportFiles({ pageIds: ['p1'], formatIds: ['sq'], type: 'png' })
    if (!file) throw new Error('no editor')
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(file.bytes))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  })

/**
 * Does one thing with a control and checks it: `check` sees the change, the design is no longer
 * what it was and draws differently (unless `draws` is false, for a change the picture doesn't
 * show), one undo puts back exactly what was there, and redo brings the change again.
 */
async function step(page: Page, act: () => Promise<unknown>, check: () => Promise<void>, { draws = true } = {}) {
  const before = await designOf(page)
  const drawn = draws ? await picture(page) : ''
  await act()
  await check()
  await expect.poll(() => designOf(page), { message: 'the design changed' }).not.toBe(before)
  const after = await designOf(page)
  if (draws)
    await expect.poll(() => picture(page), { message: 'the design draws differently', timeout: 20_000 }).not.toBe(drawn)
  await perform(page, 'undo')
  await expect.poll(() => designOf(page), { message: 'one undo puts it back' }).toBe(before)
  await perform(page, 'redo')
  await expect.poll(() => designOf(page), { message: 'redo brings it again' }).toBe(after)
  // The panels draw the redone design before the next control is used.
  await nextFrame(page)
}

/**
 * One row of the inventory: a test named by its number, expected to fail while its bug is open. A
 * failing row leaves a screenshot of where it stopped.
 */
function row(n: number, title: string, body: (open: (withStory?: boolean) => Promise<Page>) => Promise<void>) {
  const name = String(n).padStart(2, '0')
  test(`${name} ${title}`, async ({ browser }: { browser: Browser }) => {
    test.fail(n in KNOWN, `#${KNOWN[n]}`)
    let page: Page | undefined
    try {
      await body(async (withStory = false) => {
        page = (await openStage(browser, design(withStory), { brandId })).page
        return page
      })
    } catch (error) {
      if (page) writeOutput(`inventory-${name}.png`, await page.screenshot())
      throw error
    } finally {
      await page?.context().close()
    }
  })
}

test.describe('every selection', () => {
  row(1, 'apply changes to this format or all formats', async (open) => {
    const page = await open(true)
    await selectLayers(page, ['box'], { bar: true })
    const x = async () => (await openCard(page, 'layout-card')).getByRole('spinbutton', { name: 'X position' })
    await expect((await scopeMenu(page)).getByRole('radio', { name: 'Only Square' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('Escape')
    await step(
      page,
      async () => enter(await x(), '500'),
      async () => {
        await expect.poll(async () => (await doc(page)).overrides['format:sq']?.box?.x).toBe(500)
        expect((await doc(page)).nodes.box?.props.x).toBe(80)
      },
    )
    await (await scopeMenu(page)).getByRole('radio', { name: 'All sizes' }).click()
    await page.keyboard.press('Escape')
    await step(
      page,
      async () => enter(await x(), '200'),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.props.x).toBe(200)
        expect((await doc(page)).overrides['format:sq']?.box ?? {}).not.toHaveProperty('x')
      },
    )
    await reloads(page)
  })

  row(2, 'own changes: reset one, reset all', async (open) => {
    const page = await open(true)
    await selectLayers(page, ['box'], { bar: true })
    await enter((await openCard(page, 'layout-card')).getByRole('spinbutton', { name: 'X position' }), '200')
    await enter((await fillList(page)).getByRole('textbox', { name: 'Colour 1 hex' }), '14213d')
    const own = (await scopeMenu(page)).getByTestId('own-changes')
    await expect(own.getByRole('listitem').locator('span')).toHaveText(['Position and size', 'Fill'])
    const sq = async () => Object.keys((await doc(page)).overrides['format:sq']?.box ?? {}).sort()
    await step(
      page,
      async () => own.getByRole('button', { name: 'Reset Fill to follow the other sizes' }).click(),
      async () => {
        await expect.poll(sq).toEqual(['x'])
      },
    )
    await step(
      page,
      async () => own.getByRole('button', { name: 'Reset all' }).click(),
      async () => {
        await expect.poll(sq).toEqual([])
      },
    )
    await reloads(page)
  })

  row(3, 'X, Y, W, H', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = async () => await openCard(page, 'layout-card')
    for (const [name, key, value] of [
      ['X position', 'x', 140],
      ['Y position', 'y', 120],
      ['Width', 'width', 320],
      ['Height', 'height', 220],
    ] as const) {
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name }), String(value)),
        async () => {
          await expect.poll(async () => (await props(page, 'box'))[key]).toBe(value)
        },
      )
    }
    await reloads(page)
  })

  row(4, 'rotation', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () => enter((await moreMenu(page)).getByRole('spinbutton', { name: 'Rotation in degrees' }), '15'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).rotation).toBe(15)
      },
    )
    await reloads(page)
  })

  row(5, 'opacity', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () => enter((await openCard(page, 'appearance-card')).getByRole('spinbutton', { name: 'Opacity' }), '50'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).opacity).toBe(0.5)
      },
    )
    await reloads(page)
  })

  row(6, 'blend mode, pass-through for groups and frames', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const blend = async () => (await openCard(page, 'appearance-card')).getByRole('combobox', { name: 'Blend mode' })
    await step(
      page,
      async () => choose(await blend(), 'difference'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).blendMode).toBe('difference')
      },
    )
    await (await blend()).click()
    await expect(page.locator('[role="listbox"] [role="option"]')).toHaveCount(16)
    await page.keyboard.press('Escape')
    // A frame starts as pass-through, which only groups and frames are offered.
    await selectLayers(page, ['stack'], { bar: true })
    await expect(await blend()).toHaveAttribute('data-value', 'pass-through')
    await (await blend()).click()
    await expect(page.locator('[role="listbox"] [role="option"]')).toHaveCount(17)
    await page.keyboard.press('Escape')
    // Over a white page, the stack draws the same blended as a whole or layer by layer.
    await step(
      page,
      async () => choose(await blend(), 'normal'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).blendMode).toBe('normal')
      },
      { draws: false },
    )
    await step(
      page,
      async () => choose(await blend(), 'pass-through'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).blendMode).toBe('pass-through')
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(7, 'mixed values on a multi-selection', async (open) => {
    const page = await open()
    await selectLayers(page, ['box', 'dot'], { bar: true })
    const x = async () => (await openCard(page, 'layout-card')).getByRole('spinbutton', { name: 'X position' })
    await expect(await x()).toHaveValue('')
    await expect(await x()).toHaveAttribute('placeholder', 'Mixed')
    await expect(await fillList(page)).toContainText('The selected layers differ.')
    await step(
      page,
      async () => (await x()).press('ArrowUp'),
      async () => {
        await expect.poll(async () => [(await props(page, 'box')).x, (await props(page, 'dot')).x]).toEqual([81, 701])
      },
    )
    await step(
      page,
      async () => (await fillList(page)).getByRole('button', { name: 'Use one for all' }).click(),
      async () => {
        await expect
          .poll(async () => [await fills(page, 'box'), await fills(page, 'dot')])
          .toEqual([solid('#D9D9D9FF'), solid('#D9D9D9FF')])
      },
    )
    await reloads(page)
  })

  row(8, 'effect tiles: none, shadow, glow, blur, outline', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const tiles = await barMenu(page, 'effects')
    const types = async () => ((await props(page, 'box')).effects ?? []).map((e) => e.type)
    await step(
      page,
      async () => tiles.locator('[data-tile="dropShadow"]').click(),
      async () => {
        await expect.poll(types).toEqual(['dropShadow'])
      },
    )
    await step(
      page,
      async () => tiles.locator('[data-tile="glow"]').click(),
      async () => {
        await expect.poll(types).toEqual(['dropShadow', 'glow'])
      },
    )
    await step(
      page,
      async () => tiles.locator('[data-tile="layerBlur"]').click(),
      async () => {
        await expect.poll(types).toEqual(['dropShadow', 'glow', 'layerBlur'])
      },
    )
    await step(
      page,
      async () => tiles.locator('[data-tile="none"]').click(),
      async () => {
        await expect.poll(types).toEqual([])
      },
    )
    // Text has its tiles in the bar's Effects.
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => (await barMenu(page, 'effects')).locator('[data-tile="outline"]').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toMatchObject({ width: 2 })
      },
    )
    await reloads(page)
  })

  row(9, 'add effect: drop shadow, inner shadow, glow, layer blur, background blur', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await barMenu(page, 'effects')
    const added: string[] = []
    for (const type of ['dropShadow', 'innerShadow', 'glow', 'layerBlur', 'backgroundBlur']) {
      added.push(type)
      const want = [...added]
      // A background blur blurs what is behind the box: the white page, which looks the same.
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), type),
        async () => {
          await expect.poll(async () => ((await props(page, 'box')).effects ?? []).map((e) => e.type)).toEqual(want)
        },
        { draws: type !== 'backgroundBlur' },
      )
    }
    await reloads(page)
  })

  row(10, 'each effect: X, Y, blur, spread, radius, colour, remove, several', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await barMenu(page, 'effects')
    const effects = async () => (await props(page, 'box')).effects ?? []
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'dropShadow')
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'dropShadow')
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'glow')
    await choose(card.getByRole('combobox', { name: /^Add (effect|another)$/ }), 'layerBlur')
    await expect.poll(async () => (await effects()).length).toBe(4)
    for (const [field, key, value] of [
      ['X', 'x', 30],
      ['Y', 'y', -20],
      ['Blur', 'blur', 40],
      ['Spread', 'spread', 12],
    ] as const) {
      await step(
        page,
        async () => enter(card.getByRole('spinbutton', { name: `Drop shadow 1 ${field}` }), String(value)),
        async () => {
          await expect.poll(async () => (await effects())[0]?.[key]).toBe(value)
        },
      )
    }
    // The second shadow has its own numbers and colour.
    const second = card.locator('[data-item="effects-1"]')
    await step(
      page,
      async () => enter(second.getByRole('spinbutton', { name: 'Drop shadow 2 Blur' }), '8'),
      async () => {
        await expect.poll(async () => (await effects())[1]?.blur).toBe(8)
      },
    )
    await step(
      page,
      async () => enter(second.getByRole('textbox', { name: /hex$/ }), '2f6bff'),
      async () => {
        await expect.poll(async () => String((await effects())[1]?.color)).toMatch(/^#2F6BFF/)
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Glow 3 Spread' }), '10'),
      async () => {
        await expect.poll(async () => (await effects())[2]?.spread).toBe(10)
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Layer blur 4 Radius' }), '6'),
      async () => {
        await expect.poll(async () => (await effects())[3]?.radius).toBe(6)
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Remove drop shadow 1' }).click(),
      async () => {
        await expect.poll(async () => (await effects()).map((e) => e.type)).toEqual(['dropShadow', 'glow', 'layerBlur'])
      },
    )
    await reloads(page)
  })

  row(11, 'arrange: duplicate, order, group, ungroup, frame selection, use as mask', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    // Several layers group from the small menu and go in a box from the full menu.
    const small = page.getByTestId('small-menu')
    // One layer's actions are in the full menu.
    const more = (name: string) => moreAction(page, name)
    await step(
      page,
      async () => more('Duplicate'),
      async () => {
        await expect.poll(async () => (await children(page, 'p1')).length).toBe(10)
      },
    )
    await perform(page, 'undo')
    await selectLayers(page, ['box'], { bar: true })
    // The box overlaps nothing, so its place in the order changes only the document.
    const at = async () => (await children(page, 'p1')).indexOf('box')
    await step(
      page,
      async () => more('Bring to front'),
      async () => {
        await expect.poll(at).toBe(8)
      },
      { draws: false },
    )
    await step(
      page,
      async () => more('Send backward'),
      async () => {
        await expect.poll(at).toBe(7)
      },
      { draws: false },
    )
    await step(
      page,
      async () => more('Send to back'),
      async () => {
        await expect.poll(at).toBe(0)
      },
      { draws: false },
    )
    await step(
      page,
      async () => more('Bring forward'),
      async () => {
        await expect.poll(at).toBe(1)
      },
      { draws: false },
    )
    await step(
      page,
      async () => more('Use as mask'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).mask).toBe('alpha')
      },
    )
    await perform(page, 'undo')
    await selectLayers(page, ['box', 'poly'], { bar: true })
    await step(
      page,
      async () => small.getByTestId('small-group').click(),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.parentId).not.toBe('p1')
      },
      { draws: false },
    )
    const group = (await doc(page)).nodes.box?.parentId ?? ''
    await selectLayers(page, [group], { bar: true })
    await step(
      page,
      async () => more('Ungroup'),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.parentId).toBe('p1')
      },
      { draws: false },
    )
    await selectLayers(page, ['box', 'poly'], { bar: true })
    await step(
      page,
      async () => more('Put in a box'),
      async () => {
        await expect
          .poll(async () => {
            const d = await doc(page)
            return d.nodes[d.nodes.box?.parentId ?? '']?.type
          })
          .toBe('frame')
      },
      { draws: false },
    )
    await reloads(page)
  })
})

test.describe('text', () => {
  row(12, 'font: search, Google Fonts, built in, brand fonts, upload', async (open) => {
    importGoogleFonts(['Playfair Display'])
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const family = async () => (await style(page, 'headline')).fontFamily
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page.getByTestId('font-search').fill('playf')
        await page.getByTestId('font-search').press('Enter')
      },
      async () => {
        await expect.poll(family).toBe('Playfair Display')
      },
    )
    // A family under Google Fonts picked with the mouse.
    await perform(page, 'undo')
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page
          .getByRole('listbox', { name: 'Font' })
          .getByRole('group', { name: 'Google Fonts' })
          .getByRole('option', { name: 'Playfair Display' })
          .click()
      },
      async () => {
        await expect.poll(family).toBe('Playfair Display')
      },
    )
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page.getByTestId('font-search').fill('')
        await page
          .getByRole('listbox', { name: 'Font' })
          .getByRole('group', { name: 'Built in' })
          .getByRole('option', { name: 'Noto Sans', exact: true })
          .click()
      },
      async () => {
        await expect.poll(family).toBe('Noto Sans')
      },
    )
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page
          .getByTestId('font-upload')
          .setInputFiles({ name: 'Righteous-Regular.ttf', mimeType: 'font/ttf', buffer: Buffer.from(righteous) })
      },
      async () => {
        await expect.poll(family).toBe('Righteous')
      },
    )
    await perform(page, 'undo')
    await step(
      page,
      async () => {
        await barMenu(page, 'font')
        await page.getByTestId('font-search').fill('')
        await page
          .getByRole('listbox', { name: 'Font' })
          .getByRole('group', { name: 'Brand fonts' })
          .getByRole('option', { name: 'Righteous' })
          .click()
      },
      async () => {
        await expect.poll(family).toBe('Righteous')
      },
    )
    await reloads(page)
  })

  row(13, 'weight', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    // The family's lightest and heaviest weights, and back to regular.
    const weight = async () => (await barMenu(page, 'font')).getByTestId('font-weight')
    const field = await weight()
    await field.click()
    const offered = await page
      .locator('[role="listbox"] [role="option"][data-value]')
      .evaluateAll((options) => options.map((o) => Number(o.getAttribute('data-value'))))
    await page.keyboard.press('Escape')
    expect(offered.length).toBeGreaterThan(2)
    // The box sizes itself to its words, so each weight gives it a width of its own.
    await autoBox(page, 'autoWidth')
    for (const to of [offered[0] ?? 400, offered.at(-1) ?? 400, 400]) {
      const was = (await boxOf(page, 'headline')).width
      await step(
        page,
        async () => choose(await weight(), String(to)),
        async () => {
          await expect.poll(async () => (await style(page, 'headline')).fontWeight).toBe(to)
          await expect.poll(async () => (await boxOf(page, 'headline')).width).not.toBe(was)
        },
      )
    }
    await reloads(page)
  })

  row(14, 'size', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const size = async () => page.getByTestId('bar-size-field')
    await step(
      page,
      async () => enter(await size(), '64'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontSize).toBe(64)
      },
    )
    await step(
      page,
      async () => enter(await size(), '90'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontSize).toBe(90)
      },
    )
    // A box that grows with its words follows the size.
    await autoBox(page, 'autoHeight')
    const tall = (await boxOf(page, 'headline')).height
    await step(
      page,
      async () => enter(await size(), '140'),
      async () => {
        await expect.poll(async () => (await boxOf(page, 'headline')).height).toBeGreaterThan(tall)
      },
    )
    await reloads(page)
  })

  row(15, 'text colour: brand colours and hex', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () =>
        (await barMenu(page, 'colour'))
          .getByRole('group', { name: 'Brand colours' })
          .getByRole('button', { name: 'Berry' })
          .click(),
      async () => {
        await expect
          .poll(async () => (await doc(page)).nodes.headline?.bindings)
          .toMatchObject({ textColor: 'brand:berry' })
      },
    )
    await step(
      page,
      async () => enter(await textColourHex(page), '1f9d55'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).color).toBe('#1F9D55FF')
      },
    )
    await reloads(page)
  })

  row(16, 'line height, and back to Auto', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const field = async () => (await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Line height' })
    await step(
      page,
      async () => enter(await field(), '1.6'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBe(1.6)
      },
    )
    await step(
      page,
      async () => enter(await field(), ''),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBeUndefined()
      },
    )
    await expect(await field()).toHaveValue('')
    await expect(await field()).toHaveAttribute('placeholder', 'Auto')
    // Leaving an emptied field does the same, once 1.4 is in the document and the field shows it.
    await enter(await field(), '1.4')
    await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBe(1.4)
    await expect(await field()).toHaveValue('1.4')
    await step(
      page,
      async () => {
        await (await field()).fill('')
        await (await field()).press('Tab')
      },
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBeUndefined()
      },
    )
    // Two texts, one at 1.6 and its copy at Auto: emptied, both are Auto.
    await enter(await field(), '1.6')
    await expect.poll(async () => (await style(page, 'headline')).lineHeight).toBe(1.6)
    await moreAction(page, 'Duplicate')
    const copy = (await page.evaluate(() => window.dazbee?.selection() ?? []))[0] ?? ''
    await selectLayers(page, [copy], { bar: true })
    await expect(await field()).toHaveValue('1.6')
    await enter(await field(), '')
    await selectLayers(page, ['headline', copy], { bar: true })
    await expect(await field()).toHaveAttribute('placeholder', 'Mixed')
    await (await field()).press('Enter')
    expect((await style(page, 'headline')).lineHeight).toBe(1.6)
    await step(
      page,
      async () => {
        await (await field()).fill('1')
        await (await field()).fill('')
        await (await field()).press('Enter')
      },
      async () => {
        await expect
          .poll(async () => [(await style(page, 'headline')).lineHeight, (await style(page, copy)).lineHeight])
          .toEqual([undefined, undefined])
      },
    )
    await selectLayers(page, ['headline'], { bar: true })
    // A field with no unset value keeps its number when emptied.
    const before = await designOf(page)
    const spacing = async () =>
      (await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Letter spacing' })
    await enter(await spacing(), '')
    await expect(await spacing()).toHaveValue('0')
    expect(await designOf(page)).toBe(before)
    await reloads(page)
  })

  row(17, 'letter spacing', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () =>
        enter((await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Letter spacing' }), '4'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).letterSpacing).toBe(4)
      },
    )
    // A box as wide as its words widens with them.
    await autoBox(page, 'autoWidth')
    const wide = (await boxOf(page, 'headline')).width
    await step(
      page,
      async () =>
        enter((await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Letter spacing' }), '20'),
      async () => {
        await expect.poll(async () => (await boxOf(page, 'headline')).width).toBeGreaterThan(wide)
      },
    )
    await reloads(page)
  })

  row(18, 'paragraph spacing', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () =>
        enter((await openCard(page, 'spacing-card')).getByRole('spinbutton', { name: 'Paragraph spacing' }), '24'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).paragraphSpacing).toBe(24)
      },
    )
    await reloads(page)
  })

  row(19, 'alignment: start, centre, end, justify', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const pick = async (align: string) =>
      (await barMenu(page, 'align'))
        .getByRole('radiogroup', { name: 'Alignment', exact: true })
        .locator(`[data-value="${align}"]`)
        .click()
    // Each line is a paragraph's last, which justify leaves at the start: those two draw alike.
    for (const align of ['center', 'end', 'justify', 'start']) {
      await step(
        page,
        async () => pick(align),
        async () => {
          await expect.poll(async () => (await props(page, 'headline')).align).toBe(align)
        },
        { draws: align === 'center' || align === 'end' },
      )
    }
    await reloads(page)
  })

  row(20, 'vertical alignment: top, middle, bottom', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    // Up and down in the box is in the bar's Align, under the alignment.
    const pick = async (to: string) =>
      (await barMenu(page, 'align'))
        .getByRole('radiogroup', { name: 'Up and down in the box' })
        .locator(`[data-value="${to}"]`)
        .click()
    for (const align of ['bottom', 'middle', 'top']) {
      await step(
        page,
        async () => pick(align),
        async () => {
          await expect.poll(async () => (await props(page, 'headline')).verticalAlign).toBe(align)
        },
      )
    }
    await reloads(page)
  })

  row(21, 'case: as typed, upper, lower, title', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const pick = async (textCase: string) =>
      (await barMenu(page, 'case'))
        .getByRole('radiogroup', { name: 'Case' })
        .locator(`[data-value="${textCase}"]`)
        .click()
    for (const textCase of ['upper', 'lower', 'title', 'none']) {
      await step(
        page,
        async () => pick(textCase),
        async () => {
          await expect.poll(async () => (await style(page, 'headline')).textCase ?? 'none').toBe(textCase)
        },
      )
    }
    await reloads(page)
  })

  row(22, 'underline, strikethrough', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const toggle = async (name: string) =>
      page.getByTestId('top-bar').getByRole('button', { name, exact: true }).click()
    await step(
      page,
      async () => toggle('Underline'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).underline).toBe(true)
      },
    )
    await step(
      page,
      async () => toggle('Strikethrough'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).strikethrough).toBe(true)
      },
    )
    await reloads(page)
  })

  row(23, 'list: none, bullets, numbers', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const pick = async (list: string) =>
      (await barMenu(page, 'list')).getByRole('radiogroup', { name: 'List' }).locator(`[data-value="${list}"]`).click()
    for (const list of ['bullet', 'number', 'none']) {
      await step(
        page,
        async () => pick(list),
        async () => {
          await expect.poll(async () => (await props(page, 'headline')).list ?? 'none').toBe(list)
        },
      )
    }
    await reloads(page)
  })

  row(24, 'outline on and off, width', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const effects = () => barMenu(page, 'effects')
    await step(
      page,
      async () => (await effects()).locator('[data-tile="outline"]').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toBeTruthy()
      },
    )
    await step(
      page,
      async () => enter((await effects()).getByRole('spinbutton', { name: 'Outline width' }), '6'),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toMatchObject({ width: 6 })
      },
    )
    await step(
      page,
      async () => (await effects()).locator('[data-tile="outline"]').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).outline).toBeFalsy()
      },
    )
    await reloads(page)
  })

  row(25, 'box mode: auto width, auto height, fixed', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const box = async () => (await openCard(page, 'text-box-card')).getByRole('radiogroup', { name: 'Box' })
    const size = async () => {
      const p = await props(page, 'headline')
      return [p.width, p.height]
    }
    // The lines start at the box's start and top in every mode, so the picture stays the same.
    await step(
      page,
      async () => (await box()).locator('[data-value="autoWidth"]').click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe('autoWidth')
        await expect.poll(async () => (await size())[0]).toBeLessThan(760)
      },
      { draws: false },
    )
    await step(
      page,
      async () => (await box()).locator('[data-value="autoHeight"]').click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe('autoHeight')
        await expect.poll(async () => (await size())[1]).toBeLessThan(260)
      },
      { draws: false },
    )
    const kept = await size()
    await step(
      page,
      async () => (await box()).locator('[data-value="fixed"]').click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).boxMode).toBe('fixed')
        expect(await size()).toEqual(kept)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(26, 'shrink to fit, smallest and largest size', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    const card = async () => await openCard(page, 'text-fit-card')
    // The text fits its box at 72 already, so turning it on changes nothing drawn.
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Shrink to fit' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).shrinkToFit).toBeTruthy()
      },
      { draws: false },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Largest size' }), '200'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).shrinkToFit).toMatchObject({ max: 200 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Smallest size' }), '120'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).shrinkToFit).toMatchObject({ min: 120, max: 200 })
      },
    )
    await reloads(page)
  })

  row(27, 'lines at most', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => enter((await openCard(page, 'text-fit-card')).getByRole('spinbutton', { name: 'Max lines' }), '1'),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).maxLines).toBe(1)
      },
    )
    await reloads(page)
  })
})

test.describe('shapes and frames', () => {
  row(29, 'fill swatches and brand colours', async (open) => {
    const page = await open()
    await selectLayers(page, ['dot'], { bar: true })
    await step(
      page,
      async () =>
        (await barMenu(page, 'colour'))
          .getByRole('group', { name: 'Brand colours' })
          .getByRole('button', { name: 'Roast' })
          .click(),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.dot?.bindings).toMatchObject({ fill: 'brand:roast' })
      },
    )
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () =>
        (await barMenu(page, 'colour'))
          .getByRole('group', { name: 'Brand colours' })
          .getByRole('button', { name: 'Berry' })
          .click(),
      async () => {
        await expect.poll(async () => (await doc(page)).nodes.box?.bindings).toMatchObject({ fill: 'brand:berry' })
      },
    )
    await reloads(page)
  })

  row(30, 'fill list: add, remove, reorder, hide and show', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await fillList(page)
    await step(
      page,
      async () => card.getByRole('button', { name: 'Add fill' }).click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box')).length).toBe(2)
      },
    )
    // Top first: the new fill is the first row; moving it down puts it under the red.
    await expect(card.locator('[data-row]')).toHaveCount(2)
    await enter(card.getByRole('textbox', { name: 'Colour 1 hex' }), '2f6bff')
    await expect.poll(async () => (await fills(page, 'box'))[1]?.color).toBe('#2F6BFF33')
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('row-grip').press('ArrowDown'),
      async () => {
        await expect
          .poll(async () => (await fills(page, 'box')).map((f) => f.color))
          .toEqual(['#2F6BFF33', '#E0262BFF'])
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('paint-visible').click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[1]?.visible).toBe(false)
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('paint-visible').click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[1]?.visible ?? true).toBe(true)
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Remove fill 1' }).click(),
      async () => {
        await expect.poll(async () => (await fills(page, 'box')).map((f) => f.color)).toEqual(['#2F6BFF33'])
      },
    )
    await reloads(page)
  })

  row(31, 'paint kind: solid, linear, radial, angular, image', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await (await fillList(page)).locator('[data-row="1"]').getByTestId('paint-swatch').click()
    const editor = page.getByTestId('paint-editor')
    for (const [name, type] of [
      ['Line gradient', 'linear'],
      ['Circle gradient', 'radial'],
      ['Sweep gradient', 'angular'],
      ['Solid', 'solid'],
    ] as const) {
      await step(
        page,
        async () => editor.getByRole('radio', { name }).click(),
        async () => {
          await expect.poll(async () => (await fills(page, 'box'))[0]?.type).toBe(type)
        },
      )
    }
    await step(
      page,
      async () => {
        await editor.getByTestId('paint-image').click()
        await page.getByTestId('paint-image-picker').locator(`li[data-asset="${assets.tile}"] button`).click()
      },
      async () => {
        await expect
          .poll(async () => (await fills(page, 'box'))[0])
          .toMatchObject({ type: 'image', assetId: assets.tile })
      },
    )
    await reloads(page)
  })

  row(32, 'gradient stops, angle, centre and size', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await (await fillList(page)).locator('[data-row="1"]').getByTestId('paint-swatch').click()
    const editor = page.getByTestId('paint-editor')
    await editor.getByRole('radio', { name: 'Line gradient' }).click()
    const stops = async () => ((await fills(page, 'box'))[0]?.stops ?? []) as { offset: number; color: string }[]
    await expect.poll(async () => (await stops()).length).toBe(2)
    const bar = editor.getByTestId('gradient-bar')
    const box = await bar.boundingBox()
    await step(
      page,
      async () => page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * 0.5, (box?.y ?? 0) + (box?.height ?? 0) / 2),
      async () => {
        await expect.poll(async () => (await stops()).length).toBe(3)
      },
    )
    const offset = async () => (await stops()).map((s) => s.offset).sort()[1]
    const was = await offset()
    await step(
      page,
      async () => editor.locator('[data-stop="1"]').press('ArrowRight'),
      async () => {
        await expect.poll(offset).not.toBe(was)
      },
    )
    await step(
      page,
      async () => enter(editor.getByRole('textbox', { name: 'Stop 2 hex' }), '00a889'),
      async () => {
        await expect.poll(async () => (await stops()).some((s) => s.color.startsWith('#00A889'))).toBe(true)
      },
    )
    await step(
      page,
      async () => editor.getByRole('button', { name: 'Remove this stop' }).click(),
      async () => {
        await expect.poll(async () => (await stops()).length).toBe(2)
      },
    )
    const ends = async () => {
      const paint = (await fills(page, 'box'))[0]
      return JSON.stringify([paint?.from, paint?.to])
    }
    const along = await ends()
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient angle' }), '45'),
      async () => {
        await expect.poll(ends).not.toBe(along)
      },
    )
    await editor.getByRole('radio', { name: 'Circle gradient' }).click()
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient centre across' }), '20'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.center).toMatchObject({ x: 0.2 })
      },
    )
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient centre down' }), '70'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.center).toMatchObject({ x: 0.2, y: 0.7 })
      },
    )
    await step(
      page,
      async () => enter(editor.getByRole('spinbutton', { name: 'Gradient size' }), '30'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.radius).toBe(0.3)
      },
    )
    await reloads(page)
  })

  row(33, 'colour hex and opacity of each paint', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await fillList(page)
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Colour 1 hex' }), '00a889'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.color).toBe('#00A889FF')
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Colour 1 opacity' }), '80'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.color).toBe('#00A889CC')
      },
    )
    await card.locator('[data-row="1"]').getByTestId('paint-swatch').click()
    await page.getByTestId('paint-editor').getByRole('radio', { name: 'Line gradient' }).click()
    await page.keyboard.press('Escape')
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Colour 1 opacity' }), '50'),
      async () => {
        await expect.poll(async () => (await fills(page, 'box'))[0]?.opacity).toBe(0.5)
      },
    )
    await reloads(page)
  })

  row(34, 'add an image into a shape', async (open) => {
    const page = await open()
    await selectLayers(page, ['dot'], { bar: true })
    await step(
      page,
      async () => {
        await (await barMenu(page, 'colour')).getByTestId('add-image').click()
        await page.getByTestId('add-image-picker').locator(`li[data-asset="${assets.tile}"] button`).click()
      },
      async () => {
        await expect
          .poll(async () => (await fills(page, 'dot')).at(-1))
          .toMatchObject({ type: 'image', assetId: assets.tile, fit: 'fill' })
      },
    )
    await reloads(page)
  })

  row(35, 'stroke list: add, remove, reorder, several, on a shape and a box', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await strokeList(page)
    const strokes = async () => (await props(page, 'box')).strokes ?? []
    await step(
      page,
      async () => card.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await strokes()).length).toBe(1)
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await strokes()).length).toBe(2)
      },
    )
    // Top first: Outline 1 is the newest, drawn on top; a colour of its own shows which is on top.
    await enter(card.getByRole('spinbutton', { name: 'Outline 1 width' }), '12')
    await enter(card.getByRole('textbox', { name: 'Outline 1 colour hex' }), 'ff48b0')
    await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([2, 12])
    await step(
      page,
      async () => card.locator('[data-row="1"]').getByTestId('row-grip').press('ArrowDown'),
      async () => {
        await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([12, 2])
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="2"]').getByTestId('row-grip').dragTo(card.locator('[data-row="1"]')),
      async () => {
        await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([2, 12])
      },
    )
    await step(
      page,
      async () => card.locator('[data-row="2"]').getByTestId('row-grip').press('ArrowUp'),
      async () => {
        await expect.poll(async () => (await strokes()).map((s) => s.width)).toEqual([12, 2])
      },
    )
    await step(
      page,
      async () => card.getByRole('button', { name: 'Remove outline 1' }).click(),
      async () => {
        await expect.poll(async () => (await strokes()).length).toBe(1)
      },
    )
    // A box's stroke list works the same.
    await page.keyboard.press('Escape')
    await selectLayers(page, ['plain'], { bar: true })
    const boxList = await strokeList(page)
    const boxStrokes = async () => (await props(page, 'plain')).strokes ?? []
    await step(
      page,
      async () => boxList.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await boxStrokes()).length).toBe(1)
      },
    )
    // The second stroke is the same as the first, so the box draws the same with one or two.
    await step(
      page,
      async () => boxList.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await boxStrokes()).length).toBe(2)
      },
      { draws: false },
    )
    await step(
      page,
      async () => boxList.getByRole('button', { name: 'Remove outline 1' }).click(),
      async () => {
        await expect.poll(async () => (await boxStrokes()).length).toBe(1)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(36, 'stroke paint, width, position, on a shape and a box', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = await strokeList(page)
    await card.getByRole('button', { name: 'Add outline' }).click()
    const stroke = async () => (await props(page, 'box')).strokes?.[0] ?? {}
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Outline 1 colour hex' }), '2f6bff'),
      async () => {
        await expect.poll(stroke).toMatchObject({ paint: { type: 'solid', color: '#2F6BFFFF' } })
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Outline 1 width' }), '10'),
      async () => {
        await expect.poll(stroke).toMatchObject({ width: 10 })
      },
    )
    for (const align of ['inside', 'outside', 'center']) {
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: 'Outline 1 position' }), align),
        async () => {
          await expect.poll(stroke).toMatchObject({ align })
        },
      )
    }
    // A box takes strokes too, from its bar's Outline.
    await page.keyboard.press('Escape')
    await selectLayers(page, ['plain'], { bar: true })
    const outline = await strokeList(page)
    const boxStroke = async () => (await props(page, 'plain')).strokes?.[0] ?? {}
    await step(
      page,
      async () => outline.getByRole('button', { name: 'Add outline' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).strokes ?? []).toHaveLength(1)
      },
    )
    await step(
      page,
      async () => enter(outline.getByRole('spinbutton', { name: 'Outline 1 width' }), '12'),
      async () => {
        await expect.poll(boxStroke).toMatchObject({ width: 12 })
      },
    )
    for (const align of ['outside', 'inside']) {
      await step(
        page,
        async () => choose(outline.getByRole('combobox', { name: 'Outline 1 position' }), align),
        async () => {
          await expect.poll(boxStroke).toMatchObject({ align })
        },
      )
    }
    await reloads(page)
  })

  row(37, 'dashes, dash offset, ends, corners, on a shape and a box', async (open) => {
    const page = await open()
    await selectLayers(page, ['poly'], { bar: true })
    const card = await strokeList(page)
    await card.getByRole('button', { name: 'Add outline' }).click()
    await enter(card.getByRole('spinbutton', { name: 'Outline 1 width' }), '16')
    const stroke = async () => (await props(page, 'poly')).strokes?.[0] ?? {}
    for (const join of ['round', 'bevel', 'miter']) {
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: 'Outline 1 corners' }), join),
        async () => {
          await expect.poll(stroke).toMatchObject({ join })
        },
      )
    }
    await step(
      page,
      async () => enter(card.getByRole('textbox', { name: 'Outline 1 dashes' }), '30, 12'),
      async () => {
        await expect.poll(stroke).toMatchObject({ dashes: [30, 12] })
      },
    )
    await step(
      page,
      async () => enter(card.getByRole('spinbutton', { name: 'Outline 1 dash offset' }), '9'),
      async () => {
        await expect.poll(stroke).toMatchObject({ dashOffset: 9 })
      },
    )
    for (const cap of ['round', 'square', 'butt']) {
      await step(
        page,
        async () => choose(card.getByRole('combobox', { name: 'Outline 1 ends' }), cap),
        async () => {
          await expect.poll(stroke).toMatchObject({ cap })
        },
      )
    }
    // A box's stroke takes dashes and corners the same.
    await page.keyboard.press('Escape')
    await selectLayers(page, ['plain'], { bar: true })
    const boxList = await strokeList(page)
    await boxList.getByRole('button', { name: 'Add outline' }).click()
    const boxStroke = async () => (await props(page, 'plain')).strokes?.[0] ?? {}
    await step(
      page,
      async () => enter(boxList.getByRole('textbox', { name: 'Outline 1 dashes' }), '20, 10'),
      async () => {
        await expect.poll(boxStroke).toMatchObject({ dashes: [20, 10] })
      },
    )
    await step(
      page,
      async () => choose(boxList.getByRole('combobox', { name: 'Outline 1 corners' }), 'round'),
      async () => {
        await expect.poll(boxStroke).toMatchObject({ join: 'round' })
      },
    )
    await reloads(page)
  })

  row(38, 'rectangle and box corners, each corner its own', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    await expect.soft((await card()).getByRole('heading')).toHaveText('Rectangle')
    const shape = async () => (await props(page, 'box')).shape as Record<string, unknown>
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Corners' }), '60'),
      async () => {
        await expect.poll(shape).toMatchObject({ cornerRadius: 60 })
      },
    )
    // Each corner starts at the radius all four had.
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(async () => (await shape()).corners).toEqual([60, 60, 60, 60])
      },
      { draws: false },
    )
    for (const [i, corner, radius] of [
      [0, 'Top left', 0],
      [1, 'Top right', 20],
      [2, 'Bottom right', 90],
      [3, 'Bottom left', 40],
    ] as const) {
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name: `${corner} radius` }), String(radius)),
        async () => {
          await expect.poll(async () => ((await shape()).corners as number[])[i]).toBe(radius)
        },
      )
    }
    // Back to one radius: the top left's, and the corners go.
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Top left radius' }), '30'),
      async () => {
        await expect.poll(async () => ((await shape()).corners as number[])[0]).toBe(30)
      },
    )
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(shape).toEqual({ kind: 'rect', cornerRadius: 30 })
      },
    )
    // A box has the same corners, in its Box card.
    await selectLayers(page, ['plain'], { bar: true })
    const box = async () => await openCard(page, 'frame-card')
    await step(
      page,
      async () => enter((await box()).getByRole('spinbutton', { name: 'Corners' }), '50'),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toBe(50)
      },
    )
    await step(
      page,
      async () => (await box()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toEqual([50, 50, 50, 50])
      },
      { draws: false },
    )
    await step(
      page,
      async () => enter((await box()).getByRole('spinbutton', { name: 'Top right radius' }), '0'),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toEqual([50, 0, 50, 50])
      },
    )
    // Back to one radius: the top left's.
    await step(
      page,
      async () => (await box()).getByRole('switch', { name: 'Each corner its own' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).cornerRadius).toBe(50)
      },
    )
    await reloads(page)
  })

  row(39, 'polygon sides and corners', async (open) => {
    const page = await open()
    await selectLayers(page, ['poly'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    await expect.soft((await card()).getByRole('heading')).toHaveText('Polygon')
    const shape = async () => (await props(page, 'poly')).shape
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Sides' }), '8'),
      async () => {
        await expect.poll(shape).toMatchObject({ sides: 8 })
      },
    )
    // Sides are at least three: Home takes them there.
    await step(
      page,
      async () => (await card()).getByRole('spinbutton', { name: 'Sides' }).press('Home'),
      async () => {
        await expect.poll(shape).toMatchObject({ sides: 3 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Corners' }), '20'),
      async () => {
        await expect.poll(shape).toMatchObject({ cornerRadius: 20 })
      },
    )
    await reloads(page)
  })

  row(40, 'star points, inner, corners', async (open) => {
    const page = await open()
    await selectLayers(page, ['star'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    const shape = async () => (await props(page, 'star')).shape
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Points' }), '8'),
      async () => {
        await expect.poll(shape).toMatchObject({ points: 8 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Inner' }), '70'),
      async () => {
        await expect.poll(shape).toMatchObject({ innerRadius: 0.7 })
      },
    )
    // The arrow keys step the points by one and the inner radius by a percent, as it shows.
    await step(
      page,
      async () => (await card()).getByRole('spinbutton', { name: 'Points' }).press('ArrowUp'),
      async () => {
        await expect.soft.poll(shape).toMatchObject({ points: 9 })
      },
    )
    await step(
      page,
      async () => (await card()).getByRole('spinbutton', { name: 'Inner' }).press('ArrowUp'),
      async () => {
        await expect.soft.poll(shape).toMatchObject({ innerRadius: 0.71 })
      },
    )
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Corners' }), '10'),
      async () => {
        await expect.poll(shape).toMatchObject({ cornerRadius: 10 })
      },
    )
    // A rectangle and a star selected together have no Shape pop-up.
    await selectLayers(page, ['box', 'star'], { bar: true })
    await expect.soft(page.getByTestId('bar-shape')).toHaveCount(0)
    await reloads(page)
  })

  row(41, 'line start and end', async (open) => {
    const page = await open()
    await selectLayers(page, ['rule'], { bar: true })
    const card = async () => await openCard(page, 'shape-card')
    const shape = async () => (await props(page, 'rule')).shape
    for (const end of ['arrow', 'triangle', 'circle']) {
      await step(
        page,
        async () => choose((await card()).getByRole('combobox', { name: 'Line start' }), end),
        async () => {
          await expect.poll(shape).toMatchObject({ start: end })
        },
      )
    }
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Line end' }), 'arrow'),
      async () => {
        await expect.poll(shape).toMatchObject({ end: 'arrow' })
      },
    )
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Line start' }), 'none'),
      async () => {
        await expect.poll(shape).toMatchObject({ start: 'none' })
      },
    )
    await reloads(page)
  })

  row(42, 'combine: union, subtract, intersect, exclude', async (open) => {
    const page = await open()
    for (const op of ['union', 'subtract', 'intersect', 'exclude']) {
      await selectLayers(page, ['box', 'poly'], { bar: true })
      // A union of two shapes that don't overlap draws the same two shapes.
      // Combine is on the bar by several layers.
      await step(
        page,
        async () =>
          (await barMenu(page, 'combine'))
            .locator(`[data-action="boolean${op[0]?.toUpperCase() + op.slice(1)}"]`)
            .click(),
        async () => {
          await expect
            .poll(async () => {
              const d = await doc(page)
              const parent = d.nodes[d.nodes.box?.parentId ?? '']
              return [parent?.type, parent?.props.op]
            })
            .toEqual(['boolean', op])
        },
        { draws: op !== 'union' },
      )
      if (op !== 'exclude') await perform(page, 'undo')
    }
    await reloads(page)
  })
})

test.describe('photos', () => {
  const image = async (page: Page) => (await fills(page, 'photo')).at(-1) ?? {}

  row(43, 'replace the image', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    await step(
      page,
      async () => {
        await page.getByTestId('bar-replace').click()
        await page.getByTestId('bar-replace-picker').locator(`li[data-asset="${assets.tile}"] button`).click()
      },
      async () => {
        await expect.poll(() => image(page)).toMatchObject({ assetId: assets.tile })
      },
    )
    await reloads(page)
  })

  row(44, 'crop on the canvas', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    await page.getByTestId('bar-crop').click()
    await expect(page.locator('.crop-image')).toBeVisible()
    await step(
      page,
      async () => drag(page, { x: 540, y: 350 }, { x: 600, y: 350 }),
      async () => {
        await expect.poll(() => image(page)).toMatchObject({ fit: 'crop' })
        expect((await image(page)).crop).toBeTruthy()
      },
    )
    await page.keyboard.press('Escape')
    await reloads(page)
  })

  row(45, 'fit: fill, fit inside, crop, tile', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    // The fit is a part of the Edit image panel.
    const field = async () => (await openCard(page, 'fill-card')).getByRole('radiogroup', { name: 'Fit' })
    for (const fit of ['fit', 'tile', 'crop', 'fill']) {
      // Crop with no crop box shows what fill shows.
      await step(
        page,
        async () => (await field()).locator(`[data-value="${fit}"]`).click(),
        async () => {
          await expect.poll(() => image(page)).toMatchObject({ fit })
        },
        { draws: fit !== 'crop' && fit !== 'fill' },
      )
    }
    await reloads(page)
  })

  row(46, 'filter', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const filters = async () => (await openCard(page, 'look-card')).getByRole('radiogroup', { name: 'Filter' })
    for (const [name, filter] of [
      ['Mono', 'mono'],
      ['Sepia', 'sepia'],
      ['Vivid', 'vivid'],
      ['Fade', 'fade'],
      ['Warm', 'warm'],
      ['Cool', 'cool'],
      ['Original', undefined],
    ] as const) {
      await step(
        page,
        async () => (await filters()).getByRole('radio', { name }).click(),
        async () => {
          await expect.poll(async () => (await image(page)).filter).toBe(filter)
        },
      )
    }
    await reloads(page)
  })

  row(47, 'adjust: exposure, contrast, saturation, temperature, tint', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const card = async () => await openCard(page, 'adjust-card')
    for (const [name, key] of [
      ['Light', 'exposure'],
      ['Contrast', 'contrast'],
      ['Saturation', 'saturation'],
      ['Warmth', 'temperature'],
      ['Tint', 'tint'],
    ] as const) {
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name }), '40'),
        async () => {
          await expect
            .poll(async () => ((await image(page)).adjust as Record<string, number> | undefined)?.[key])
            .toBe(40)
        },
      )
    }
    await reloads(page)
  })

  row(48, 'image opacity', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const card = async () => await openCard(page, 'adjust-card')
    await step(
      page,
      async () => enter((await card()).getByRole('spinbutton', { name: 'Image opacity' }), '50'),
      async () => {
        await expect.poll(async () => (await image(page)).opacity).toBe(0.5)
      },
    )
    await reloads(page)
  })

  row(49, 'use as mask', async (open) => {
    const page = await open()
    await selectLayers(page, ['photo'], { bar: true })
    const mask = () => moreAction(page, 'Use as mask')
    await step(page, mask, async () => {
      await expect.poll(async () => (await props(page, 'photo')).mask).toBe('alpha')
    })
    await step(page, mask, async () => {
      await expect.poll(async () => (await props(page, 'photo')).mask).toBeFalsy()
    })
    await reloads(page)
  })
})

test.describe('frames and auto layout', () => {
  const layout = async (page: Page, id = 'stack') =>
    (await props(page, id)).layout as Record<string, unknown> | undefined
  /** The Line up pad's cell that lines up along the flow at `justify` and across it at `align`. */
  const cell = async (page: Page, justify: unknown, align: unknown) =>
    (await openCard(page, 'auto-layout-advanced')).locator(`[data-justify="${justify}"][data-align="${align}"]`)

  row(50, 'add auto layout', async (open) => {
    const page = await open()
    await selectLayers(page, ['plain'], { bar: true })
    await step(
      page,
      async () => (await openCard(page, 'auto-layout-card')).getByRole('switch', { name: 'Stack' }).click(),
      async () => {
        await expect.poll(() => layout(page, 'plain')).toBeTruthy()
      },
    )
    await reloads(page)
  })

  row(51, 'direction and wrap', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-card')
    await step(
      page,
      async () => (await card()).getByRole('radio', { name: 'Column' }).click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ direction: 'column' })
      },
    )
    await (await card()).getByRole('radio', { name: 'Row' }).click()
    await enter((await card()).getByRole('spinbutton', { name: 'Room between' }), '400')
    await step(
      page,
      async () => (await card()).getByRole('switch', { name: 'Wrap onto more lines' }).click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ wrap: true })
      },
    )
    await reloads(page)
  })

  row(52, 'gap', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    await step(
      page,
      async () =>
        enter((await openCard(page, 'auto-layout-card')).getByRole('spinbutton', { name: 'Room between' }), '48'),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ gap: 48 })
      },
    )
    await reloads(page)
  })

  row(53, 'padding, four sides', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-advanced')
    for (const side of ['top', 'right', 'bottom', 'left']) {
      // The stack is wider than its row: padding on the end side moves nothing.
      await step(
        page,
        async () => enter((await card()).getByRole('spinbutton', { name: `Room at the ${side}` }), '8'),
        async () => {
          await expect.poll(async () => ((await layout(page))?.padding as Record<string, number>)[side]).toBe(8)
        },
        { draws: side === 'top' || side === 'left' },
      )
    }
    await reloads(page)
  })

  row(54, 'distribute: start, centre, end, space between', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const { align } = (await layout(page)) ?? {}
    for (const justify of ['center', 'end']) {
      await step(
        page,
        async () => (await cell(page, justify, align)).click(),
        async () => {
          await expect.poll(() => layout(page)).toMatchObject({ justify, align })
        },
      )
    }
    const spread = async () =>
      (await openCard(page, 'auto-layout-card')).getByRole('radiogroup', { name: 'Spread out' })
    await step(
      page,
      async () => (await spread()).locator('[data-value="between"]').click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ justify: 'space-between' })
      },
    )
    // Together again, the stack lines up from the start.
    await step(
      page,
      async () => (await spread()).locator('[data-value="packed"]').click(),
      async () => {
        await expect.poll(() => layout(page)).toMatchObject({ justify: 'start' })
      },
    )
    await reloads(page)
  })

  row(55, 'align: start, centre, end', async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-advanced')
    await enter((await card()).getByRole('spinbutton', { name: 'Room at the top' }), '0')
    await enter((await card()).getByRole('spinbutton', { name: 'Room at the bottom' }), '0')
    const { justify } = (await layout(page)) ?? {}
    for (const align of ['center', 'end', 'start']) {
      await step(
        page,
        async () => (await cell(page, justify, align)).click(),
        async () => {
          await expect.poll(() => layout(page)).toMatchObject({ align, justify })
        },
      )
    }
    await reloads(page)
  })

  row(56, "the frame's own sizing", async (open) => {
    const page = await open()
    await selectLayers(page, ['stack'], { bar: true })
    const card = async () => await openCard(page, 'auto-layout-advanced')
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Width sizing' }), 'hug'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).sizing).toMatchObject({ width: 'hug' })
      },
    )
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Width sizing' }), 'fixed'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).sizing).toMatchObject({ width: 'fixed' })
      },
      { draws: false },
    )
    // Its height is already what its chips need, so hug draws it the same.
    await step(
      page,
      async () => choose((await card()).getByRole('combobox', { name: 'Height sizing' }), 'hug'),
      async () => {
        await expect.poll(async () => (await props(page, 'stack')).sizing).toMatchObject({ height: 'hug' })
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(57, "a child's sizing", async (open) => {
    const page = await open()
    await selectLayers(page, ['chip1'], { bar: true })
    const card = async () => await openCard(page, 'flow-card')
    const pick = async (axis: 'Width' | 'Height', sizing: string) =>
      choose((await card()).getByRole('combobox', { name: `${axis} sizing` }), sizing)
    await step(
      page,
      async () => pick('Width', 'fill'),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).sizing).toMatchObject({ width: 'fill' })
      },
    )
    // Fixed keeps the width fill gave it; hug, with nothing inside, keeps it too.
    for (const sizing of ['fixed', 'hug']) {
      await step(
        page,
        async () => pick('Width', sizing),
        async () => {
          await expect.poll(async () => (await props(page, 'chip1')).sizing).toMatchObject({ width: sizing })
        },
        { draws: false },
      )
    }
    // The chip is already as tall as the stack's inside.
    await step(
      page,
      async () => pick('Height', 'fill'),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).sizing).toMatchObject({ height: 'fill' })
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(58, 'a child kept where it is, out of the flow', async (open) => {
    const page = await open()
    await selectLayers(page, ['chip1'], { bar: true })
    const box = async () => (await openCard(page, 'flow-card')).getByRole('switch', { name: 'Keep where I put it' })
    // Out of the flow, Chip 2 moves up to where Chip 1 was.
    await step(
      page,
      async () => (await box()).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).absolute).toBe(true)
      },
    )
    await step(
      page,
      async () => (await box()).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'chip1')).absolute).toBeFalsy()
      },
    )
    await reloads(page)
  })
})

test.describe('nothing selected', () => {
  const background = async (page: Page) => (await doc(page)).pages.p1?.fills ?? []

  row(59, 'page background: brand colours, design colours, any colour', async (open) => {
    const page = await open()
    const panel = await backgroundPanel(page)
    await step(
      page,
      async () => panel.getByTestId('brand-colours').getByRole('button', { name: 'Berry' }).click(),
      async () => {
        await expect.poll(() => background(page)).toEqual(solid('#FF3D6EFF'))
      },
    )
    await step(
      page,
      async () =>
        panel
          .getByTestId('design-colours')
          .locator('button[aria-pressed="false"]:not([data-testid="colour-pick"])')
          .first()
          .click(),
      async () => {
        await expect.poll(async () => (await background(page))[0]?.color).not.toBe('#FFFFFFFF')
      },
    )
    await panel.getByTestId('colour-pick').click()
    await step(
      page,
      async () => enter(panel.getByTestId('colour-picker').getByRole('textbox', { name: 'Colour hex' }), '14213d'),
      async () => {
        await expect.poll(() => background(page)).toEqual(solid('#14213DFF'))
      },
    )
    await reloads(page)
  })

  row(60, 'background layers: add, remove, each paint', async (open) => {
    const page = await open()
    const layers = (await backgroundPanel(page)).getByTestId('page-fills')
    await step(
      page,
      async () => layers.getByRole('button', { name: 'Add a background layer' }).click(),
      async () => {
        await expect.poll(async () => (await background(page)).length).toBe(2)
      },
    )
    await step(
      page,
      async () => enter(layers.getByRole('textbox', { name: 'Background 1 hex' }), '2f6bff'),
      async () => {
        await expect.poll(async () => (await background(page))[1]?.color).toMatch(/^#2F6BFF/)
      },
    )
    await layers.locator('[data-row="1"]').getByTestId('paint-swatch').click()
    await step(
      page,
      async () => page.getByTestId('paint-editor').getByRole('radio', { name: 'Line gradient' }).click(),
      async () => {
        await expect.poll(async () => (await background(page))[1]?.type).toBe('linear')
      },
    )
    await page.keyboard.press('Escape')
    await step(
      page,
      async () => layers.getByRole('button', { name: 'Remove background layer 1' }).click(),
      async () => {
        await expect.poll(async () => (await background(page)).length).toBe(1)
      },
    )
    await reloads(page)
  })

  row(61, 'formats: add a preset, a custom size, with checks', async (open) => {
    const page = await open()
    const count = async () => Object.keys((await doc(page)).formats).length
    await sizesPanel(page)
    await page.getByRole('button', { name: 'Add format' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add format' })
    // The presets are grouped by shape.
    for (const shape of ['Square', 'Portrait', 'Tall', 'Landscape', 'Wide'])
      await expect.soft(dialog.getByRole('group', { name: shape })).toBeVisible()
    // A new format adds a frame, labelled with its name; the Square, the picture checked, stays the same.
    await step(
      page,
      async () => dialog.locator('[data-preset=story]').click(),
      async () => {
        await expect.poll(count).toBe(2)
        const [story, size] = Object.entries((await doc(page)).formats).find(([, f]) => f.name === 'Story') ?? []
        expect.soft(size).toMatchObject({ width: 1080, height: 1920 })
        await expect.soft(page.locator(`.frame-label[data-frame="p1/${story}"]`)).toContainText('Story')
      },
      { draws: false },
    )
    await page.getByRole('button', { name: 'Add format' }).click()
    await dialog.getByLabel('Width').fill('1600')
    await dialog.getByLabel('Height').fill('500')
    await expect(dialog.getByRole('alert')).toHaveText('Sizes run from 1:3 to 3:1.')
    await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
    await dialog.getByLabel('Width').fill('1200')
    await step(
      page,
      async () => dialog.getByRole('button', { name: 'Add', exact: true }).click(),
      async () => {
        await expect
          .poll(async () => Object.values((await doc(page)).formats).some((f) => f.width === 1200 && f.height === 500))
          .toBe(true)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(62, 'formats: rename, make primary, move, remove with undo, show alone', async (open) => {
    const page = await open(true)
    await sizesPanel(page)
    const formats = page.getByTestId('formats')
    const row = formats.locator('[data-format="story"]')
    const square = formats.locator('[data-format="sq"]')
    // A format's name isn't drawn; the stage's label of its frame shows it.
    await step(
      page,
      async () => {
        await row.getByRole('button', { name: 'Rename: Story' }).dblclick()
        await row.getByRole('textbox', { name: 'Rename' }).fill('Reel')
        await row.getByRole('textbox', { name: 'Rename' }).press('Enter')
      },
      async () => {
        await expect.poll(async () => (await doc(page)).formats.story?.name).toBe('Reel')
        await expect.soft(page.locator('.frame-label[data-frame="p1/story"]')).toContainText('Reel')
      },
      { draws: false },
    )
    // A size's menu: rename, move up and down, remove.
    const menu = async (of: typeof row, name: string) => {
      await of.getByRole('button', { name: /^More for / }).click()
      return page.getByRole('dialog', { name: new RegExp(`^More for ${name}`) })
    }
    // The primary format can't be removed.
    await expect.soft((await menu(square, 'Square')).getByRole('button', { name: 'Remove format' })).toBeDisabled()
    await page.keyboard.press('Escape')
    // Which format is primary changes no format's picture.
    await step(
      page,
      async () => row.getByRole('button', { name: 'Make primary' }).click(),
      async () => {
        await expect.poll(async () => (await doc(page)).meta.primaryFormatId).toBe('story')
      },
      { draws: false },
    )
    await expect.soft((await menu(row, 'Reel')).getByRole('button', { name: 'Remove format' })).toBeDisabled()
    await page.keyboard.press('Escape')
    // The order of formats is the order of the list, not of the picture.
    const order = async () => inOrder((await doc(page)).formats).map(([id]) => id)
    await step(
      page,
      async () => (await menu(row, 'Reel')).getByRole('button', { name: 'Move up' }).click(),
      async () => {
        await expect.poll(order).toEqual(['story', 'sq'])
      },
      { draws: false },
    )
    await step(
      page,
      async () => (await menu(row, 'Reel')).getByRole('button', { name: 'Move down' }).click(),
      async () => {
        await expect.poll(order).toEqual(['sq', 'story'])
      },
      { draws: false },
    )
    const kept = await designOf(page)
    await (await menu(square, 'Square')).getByRole('button', { name: 'Remove format' }).click()
    await expect.poll(async () => (await doc(page)).formats.sq).toBeUndefined()
    await expect.soft(page.getByTestId('removed-toast')).toContainText('Square removed')
    await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => designOf(page), { message: "the toast's Undo brings the format back whole" }).toBe(kept)
    await square.getByRole('button', { name: 'Show alone' }).click()
    await expect(page.getByTestId('focus-chip')).toBeVisible()
    await expect.soft(page.getByTestId('focus-chip')).toContainText('Showing Square alone')
    expect(await page.evaluate(() => window.dazbee?.frames().map((f) => f.formatId))).toEqual(['sq'])
    // Show all brings both frames back.
    await page.getByTestId('focus-chip').getByRole('button', { name: 'Show all formats' }).click()
    await expect.soft(page.getByTestId('focus-chip')).toBeHidden()
    await expect.soft
      .poll(() =>
        page.evaluate(() =>
          window.dazbee
            ?.frames()
            .map((f) => f.formatId)
            .sort(),
        ),
      )
      .toEqual(['sq', 'story'])
    await reloads(page)
  })

  row(63, 'pages: add, duplicate, rename, move, delete with undo, show', async (open) => {
    const page = await open()
    // A second tab on the same design holds the same design after the rename, after the toast's
    // Undo and at the end.
    const browser = page.context().browser()
    const designId = new URL(page.url()).pathname.split('/').at(-1)
    if (!browser || !designId) throw new Error('no browser or design')
    const {
      tabs: [other],
    } = await openTabs(browser, 1, designId, { brandId })
    if (!other) throw new Error('no second tab')
    try {
      const pages = (await pagesPanel(page)).getByTestId('pages')
      /** Picks an action from a page's ⋯ menu. */
      const act = async (item: Locator, action: string) => {
        await item.getByRole('button', { name: /^More for / }).click()
        await page
          .getByRole('dialog', { name: /^More for / })
          .getByRole('button', { name: action })
          .click()
      }
      /** Whether an action of a page's ⋯ menu is on. */
      const canAct = async (item: Locator, action: string) => {
        await item.getByRole('button', { name: /^More for / }).click()
        const on = await page
          .getByRole('dialog', { name: /^More for / })
          .getByRole('button', { name: action })
          .isEnabled()
        await page.keyboard.press('Escape')
        return on
      }
      const names = async () => inOrder((await doc(page)).pages).map(([, p]) => p.name)
      const idOf = async (name: string) => Object.entries((await doc(page)).pages).find(([, p]) => p.name === name)?.[0]
      /** The pages of the stage's rows, top to bottom. */
      const rows = () =>
        page.evaluate(() => [
          ...new Set(
            window.dazbee
              ?.frames()
              .sort((a, b) => a.y - b.y)
              .map((f) => f.pageId),
          ),
        ])
      const p1 = pages.locator('[data-page="p1"]')
      // The last page can't be deleted: its Delete is off.
      expect.soft(await canAct(p1, 'Delete page')).toBe(false)
      // The picture checked is the first page's; these steps change the other pages or their names.
      await step(
        page,
        async () => page.getByRole('button', { name: 'Add page' }).click(),
        async () => {
          await expect.poll(names).toEqual(['Page 1', 'Page 2'])
        },
        { draws: false },
      )
      // Deleted back to one page, its Delete is off again; the toast's Undo brings the other back.
      const page2 = pages.getByRole('listitem').filter({ hasText: 'Page 2' })
      await act(page2, 'Delete page')
      await expect.poll(names).toEqual(['Page 1'])
      expect.soft(await canAct(p1, 'Delete page')).toBe(false)
      await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
      await expect.poll(names).toEqual(['Page 1', 'Page 2'])
      // The copy is the page shown, and the stage has a row for it.
      await step(
        page,
        async () => act(p1, 'Duplicate page'),
        async () => {
          await expect.poll(async () => (await names()).length).toBe(3)
          await expect
            .soft(pages.locator(`[data-page="${await idOf('Page 1 copy')}"]`))
            .toHaveAttribute('aria-current', 'page')
          await expect.soft.poll(async () => (await rows()).length).toBe(3)
        },
        { draws: false },
      )
      const second = pages.getByRole('listitem').nth(1)
      await step(
        page,
        async () => {
          await second.getByRole('button', { name: /^Show / }).dblclick()
          await second.getByRole('textbox', { name: 'Rename' }).fill('Offer')
          await second.getByRole('textbox', { name: 'Rename' }).press('Enter')
        },
        async () => {
          await expect.poll(async () => (await names())[1]).toBe('Offer')
        },
        { draws: false },
      )
      await settle([page, other])
      const offer = pages.getByRole('listitem').filter({ hasText: 'Offer' })
      // Moved up, its row on the stage goes on top.
      await step(
        page,
        async () => act(offer, 'Move up'),
        async () => {
          await expect.poll(async () => (await names())[0]).toBe('Offer')
          await expect.soft.poll(async () => (await rows())[0]).toBe(await idOf('Offer'))
        },
        { draws: false },
      )
      await step(
        page,
        async () => act(offer, 'Move down'),
        async () => {
          await expect.poll(async () => (await names())[1]).toBe('Offer')
        },
        { draws: false },
      )
      const kept = await designOf(page)
      await act(offer, 'Delete page')
      await expect.poll(async () => (await names()).length).toBe(2)
      await expect.soft(page.getByTestId('removed-toast')).toContainText('Offer deleted')
      await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
      await expect.poll(() => designOf(page), { message: "the toast's Undo brings the page back whole" }).toBe(kept)
      await settle([page, other])
      // With the page shown deleted, the first is the one in view; Show brings another into view.
      await expect(p1).toHaveAttribute('aria-current', 'page')
      const offerAgain = pages.getByRole('listitem').filter({ hasText: 'Offer' })
      await offerAgain.getByRole('button', { name: 'Show Offer' }).click()
      await expect(offerAgain).toHaveAttribute('aria-current', 'page')
      await expect(page.getByTestId('pages-button')).toHaveAccessibleName('Pages: page 2 of 3')
      await p1.getByRole('button', { name: 'Show Page 1' }).click()
      await expect(p1).toHaveAttribute('aria-current', 'page')
      // A new page takes the next free name: one more than there are pages, past a name taken.
      // The last row, found by place: while it is renamed its name is in a text box, not its text.
      // F2 opens the rename from the keyboard, the other way in besides the double click above.
      const last = pages.getByRole('listitem').last()
      await step(
        page,
        async () => {
          await last.getByRole('button', { name: /^Show / }).press('F2')
          await last.getByRole('textbox', { name: 'Rename' }).fill('Page 4')
          await last.getByRole('textbox', { name: 'Rename' }).press('Enter')
        },
        async () => {
          await expect.poll(names).toEqual(['Page 1', 'Offer', 'Page 4'])
        },
        { draws: false },
      )
      await step(
        page,
        async () => page.getByRole('button', { name: 'Add page' }).click(),
        async () => {
          await expect.soft.poll(names).toEqual(['Page 1', 'Offer', 'Page 4', 'Page 5'])
        },
        { draws: false },
      )
      await settle([page, other])
      await reloads(page)
    } finally {
      await other.context().close()
    }
  })
})

test.describe('top bar and full menu', () => {
  row(69, 'bold and italic on the top bar', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => page.getByTestId('bar-bold').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontWeight).toBeLessThan(600)
      },
    )
    await step(
      page,
      async () => page.getByTestId('bar-italic').click(),
      async () => {
        await expect.poll(async () => (await style(page, 'headline')).fontStyle).toBe('italic')
      },
    )
    await reloads(page)
  })

  row(70, 'text direction in the full menu', async (open) => {
    const page = await open()
    await selectLayers(page, ['headline'], { bar: true })
    await step(
      page,
      async () => (await moreSubmenu(page, 'text-direction')).getByRole('button', { name: 'Right to left' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'headline')).direction).toBe('rtl')
      },
    )
    await reloads(page)
  })

  row(71, 'line up and spread selected layers from the top bar', async (open) => {
    const page = await open()
    await selectLayers(page, ['box', 'dot'], { bar: true })
    await step(
      page,
      async () => (await barMenu(page, 'line-up')).getByRole('button', { name: 'Align left' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'dot')).x).toBe(80)
      },
    )
    await page.keyboard.press('Escape')
    // The hexagon between the box and the star moves to leave the same room each side: (900 - 380 - 160) / 2.
    await selectLayers(page, ['box', 'poly', 'star'], { bar: true })
    await step(
      page,
      async () => (await barMenu(page, 'line-up')).getByRole('button', { name: /^Distribute horizontally/ }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'poly')).x).toBe(560)
      },
    )
    await reloads(page)
  })

  row(72, 'lock and hide in this size from the full menu', async (open) => {
    const page = await open(true)
    await selectLayers(page, ['box'], { bar: true })
    await step(
      page,
      async () => moreAction(page, 'Lock'),
      async () => {
        await expect.poll(async () => Object.values((await doc(page)).nodes.box?.lock ?? {}).some(Boolean)).toBe(true)
      },
      { draws: false },
    )
    await step(
      page,
      async () => moreAction(page, 'Hide in this size'),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).visible).toBe(false)
        await expect.poll(async () => (await doc(page)).nodes.box?.props.visible).not.toBe(false)
      },
    )
    await reloads(page)
  })

  row(73, 'frame clipping from the Box pop-up', async (open) => {
    const page = await open()
    await selectLayers(page, ['plain'], { bar: true })
    // Its tiles lie inside it, so the drawing is the same either way.
    await step(
      page,
      async () => (await openCard(page, 'frame-card')).getByRole('switch', { name: "Hide what's outside" }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'plain')).clip).toBe(false)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(74, 'mask by brightness from the Mask pop-up', async (open) => {
    const page = await open()
    await selectLayers(page, ['box'], { bar: true })
    await moreAction(page, 'Use as mask')
    await expect.poll(async () => (await props(page, 'box')).mask).toBe('alpha')
    // Nothing in this design sits under the box for it to mask, so the drawing stays the same.
    await step(
      page,
      async () => (await openCard(page, 'mask-card')).getByRole('radio', { name: 'Brightness' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, 'box')).mask).toBe('luminance')
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(76, 'several photos: replace and the filters, for all of them', async (open) => {
    const page = await open()
    // The box shows the same picture as the photo, so the two are several photos.
    await page.evaluate(
      (assetId) =>
        window.dazbee?.session.run('node.update', {
          ids: ['box'],
          patch: { fills: [{ type: 'image', assetId, fit: 'fill' }] },
        }),
      assets.photo,
    )
    await selectLayers(page, ['photo', 'box'], { bar: true })
    const card = async () => await openCard(page, 'photos-card')
    const filters = async () => [(await fills(page, 'photo')).at(-1)?.filter, (await fills(page, 'box')).at(-1)?.filter]
    await step(
      page,
      async () =>
        (await card()).getByRole('radiogroup', { name: 'Filter' }).getByRole('radio', { name: 'Mono' }).click(),
      async () => {
        await expect.poll(filters).toEqual(['mono', 'mono'])
      },
    )
    await step(
      page,
      async () => {
        await (await card()).getByTestId('replace-image').click()
        await page.locator(`li[data-asset="${assets.tile}"] button`).first().click()
      },
      async () => {
        await expect
          .poll(async () => [(await fills(page, 'photo')).at(-1)?.assetId, (await fills(page, 'box')).at(-1)?.assetId])
          .toEqual([assets.tile, assets.tile])
      },
    )
    await reloads(page)
  })

  row(75, "a boolean's operation from its Combine pop-up", async (open) => {
    const page = await open()
    await selectLayers(page, ['box', 'poly'], { bar: true })
    await (await barMenu(page, 'combine')).getByRole('button', { name: /^Union/ }).click()
    const made = async () => Object.entries((await doc(page)).nodes).find(([, n]) => n.type === 'boolean')?.[0] ?? ''
    await expect.poll(made).not.toBe('')
    await selectLayers(page, [await made()], { bar: true })
    await step(
      page,
      async () => (await openCard(page, 'combine-card')).getByRole('radio', { name: 'Subtract' }).click(),
      async () => {
        await expect.poll(async () => (await props(page, await made())).op).toBe('subtract')
      },
    )
    await reloads(page)
  })
})
