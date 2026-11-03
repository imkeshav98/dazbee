// The language picked in the account menu: the editor's words change at once, Arabic turns the
// chrome right to left, and the pick is kept after a reload, into Arabic and back to English.
import { editorPath, writeOutput } from '../support/editor.ts'
import { liveDesign, seed } from '../support/seed.ts'
import { expect, type Page, test } from '../support/test.ts'

test.use({ viewport: { width: 1440, height: 900 } })

/** Words of the editor in each language: the capsule's panels, the dock's Select tool, Share and the save state. */
const WORDS = {
  en: {
    dir: 'ltr',
    name: 'English',
    layers: 'Layers',
    assets: 'Assets',
    brand: 'Brand',
    select: 'Select',
    share: 'Share',
    saved: 'Saved',
  },
  ar: {
    dir: 'rtl',
    name: 'العربية',
    layers: 'الطبقات',
    assets: 'الملفات',
    brand: 'الهوية',
    select: 'تحديد',
    share: 'مشاركة',
    saved: 'تم الحفظ',
  },
} as const
type Locale = keyof typeof WORDS

/** Waits until the editor speaks the language: its words, the page's language and direction. */
async function speaks(page: Page, locale: Locale) {
  const words = WORDS[locale]
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('html')).toHaveAttribute('dir', words.dir)
  const rail = page.getByTestId('rail')
  for (const name of [words.layers, words.assets, words.brand])
    await expect(rail.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(
    page.locator('main > [role="toolbar"]').getByRole('button', { name: words.select, exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('share-open')).toHaveText(words.share)
  await expect(page.getByTestId('status')).toHaveText(words.saved)
}

/** Picks a language from the account menu, and closes the menu once the pick shows in it. */
async function pick(page: Page, locale: Locale) {
  await page.getByTestId('account-open').click()
  const language = page.getByTestId('account').getByRole('radio', { name: WORDS[locale].name, exact: true })
  await language.click()
  await expect(language).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('account')).toBeHidden()
}

async function reload(page: Page) {
  await page.reload()
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
}

test("the language picked in the account menu changes the editor's words at once and is kept after a reload", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const designId = await seed(liveDesign())
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await speaks(page, 'en')

  await pick(page, 'ar')
  await speaks(page, 'ar')
  writeOutput('language-0-arabic.png', await page.screenshot({ animations: 'disabled' }))
  await reload(page)
  await speaks(page, 'ar')
  await page.getByTestId('account-open').click()
  await expect(page.getByTestId('account').getByRole('radio', { name: WORDS.ar.name, exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  writeOutput('language-1-arabic-reloaded.png', await page.screenshot({ animations: 'disabled' }))
  await page.keyboard.press('Escape')

  await pick(page, 'en')
  await speaks(page, 'en')
  await reload(page)
  await speaks(page, 'en')
})
