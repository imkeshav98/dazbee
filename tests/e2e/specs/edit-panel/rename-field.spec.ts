// The four rename fields in Chromium: the design's name in the crumb, a size's name in the Sizes
// panel, a layer's name in the layers panel and a page's name in the Pages panel. Enter keeps the
// new name and Escape the old one; leaving the field keeps the new name. A field ends once: Enter
// followed by a blur before the field closes renames once, as one undo step, and Escape followed by
// a blur keeps the old name. Enter, and Escape in the design's name, give the focus back to the
// control that opened the field; Escape in a panel's field closes the panel too, and the focus goes
// to the item that opened the panel. The @evidence tests go through every way out of each field at
// the three screen sizes, with undo and redo, and record where the focus goes.
import type { DesignInput } from '@dazbee/schema'

import { shoot, writeOutput } from '../../support/editor.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { fitSettled, openStage, press, read } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { pagesPanel, sizesPanel } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: 'Rename fields',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 120,
        y: 120,
        width: 400,
        height: 300,
        shape: { kind: 'rect', cornerRadius: 16 },
        fills: [{ type: 'solid', color: '#E0262BFF' }],
      },
    },
  },
  overrides: {},
})

/** What has the focus: "the page" when nothing does, else the element's tag, role and name. */
const focusOf = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'the page'
    const role = el.getAttribute('role')
    const name = el.getAttribute('aria-label') ?? el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 40)
    return `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ''} "${name ?? ''}"`
  })

/**
 * Presses a key in a field and takes the focus out of it in the same task, before React redraws,
 * so the blur reaches the field while it is still open.
 */
const keyThenBlur = (field: Locator, key: 'Enter' | 'Escape') =>
  field.evaluate((input: HTMLInputElement, key) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }))
    input.blur()
  }, key)

interface Subject {
  /** The field's name in test titles and file names. */
  id: string
  /** The name the design starts with. */
  first: string
  /** The field's `name` attribute. */
  input: string
  /** The most characters the field takes, when it has a limit. */
  maxLength?: number
  /** Opens the rename field and returns it. */
  open: (page: Page) => Promise<Locator>
  /** The name as it is kept now. */
  name: (page: Page) => Promise<string | null | undefined>
  /** Whether undo and redo reach the name: the design's name is the library's, outside the document. */
  undoable: boolean
  /** What takes the focus back when the field ends with Enter: the control that opened it. */
  keyFocus: (page: Page) => Locator
  /**
   * What has the focus after Escape: the control that opened the field, or, where Escape closes the
   * panel the field is in as well, the item that opened the panel.
   */
  escapeFocus: (page: Page) => Locator
}

/** The four fields, in the order they appear on screen: the header, the rail, the bottom. */
const SUBJECTS: Subject[] = [
  {
    id: 'design',
    first: 'Rename fields',
    input: 'design-name',
    maxLength: 120,
    open: async (page) => {
      await page.getByRole('heading', { level: 1 }).getByRole('button').click()
      return page.locator('input[name="design-name"]')
    },
    name: (page) => page.getByRole('heading', { level: 1 }).textContent(),
    undoable: false,
    keyFocus: (page) => page.getByRole('heading', { level: 1 }).getByRole('button'),
    escapeFocus: (page) => page.getByRole('heading', { level: 1 }).getByRole('button'),
  },
  {
    id: 'size',
    first: 'Story',
    input: 'format-name',
    open: async (page) => {
      const panel = await sizesPanel(page)
      await panel
        .locator('[data-format="story"]')
        .getByRole('button', { name: /^Rename: / })
        .dblclick()
      return panel.locator('input[name="format-name"]')
    },
    name: async (page) => (await read(page)).formats.story?.name,
    undoable: true,
    keyFocus: (page) =>
      page
        .getByTestId('bar-sizes-menu')
        .locator('[data-format="story"]')
        .getByRole('button', { name: /^Rename: / }),
    escapeFocus: (page) => page.getByTestId('sizes-button'),
  },
  {
    id: 'layer',
    first: 'Box',
    input: 'layer-name',
    maxLength: 120,
    open: async (page) => {
      const tree = page.getByRole('tree')
      if (!(await tree.isVisible())) await page.locator('[data-panel="layers"]').click()
      await expect(tree).toBeVisible()
      await tree.locator('[data-layer="box"] [data-testid="layer-name"]').dblclick()
      return tree.locator('input[name="layer-name"]')
    },
    name: async (page) => (await read(page)).nodes.box?.name,
    undoable: true,
    keyFocus: (page) => page.getByRole('tree').locator('[data-layer="box"]'),
    escapeFocus: (page) => page.getByRole('tree').locator('[data-layer="box"]'),
  },
  {
    id: 'page',
    first: 'Page 1',
    input: 'page-name',
    open: async (page) => {
      const panel = await pagesPanel(page)
      await panel
        .locator('[data-page="p1"]')
        .getByRole('button', { name: /^Show / })
        .dblclick()
      return panel.locator('input[name="page-name"]')
    },
    name: async (page) => (await read(page)).pages.p1?.name,
    undoable: true,
    keyFocus: (page) =>
      page
        .getByTestId('bar-pages-menu')
        .locator('[data-page="p1"]')
        .getByRole('button', { name: /^Show / }),
    escapeFocus: (page) => page.getByTestId('pages-button'),
  },
]

