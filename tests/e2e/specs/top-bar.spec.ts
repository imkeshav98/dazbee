// The top bar, the small menu by the selection and the edit panel (#287) in Chromium: for every kind
// of selection at desktop, tablet and phone sizes, every pop-up, panel and the full menu open with
// nothing drawn over anything else, no label wrapping, and the canvas never moving; the keyboard;
// undo and redo; the small menu's actions and the full menu's Copy and Paste; the phone's sheet;
// and right to left.
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../support/assets.ts'
import { editorPath, screenPoint, writeOutput } from '../support/editor.ts'
import { layoutProblems, wrapped } from '../support/layout.ts'
import { seed } from '../support/seed.ts'
import { openStage } from '../support/stage.ts'
import { expect, type Page, test } from '../support/test.ts'
import { barMenu, moreAction, moreMenu, moreSubmenu } from '../support/top-bar.ts'

test.describe.configure({ timeout: 240_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (
  name: string,
  index: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
  parentId = 'p1',
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name,
  props: { x, y, width: 200, height: 160, shape: { kind: 'rect' as const }, fills: solid('#14213DFF'), ...extra },
})

const design = (assetId: string): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Top bar', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    st: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFF8F0FF') } },
  nodes: {
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a0',
      name: 'Headline',
      props: {
        x: 60,
        y: 40,
        width: 600,
        height: 90,
        boxMode: 'autoHeight',
        text: 'Summer sale',
        style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 400, color: '#111111FF' },
      },
    },
    box: rect('Box', 'a1', 60, 200),
    star: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a2',
      name: 'Star',
      props: {
        x: 320,
        y: 200,
        width: 180,
        height: 180,
        shape: { kind: 'star', points: 5, innerRadius: 0.5 },
        fills: solid('#E0262BFF'),
      },
    },
    line: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a3',
      name: 'Line',
      props: {
        x: 560,
        y: 260,
        width: 240,
        height: 0,
        shape: { kind: 'line' },
        strokes: [{ paint: { type: 'solid', color: '#111111FF' }, width: 4, align: 'center' }],
      },
    },
    frame: {
      type: 'frame',
      parentId: 'p1',
      index: 'a4',
      name: 'Card',
      props: { x: 60, y: 440, width: 300, height: 200, fills: solid('#EEF1F6FF'), cornerRadius: 16 },
    },
    inFrame: rect('In card', 'a0', 80, 460, { width: 80, height: 60 }, 'frame'),
    group: {
      type: 'group',
      parentId: 'p1',
      index: 'a5',
      name: 'Group',
      props: { x: 420, y: 440, width: 260, height: 160 },
    },
    g1: rect('G1', 'a0', 420, 440, { width: 120, height: 160 }, 'group'),
    g2: rect('G2', 'a1', 560, 440, { width: 120, height: 160, fills: solid('#2A9D8FFF') }, 'group'),
    combo: {
      type: 'boolean',
      parentId: 'p1',
      index: 'a6',
      name: 'Combo',
      props: { x: 740, y: 440, width: 280, height: 200, op: 'union', fills: solid('#E0157FFF') },
    },
    c1: {
      type: 'graphic',
      parentId: 'combo',
      index: 'a0',
      name: 'C1',
      props: { x: 740, y: 440, width: 200, height: 200, shape: { kind: 'ellipse' } },
    },
    c2: {
      type: 'graphic',
      parentId: 'combo',
      index: 'a1',
      name: 'C2',
      props: { x: 820, y: 440, width: 200, height: 200, shape: { kind: 'ellipse' } },
    },
    photo: rect('Photo', 'a7', 60, 720, { width: 300, height: 300, fills: [{ type: 'image', assetId, fit: 'fill' }] }),
    photoFrame: {
      type: 'frame',
      parentId: 'p1',
      index: 'a8',
      name: 'Photo box',
      props: { x: 400, y: 720, width: 300, height: 300, fills: [{ type: 'image', assetId, fit: 'fill' }] },
    },
    stack: {
      type: 'frame',
      parentId: 'p1',
      index: 'a9',
      name: 'Stack',
      props: {
        x: 740,
        y: 720,
        width: 300,
        height: 120,
        fills: solid('#FCA311FF'),
        layout: { direction: 'row', gap: 12, padding: { top: 12, right: 12, bottom: 12, left: 12 } },
      },
    },
    inStack: rect('In stack', 'a0', 0, 0, { width: 80, height: 80 }, 'stack'),
    turned: rect('Turned', 'b0', 820, 60, { width: 160, height: 100, rotation: 30 }),
    cutter: rect('Cutter', 'b1', 740, 880, {
      width: 120,
      height: 120,
      mask: 'alpha',
      shape: { kind: 'rect', cornerRadius: 30 },
    }),
    locked: { ...rect('Locked', 'b2', 900, 880, { width: 120, height: 120 }), lock: { move: true, resize: true } },
    hidden: rect('Hidden', 'b3', 900, 280, { width: 120, height: 80, visible: false }),
    photoB: rect('Photo B', 'b4', 900, 380, {
      width: 120,
      height: 80,
      fills: [{ type: 'image', assetId, fit: 'fill' }],
    }),
    frameB: {
      type: 'frame',
      parentId: 'p1',
      index: 'b5',
      name: 'Card B',
      props: { x: 560, y: 320, width: 160, height: 90, fills: solid('#EEF1F6FF') },
    },
    comboB: {
      type: 'boolean',
      parentId: 'p1',
      index: 'b6',
      name: 'Combo B',
      props: { x: 60, y: 660, width: 140, height: 50, op: 'subtract', fills: solid('#E0157FFF') },
    },
    d1: {
      type: 'graphic',
      parentId: 'comboB',
      index: 'a0',
      name: 'D1',
      props: { x: 60, y: 660, width: 100, height: 50, shape: { kind: 'ellipse' } },
    },
    d2: {
      type: 'graphic',
      parentId: 'comboB',
      index: 'a1',
      name: 'D2',
      props: { x: 100, y: 660, width: 100, height: 50, shape: { kind: 'ellipse' } },
    },
  },
  overrides: { 'format:st': { headline: { y: 200 } } },
})

