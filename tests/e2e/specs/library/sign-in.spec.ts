// Sign-in (#58) in Chromium, as far as it goes without WorkOS: the sign-in page, a callback that
// does not match the sign-in this browser started, and signing out. CI's API has no WorkOS
// settings, so it says sign-in is not set up; signing in against WorkOS test mode is its own run.
import { join } from 'node:path'

import { OUTPUT } from '../../support/editor.ts'
import { expect, test } from '../../support/test.ts'

const SESSION_COOKIE = 'dazbee_session'

test('the sign-in page offers one button, and says when sign-in is not set up', async ({ page }) => {
  // Notes, in the page's own clock, when the sign-in action's answer has arrived and when the notice
  // is first in the page.
  await page.addInitScript(() => {
    const times: { answer?: number; notice?: number } = {}
    Object.assign(window, { signInTimes: times })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (entry.initiatorType === 'fetch' && new URL(entry.name).pathname === '/login')
          times.answer ??= entry.responseEnd
      }
    }).observe({ type: 'resource' })
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="sign-in-notice"]')) times.notice ??= performance.now()
    }).observe(document, { subtree: true, childList: true })
  })
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Make every size, for every client.' })).toBeVisible()
  await expect(page).toHaveTitle('Sign in to Dazbee')
  await expect(page.getByTestId('sign-in-notice')).toHaveCount(0)
  // The suite's Chromium draws in software, where every turn of the blurred aurora redraws the
  // blur; the aurora holds still there, so the page has time for the click's answer.
  await expect(page.locator('html')).toHaveAttribute('data-render', 'software')
  const aurora = await page.locator('.signin-aurora > div').evaluate((el) => el.getAnimations().map((a) => a.playState))
  expect(
    aurora.every((state) => state !== 'running'),
    `the aurora's animations: ${aurora.join(', ')}`,
  ).toBe(true)
  // The click starts the server action whose answer sends the page to the notice.
  await Promise.all([
    page.waitForURL(/\/login\?unavailable=1$/, { timeout: 20_000 }),
    page.getByTestId('sign-in').click(),
  ])
  await expect(page.getByTestId('sign-in-notice')).toHaveText('Sign-in is not set up on this server yet.')
  const times = await page.evaluate(
    () => (window as unknown as { signInTimes: { answer?: number; notice?: number } }).signInTimes,
  )
  expect(times.answer, 'the sign-in action answered').toBeDefined()
  const answerToNotice = (times.notice ?? Infinity) - (times.answer ?? 0)
  test.info().annotations.push({ type: 'answer to notice', description: `${Math.round(answerToNotice)} ms` })
  expect(answerToNotice, 'ms from the action answer to the notice').toBeLessThan(1000)
  await page.screenshot({ path: join(OUTPUT, 'sign-in-page.png') })
})

test('a callback refuses a state this browser did not start with, and keeps no session', async ({ page, context }) => {
  await page.goto('/callback?code=made-up&state=not-the-one-we-started')
  await expect(page).toHaveURL(/\/login\?error=1$/)
  await expect(page.getByTestId('sign-in-notice')).toHaveText('That sign-in did not work. Try again.')
  expect((await context.cookies()).map((c) => c.name)).not.toContain(SESSION_COOKIE)
})

test('signing out forgets the session and lands on the sign-in page', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByTestId('sign-out')).toHaveCount(0)
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: 'a-session-token',
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.reload()
  await page.getByTestId('account-open').click()
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await context.cookies()).map((c) => c.name)).not.toContain(SESSION_COOKIE)
})

test('a sign-out from another site is refused', async ({ request }) => {
  const response = await request.post('/logout', { headers: { 'sec-fetch-site': 'cross-site' }, maxRedirects: 0 })
  expect(response.status()).toBe(403)
})