for (const s of SUBJECTS.filter(({ id }) => id === 'size' || id === 'page')) {
  test(`a ${s.id}'s name: Enter, then a blur before the field closes, renames it once, as one undo step`, async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    const field = await s.open(page)
    await expect(field).toBeFocused()
    await field.fill('Offer')
    await keyThenBlur(field, 'Enter')
    await expect(field).toHaveCount(0)
    await expect.poll(() => s.name(page)).toBe('Offer')
    await press(page, 'undo')
    await expect.poll(() => s.name(page), { message: 'one undo brings the old name back' }).toBe(s.first)
    await press(page, 'redo')
    await expect.poll(() => s.name(page)).toBe('Offer')
    expect(errors).toEqual([])
  })

  test(`a ${s.id}'s name: Escape, then a blur before the field closes, keeps the old name`, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    const field = await s.open(page)
    await field.fill('Never kept')
    await keyThenBlur(field, 'Escape')
    await expect(field).toHaveCount(0)
    await page.evaluate(() => window.dazbee?.drawn())
    expect(await s.name(page)).toBe(s.first)
    expect(errors).toEqual([])
  })
}

for (const s of SUBJECTS.filter(({ id }) => id !== 'layer')) {
  test(`the ${s.id}'s name: Enter gives the focus back to the control that opened the field`, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    const field = await s.open(page)
    await field.fill('Offer')
    await field.press('Enter')
    await expect(field).toHaveCount(0)
    await expect.poll(() => s.name(page)).toBe('Offer')
    await expect(s.keyFocus(page)).toBeFocused()
    expect(errors).toEqual([])
  })
}