/** Selections to check, each one or several layers, with a state or none. */
const SELECTIONS: Record<string, string[]> = {
  text: ['headline'],
  rectangle: ['box'],
  star: ['star'],
  line: ['line'],
  box: ['frame'],
  group: ['group'],
  boolean: ['combo'],
  photo: ['photo'],
  'photo in a box': ['photoFrame'],
  'several shapes': ['box', 'star'],
  'text and a shape': ['headline', 'box'],
  'several photos': ['photo', 'photoB'],
  'several boxes': ['frame', 'frameB'],
  'several booleans': ['combo', 'comboB'],
  rotated: ['turned'],
  'in a group': ['g1'],
  'auto layout': ['stack'],
  'in auto layout': ['inStack'],
  masked: ['cutter'],
  locked: ['locked'],
  hidden: ['hidden'],
}

/** The editor's chrome and the pieces of the top bar, small menu and edit panel that must never meet. */
const PIECES = {
  'header pill': '[data-testid="island-start"]',
  'end island': '[data-testid="island-end"]',
  'top bar': '[data-testid="top-bar-row"]',
  'second row': '[data-testid="top-bar-overflow"]',
  'pop-up': '[data-radix-popper-content-wrapper]',
  'small menu': '[data-testid="small-menu"]',
  'edit panel': '#edit-panel',
  rail: '[data-testid="rail"]',
  flyout: '#editor-flyout',
  dock: '[data-dock]',
  zoom: '[data-zoom]',
  'show-alone chip': '[data-testid="focus-chip"]',
  toasts: '[data-toasts] > *',
}
/** The design's name and the font's name end in "…" by design when there is no room. */
const UNCUT = 'h1, [data-testid="bar-font"], [data-testid="edit-panel-note"]'

const SIZES = [
  [1280, 760],
  [820, 1180],
  [390, 844],
] as const

const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.dazbee?.select(ids), ids)
const camera = (page: Page) => page.evaluate(() => window.dazbee?.camera())
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** What the selection's top bar opens: every item with a pop-up or panel, by its test id, and the full menu. */
const openers = (page: Page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-testid^="bar-"]')]
    return items
      .map((el) => el.dataset.testid ?? '')
      .filter(
        (id) =>
          [
            'bar-overflow',
            'bar-size',
            'bar-bold',
            'bar-italic',
            'bar-underline',
            'bar-strikethrough',
            'bar-crop',
            'bar-replace',
            'bar-size-field',
            'bar-locked',
            'bar-unlock',
          ].indexOf(id) < 0,
      )
  })

for (const [width, height] of SIZES) {
  test(`at ${width}×${height} every selection's pop-ups, panels and full menu open clear of everything else, with no label wrapping and the canvas still`, async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, design(asset.id))
    await page.setViewportSize({ width, height })
    await page.evaluate(() => {
      window.dazbee?.select([])
      window.dazbee?.fitAll()
    })
    await settle(page)
    const still = await camera(page)
    const problems: string[] = []
    const check = async (where: string) => {
      await settle(page)
      for (const p of await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })) problems.push(`${where}: ${p}`)
      for (const w of await wrapped(page)) problems.push(`${where}: "${w}" wraps`)
      if (JSON.stringify(await camera(page)) !== JSON.stringify(still)) problems.push(`${where}: the canvas moved`)
    }
    for (const [name, ids] of Object.entries(SELECTIONS)) {
      await select(page, ids)
      await expect(page.getByTestId('top-bar-row')).toBeVisible()
      await check(name)
      for (const id of await openers(page)) {
        await barMenu(page, id.slice(4))
        await check(`${name}, ${id}`)
        if (width === 390 && id === 'bar-effects')
          writeOutput(
            `top-bar-${width}-${name.replaceAll(' ', '-')}-effects.png`,
            await page.screenshot({ animations: 'disabled' }),
          )
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`${id}-menu`)).toBeHidden()
      }
      if (await page.getByTestId('small-menu').isVisible()) {
        await moreMenu(page)
        await check(`${name}, full menu`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-more-menu')).toBeHidden()
      }
      if (name === 'text' || name === 'photo')
        writeOutput(`top-bar-${width}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
    }
    await select(page, [])
    await check('nothing selected')
    expect(problems).toEqual([])
    expect(errors).toEqual([])
  })
}

test('each kind gets its own top bar; several layers add Line up, Combine for shapes, and Stack', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const items = async (ids: string[]) => {
    await select(page, ids)
    await settle(page)
    return page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item]')]
        .map((el) => el.dataset.item)
        .filter((k) => !k?.startsWith('divider')),
    )
  }
  expect(await items(['headline'])).toEqual([
    'scope',
    'font',
    'size',
    'colour',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'align',
    'list',
    'case',
    'spacing',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['box'])).toEqual(['scope', 'colour', 'outline', 'shape', 'effects', 'transparency', 'position'])
  expect(await items(['line'])).toEqual(['scope', 'outline', 'shape', 'effects', 'transparency', 'position'])
  expect(await items(['combo'])).toEqual([
    'scope',
    'colour',
    'outline',
    'combine',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['frame'])).toEqual([
    'scope',
    'colour',
    'outline',
    'stack',
    'box',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['group'])).toEqual(['scope', 'effects', 'transparency', 'position'])
  expect(await items(['photo'])).toEqual([
    'scope',
    'edit',
    'replace',
    'crop',
    'corners',
    'outline',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['photoFrame'])).toEqual([
    'scope',
    'edit',
    'replace',
    'crop',
    'stack',
    'box',
    'outline',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['cutter'])).toEqual([
    'scope',
    'colour',
    'outline',
    'shape',
    'mask',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['box', 'star'])).toEqual([
    'scope',
    'colour',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'combine',
    'autoLayout',
  ])
  expect(await items(['headline', 'box'])).toEqual([
    'scope',
    'font',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  expect(await items(['box', 'frame'])).toEqual([
    'scope',
    'colour',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  // Several booleans make one new boolean of them; several photos combine into nothing.
  expect(await items(['combo', 'comboB'])).toEqual([
    'scope',
    'colour',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'combine',
    'autoLayout',
  ])
  expect(await items(['photo', 'photoB'])).toEqual([
    'scope',
    'edit',
    'replace',
    'corners',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  // Several boxes have their own Stack panel, and the action that puts them in one stack is named apart.
  expect(await items(['frame', 'frameB'])).toEqual([
    'scope',
    'colour',
    'outline',
    'stack',
    'box',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  await expect(page.getByTestId('top-bar').locator('[data-action="autoLayout"]')).toHaveText('Stack together')
  // Several layers put in a stack from the bar.
  await select(page, ['box', 'star'])
  await page.getByTestId('top-bar').locator('[data-action="autoLayout"]').click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.values(window.dazbee?.design().nodes ?? {}).filter(
            (n) => n.type === 'frame' && (n.props as { layout?: unknown }).layout !== undefined,
          ).length,
      ),
    )
    .toBe(2)
  expect(errors).toEqual([])
})

test('text: bold turns on and off as one undo step each, the size steps and takes a typed size, and U and S style the text', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  // With two formats a change goes to the one shown, as a drag does: Square's own values over the base.
  const style = () =>
    page.evaluate(() => {
      const d = window.dazbee?.design()
      return (
        { ...d?.nodes.headline?.props, ...d?.overrides['format:sq']?.headline } as { style: Record<string, unknown> }
      ).style
    })
  await select(page, ['headline'])
  await expect(page.getByTestId('bar-font')).toHaveText('Noto Sans')
  await expect(page.getByTestId('bar-size-field')).toHaveValue('64')
  const bold = page.getByTestId('bar-bold')
  await expect(bold).toHaveAttribute('aria-pressed', 'false')
  await bold.click()
  await expect.poll(async () => (await style()).fontWeight).toBe(700)
  await bold.click()
  await expect.poll(async () => (await style()).fontWeight).toBe(400)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await style()).fontWeight).toBe(700)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await style()).fontWeight).toBe(400)

  await page.getByRole('button', { name: 'Bigger' }).click()
  await expect.poll(async () => (await style()).fontSize).toBe(65)
  await page.getByTestId('bar-size-field').fill('40')
  await page.getByTestId('bar-size-field').press('Enter')
  await expect.poll(async () => (await style()).fontSize).toBe(40)
  await page.getByTestId('bar-underline').click()
  await expect.poll(async () => (await style()).underline).toBe(true)
  await expect(page.getByTestId('bar-underline')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('bar-strikethrough').click()
  await expect.poll(async () => (await style()).strikethrough).toBe(true)
  // One pop-up at a time, and opening one closes an open panel.
  await barMenu(page, 'spacing')
  await barMenu(page, 'align')
  await expect(page.locator('#edit-panel')).toHaveCount(0)
  await barMenu(page, 'list')
  await expect(page.getByTestId('bar-align-menu')).toBeHidden()
  expect(errors).toEqual([])
})

test('Tab reaches the top bar once and the arrows move along it; a panel takes the focus, Esc gives it back, and a second Esc clears the selection', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await select(page, ['box'])
  const bar = page.getByTestId('top-bar')
  await expect(bar.locator('[data-bar-item][tabindex="0"]')).toHaveCount(1)
  const items = bar.locator('[data-bar-item]')
  await items.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(items.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(items.first()).toBeFocused()

  await page.getByTestId('bar-effects').click()
  const panel = page.locator('#edit-panel')
  await expect(panel).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#edit-panel') !== null)).toBe(true)
  // Keys pressed in the panel are its own: Delete there leaves the layer.
  await page.keyboard.press('Delete')
  expect(await page.evaluate(() => Boolean(window.dazbee?.design().nodes.box))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('bar-effects')).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['box'])
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => window.dazbee?.selection())).toEqual([])
  expect(errors).toEqual([])
})

test('a panel closes when another layer is picked or its layer is removed, and the scope goes back to this size once nothing is selected', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await select(page, ['box'])
  await barMenu(page, 'position')
  await select(page, ['star'])
  await expect(page.locator('#edit-panel')).toHaveCount(0)
  await barMenu(page, 'position')
  await page.evaluate(() => window.dazbee?.session.run('node.delete', { ids: ['star'] }))
  await expect(page.locator('#edit-panel')).toHaveCount(0)

  await select(page, ['box'])
  await expect(page.getByTestId('scope-chip')).toHaveText(/Only Square/)
  await page.getByTestId('scope-chip').click()
  await page.getByTestId('scope-menu').getByRole('radio', { name: 'All sizes' }).click()
  await expect(page.getByTestId('scope-chip')).toHaveText(/all sizes/i)
  await page.keyboard.press('Escape')
  await select(page, [])
  await select(page, ['box'])
  await expect(page.getByTestId('scope-chip')).toHaveText(/Only Square/)
  expect(errors).toEqual([])
})

test('undo and redo in the header pill: off with nothing to do, each a step, and a slider drag is one step', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const undo = page.getByTestId('undo')
  const redo = page.getByTestId('redo')
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  const opacity = () =>
    page.evaluate(() => {
      const d = window.dazbee?.design()
      return ({ ...d?.nodes.box?.props, ...d?.overrides['format:sq']?.box } as { opacity?: number }).opacity ?? 1
    })
  await select(page, ['box'])
  const menu = await barMenu(page, 'transparency')
  const field = menu.locator('[data-scrub="Opacity"]')
  const box = await field.boundingBox()
  if (!box) throw new Error('no opacity field')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (const dx of [-10, -20, -30, -40]) await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2)
  await page.mouse.up()
  await expect.poll(opacity).toBeLessThan(1)
  await page.keyboard.press('Escape')
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect.poll(opacity).toBe(1)
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect.poll(opacity).toBeLessThan(1)
  await expect(redo).toBeDisabled()
  expect(errors).toEqual([])
})

test('the small menu locks, duplicates and deletes; the full menu copies, pastes, hides in every size and keeps its menus beside', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const nodes = () => page.evaluate(() => Object.keys(window.dazbee?.design().nodes ?? {}).length)
  await page.evaluate(() => localStorage.removeItem('dazbee.copiedLayers'))
  await select(page, ['box'])
  const small = page.getByTestId('small-menu')
  await expect(small).toBeVisible()
  const lock = page.getByTestId('small-lock')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  const before = await nodes()
  await page.getByTestId('small-duplicate').click()
  await expect.poll(nodes).toBe(before + 1)
  await page.getByTestId('small-delete').click()
  await expect.poll(nodes).toBe(before)

  await select(page, ['box'])
  const menu = await moreMenu(page)
  await expect(menu.getByRole('button', { name: /^Paste/ })).toBeDisabled()
  await moreAction(page, 'Copy')
  await moreMenu(page)
  await moreAction(page, 'Paste')
  await expect.poll(nodes).toBe(before + 1)

  await select(page, ['box'])
  await moreAction(page, 'Hide in every size')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = window.dazbee?.design()
        return ['sq', 'st'].map(
          (f) => (({ ...d?.nodes.box?.props, ...d?.overrides[`format:${f}`]?.box }) as { visible?: boolean }).visible,
        )
      }),
    )
    .toEqual([false, false])
  // Order opens beside its row with the arrow and closes with the arrow back.
  const full = await moreMenu(page)
  await full.getByTestId('more-order').focus()
  await page.keyboard.press('ArrowRight')
  await expect((await moreSubmenu(page, 'order')).getByRole('button')).toHaveText([
    /^Bring to front/,
    /^Bring forward/,
    /^Send backward/,
    /^Send to back/,
  ])
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('more-order-menu')).toBeHidden()
  await expect(full).toBeVisible()
  expect(errors).toEqual([])
})

test('the small menu keeps out of a drag, and over a selection filling a phone it sits under the top bar with the full menu reachable', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const small = page.getByTestId('small-menu')
  await select(page, ['box'])
  const from = await screenPoint(page, 160, 280)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y + 20, { steps: 4 })
  await expect(small).toBeHidden()
  await page.mouse.up()
  await expect(small).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await select(page, ['photo'])
  await page.evaluate(() => {
    window.dazbee?.perform('zoomToSelection')
    for (let i = 0; i < 3; i++) window.dazbee?.zoomIn()
  })
  await settle(page)
  await expect(small).toBeVisible()
  const bar = await page.getByTestId('top-bar-row').boundingBox()
  const at = await small.boundingBox()
  expect(bar && at && at.y >= bar.y + bar.height).toBe(true)
  await moreMenu(page)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  expect(errors).toEqual([])
})

test('on a phone a panel is a sheet that hides the tab bar and dock, and it and a rail flyout close each other', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 390, height: 844 })
  await select(page, ['box'])
  await expect(page.locator('[data-zoom]')).toBeHidden()
  await barMenu(page, 'effects')
  const sheet = page.locator('#edit-panel')
  const box = await sheet.boundingBox()
  // 8 px from the stage's edges, the same on both sides.
  expect(box && box.x <= 8 && Math.abs(box.x - (390 - box.x - box.width)) <= 1).toBe(true)
  await expect(page.getByTestId('rail')).toBeHidden()
  await expect(page.locator('[data-dock]')).toBeHidden()
  await page.getByTestId('edit-panel-close').click()
  await expect(page.getByTestId('rail')).toBeVisible()
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await barMenu(page, 'effects')
  await expect(page.getByTestId('flyout')).toHaveCount(0)
  await page.getByTestId('edit-panel-close').click()
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await select(page, [])
  await expect(page.locator('[data-zoom]')).toBeVisible()
  expect(errors).toEqual([])
})

test('beside an open Layers flyout the top bar centres in the room left, and a right-click on a locked layer offers Unlock', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.locator('[data-panel="layers"]').click()
  await select(page, ['headline'])
  const flyout = await page.getByTestId('flyout').boundingBox()
  const bar = await page.getByTestId('top-bar-row').boundingBox()
  expect(flyout && bar && bar.x >= flyout.x + flyout.width).toBe(true)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  await page.locator('[data-panel="layers"]').click()

  await select(page, ['box'])
  await moreAction(page, 'Lock')
  await select(page, [])
  const at = await screenPoint(page, 160, 280)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const menu = page.getByTestId('stage-menu')
  await menu.getByRole('button', { name: /^Unlock/ }).click()
  await expect(menu).toBeHidden()
  await expect
    .poll(() => page.evaluate(() => Object.values(window.dazbee?.design().nodes.box?.lock ?? {}).some(Boolean)))
    .toBe(false)
  expect(errors).toEqual([])
})

test('in Arabic the edit panel opens at the start of the screen, which is its end side, and the top bar mirrors', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const designId = await seed(design(asset.id))
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await context.addCookies([{ name: 'locale', value: 'ar', url: 'http://localhost' }])
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await select(page, ['box'])
  await barMenu(page, 'effects')
  const panel = await page.locator('#edit-panel').boundingBox()
  expect(panel && panel.x <= 16).toBe(true)
  const items = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item] > *')].map(
      (el) => el.getBoundingClientRect().x,
    ),
  )
  // The first item is the furthest right.
  expect(items[0]).toBeGreaterThan(items.at(-1) ?? Infinity)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  writeOutput('top-bar-rtl.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
})

test("at tablet size with a flyout open, the bar's second row and its pop-ups and panels never scroll the stage, and nothing meets", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.locator('[data-panel="layers"]').click()
  await select(page, ['headline'])
  const scrolled = () =>
    page.evaluate(() => [document.querySelector('main')?.scrollLeft, document.querySelector('main')?.scrollTop])
  for (const id of ['transparency', 'position', 'font', 'effects']) {
    await barMenu(page, id)
    await settle(page)
    expect(await scrolled()).toEqual([0, 0])
    await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
})

test("the full menu opens clear of the small menu, also flipped at the stage's end, and the right-click menu clear of the dock", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 1280, height: 760 })
  await select(page, ['turned'])
  // The selection by the stage's end edge, so the full menu has no room beside the small menu there.
  await page.evaluate(() => {
    const camera = window.dazbee?.camera()
    const box = window.dazbee?.selectionRect()
    if (camera && box)
      window.dazbee?.setCamera({ ...camera, x: camera.x - (1150 - (box.x + box.width / 2)) / camera.zoom })
  })
  await settle(page)
  await moreMenu(page)
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  await page.keyboard.press('Escape')

  await select(page, [])
  await page.evaluate(() => window.dazbee?.fitAll())
  await settle(page)
  const at = await screenPoint(page, 410, 290)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect(page.getByTestId('stage-menu')).toBeVisible()
  // The right-click menu is one of the pop-ups the check keeps clear of everything else.
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  expect(errors).toEqual([])
})

test("Esc closes the bar's second row and keeps the selection; the arrows and End reach only the items that show", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await select(page, ['headline'])
  const more = page.getByTestId('bar-overflow')
  await expect(more).toBeVisible()
  const row = page.getByTestId('top-bar-row')
  await row.locator('[data-bar-item]').first().focus()
  await page.keyboard.press('End')
  await expect(more).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row.locator('[data-bar-item]').first()).toBeFocused()

  await more.click()
  await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('top-bar-overflow')).toBeHidden()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('the size field steps with the arrows; a pop-up closes when the window changes size; a new selection shows the phone bar from its start', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const size = () =>
    page.evaluate(() => {
      const d = window.dazbee?.design()
      return (
        { ...d?.nodes.headline?.props, ...d?.overrides['format:sq']?.headline } as { style: { fontSize: number } }
      ).style.fontSize
    })
  await select(page, ['headline'])
  await page.getByTestId('bar-size-field').click()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect.poll(size).toBe(66)
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(size).toBe(56)

  await barMenu(page, 'align')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('bar-align-menu')).toBeHidden()

  const row = page.getByTestId('top-bar-row')
  await row.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  await select(page, ['box'])
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(0)
  expect(errors).toEqual([])
})

test('⋯ on the top bar leaves an open panel open, and Esc closes the panel first wherever the focus is', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await select(page, ['headline'])
  await barMenu(page, 'font')
  await page.getByTestId('bar-overflow').click()
  await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
  await expect(page.locator('#edit-panel')).toBeVisible()
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Escape')
  await expect(page.locator('#edit-panel')).toHaveCount(0)
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['headline'])
  expect(errors).toEqual([])
})