for (const s of SUBJECTS.filter(({ id }) => id === 'design')) {
  test(`the ${s.id}'s name: Escape gives the focus back to the control that opened the field`, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    const field = await s.open(page)
    await field.fill('Never kept')
    await field.press('Escape')
    await expect(field).toHaveCount(0)
    await expect(s.escapeFocus(page)).toBeFocused()
    expect(await s.name(page)).toBe(s.first)
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const s of SUBJECTS) {
    test(
      `at ${width}×${height} the ${s.id} name field: Enter, Escape, Escape then blur, Tab, Enter then blur, undo and redo`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openStage(browser, design())
        await page.setViewportSize({ width, height })
        await fitSettled(page)
        await page.evaluate(() => window.dazbee?.drawn())
        // The renames the design's name sends to the server, by the name they send.
        const sent: string[] = []
        page.on('request', (request) => {
          const body = request.postData()
          if (request.method() === 'POST' && request.headers()['next-action'] && body) sent.push(body)
        })
        const sentWith = (name: string) => sent.filter((body) => body.includes(name)).length
        const focus: Record<string, string> = {}
        const shot = (step: string) => shoot(page, `rename-field-${width}-${s.id}-${step}`)
        const closed = () => expect(page.locator(`input[name="${s.input}"]`)).toHaveCount(0)

        // Enter keeps the new name.
        let field = await s.open(page)
        await expect(field).toBeFocused()
        await expect(field).toHaveValue(s.first)
        if (s.maxLength) await expect(field).toHaveAttribute('maxlength', String(s.maxLength))
        else await expect(field).not.toHaveAttribute('maxlength')
        await field.fill('Spring offer')
        await shot('1-open')
        await field.press('Enter')
        await closed()
        await expect.poll(() => s.name(page)).toBe('Spring offer')
        focus.enter = await focusOf(page)
        await expect(s.keyFocus(page)).toBeFocused()
        await shot('2-enter')
        // Undo brings the old name back and redo the new one, each in one step.
        if (s.undoable) {
          await press(page, 'undo')
          await expect.poll(() => s.name(page)).toBe(s.first)
          focus.undo = await focusOf(page)
          await press(page, 'redo')
          await expect.poll(() => s.name(page)).toBe('Spring offer')
          focus.redo = await focusOf(page)
        } else {
          // The design's name is kept by the library: undo leaves it as it is.
          await press(page, 'undo')
          await expect.poll(() => s.name(page)).toBe('Spring offer')
          expect(sentWith('Spring offer')).toBe(1)
        }

        // Escape keeps the old name.
        field = await s.open(page)
        await expect(field).toHaveValue('Spring offer')
        await field.fill('Never kept')
        await field.press('Escape')
        await closed()
        await expect.poll(() => s.name(page)).toBe('Spring offer')
        expect(sentWith('Never kept')).toBe(0)
        focus.escape = await focusOf(page)
        await expect(s.escapeFocus(page)).toBeFocused()
        await shot('3-escape')

        // Escape, then a blur before the field closes: the old name stays.
        field = await s.open(page)
        await field.fill('Never kept')
        await keyThenBlur(field, 'Escape')
        await closed()
        await page.evaluate(() => window.dazbee?.drawn())
        expect(await s.name(page)).toBe('Spring offer')
        expect(sentWith('Never kept')).toBe(0)
        focus.escapeThenBlur = await focusOf(page)

        // Leaving the field with Tab keeps the new name.
        field = await s.open(page)
        await field.fill('Summer offer')
        await field.press('Tab')
        await closed()
        await expect.poll(() => s.name(page)).toBe('Summer offer')
        focus.tab = await focusOf(page)
        await shot('4-tab')

        // Enter, then a blur before the field closes: renamed once, as one undo step.
        field = await s.open(page)
        await field.fill('Autumn offer')
        await keyThenBlur(field, 'Enter')
        await closed()
        await expect.poll(() => s.name(page)).toBe('Autumn offer')
        focus.enterThenBlur = await focusOf(page)
        await shot('5-enter-then-blur')
        if (s.undoable) {
          await press(page, 'undo')
          await expect
            .poll(() => s.name(page), { message: 'one undo brings the name before back' })
            .toBe('Summer offer')
          await press(page, 'redo')
          await expect.poll(() => s.name(page)).toBe('Autumn offer')
        } else {
          await expect.poll(() => sentWith('Autumn offer')).toBe(1)
        }

        // A name of spaces alone, or the same name, keeps the name and adds no undo step.
        field = await s.open(page)
        await field.fill('   ')
        await field.press('Enter')
        await closed()
        field = await s.open(page)
        await field.fill(' Autumn offer ')
        await field.press('Enter')
        await closed()
        await expect.poll(() => s.name(page)).toBe('Autumn offer')
        if (s.undoable) {
          await press(page, 'undo')
          await expect.poll(() => s.name(page)).toBe('Summer offer')
        } else {
          expect(sentWith('Autumn offer')).toBe(1)
        }

        writeOutput(`rename-field-${width}-${s.id}-focus.json`, JSON.stringify(focus, null, 2))
        expect(errors).toEqual([])
      },
    )
  }
}
