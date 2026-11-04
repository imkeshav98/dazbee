// Signing in and out against WorkOS test mode, as the test user of WorkOS's staging environment.
// It runs where WORKOS_API_KEY, WORKOS_CLIENT_ID, WORKOS_TEST_EMAIL and WORKOS_TEST_PASSWORD are set,
// so the API has WorkOS sign-in on: CI's workos-sign-in job, or a run on the PC with them exported.
// Each first sign-in makes a WorkOS organization, which the run deletes again.
import { join } from 'node:path'

import { WorkspaceSummary } from '@dazbee/schema'

import { OUTPUT } from '../../support/editor.ts'
import { API_URL } from '../../support/seed.ts'
import { expect, type Page, test } from '../../support/test.ts'

const {
  WORKOS_API_KEY: apiKey,
  WORKOS_CLIENT_ID: clientId,
  WORKOS_TEST_EMAIL: email,
  WORKOS_TEST_PASSWORD: password,
} = process.env

test.skip(!apiKey || !clientId || !email || !password, 'needs the WorkOS keys and test user')

const SESSION_COOKIE = 'dazbee_session'
/** A run takes about a minute; an organization of the test user's older than this was left by a stopped run. */
const STALE_MS = 15 * 60_000

/** The workspace this run signed in to, whose WorkOS organization it deletes at the end. */
let workspaceId: string | null = null

/** A WorkOS organization, as far as the clean-up reads it. */
interface WorkosOrganization {
  /** The workspace id, on organizations Dazbee made. */
  external_id: string | null
  created_at: string
}

/** Calls the WorkOS API with the staging key; a GET answers JSON, a DELETE only its status. */
async function workos(path: string, method: 'GET' | 'DELETE' = 'GET') {
  const response = await fetch(`https://api.workos.com${path}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error(`WorkOS ${method} ${path}: ${response.status}`)
  return method === 'GET' ? ((await response.json()) as unknown) : null
}

/** Deletes the WorkOS organizations Dazbee made for the test user's workspaces that `keep` refuses. */
async function deleteTestOrganizations(keep: (org: WorkosOrganization) => boolean) {
  const users = (await workos(`/user_management/users?email=${encodeURIComponent(email ?? '')}`)) as {
    data: { id: string }[]
  }
  for (const user of users.data) {
    const memberships = (await workos(`/user_management/organization_memberships?user_id=${user.id}`)) as {
      data: { organization_id: string }[]
    }
    for (const { organization_id: id } of memberships.data) {
      const org = (await workos(`/organizations/${id}`)) as WorkosOrganization
      // Only organizations Dazbee made carry a workspace id.
      if (org.external_id && !keep(org)) await workos(`/organizations/${id}`, 'DELETE')
    }
  }
}

/** Signs the test user in on WorkOS's hosted page, picking an organization when it asks for one. */
async function signInAtWorkos(page: Page) {
  await page.getByRole('textbox', { name: /email/i }).fill(email ?? '')
  await page.getByRole('button', { name: 'Continue with email' }).click()
  await page
    .getByLabel(/password/i)
    .first()
    .fill(password ?? '')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const origin = new URL(page.url()).origin
  await page.waitForURL((url) => url.origin !== origin || url.pathname === '/organization-selection', {
    timeout: 30_000,
  })
  // A person in several organizations picks one; another run's organization can make it two. Every
  // workspace of the test user's is named after them.
  if (new URL(page.url()).pathname === '/organization-selection') {
    await page.getByRole('button', { name: 'Dazbee E2E' }).first().click()
    await page.waitForURL((url) => url.origin !== origin, { timeout: 30_000 })
  }
}

test.beforeAll(async () => {
  await deleteTestOrganizations((org) => Date.now() - Date.parse(org.created_at) < STALE_MS)
})

test.afterAll(async () => {
  if (workspaceId) await deleteTestOrganizations((org) => org.external_id !== workspaceId)
})

test('signs in with WorkOS to a workspace of their own, and signs out of WorkOS too', async ({
  page,
  context,
  allowProblems,
}) => {
  // WorkOS's hosted page logs its own console errors; our pages are still held to none.
  allowProblems(/^console error: .* \(https:\/\/[\w-]+\.authkit\.app\//)
  await page.goto('/login')
  await page.getByTestId('sign-in').click()
  await page.waitForURL(/authkit\.app/)
  await signInAtWorkos(page)
  // A workspace without brands starts at onboarding.
  await expect(page).toHaveURL(/\/welcome$/)
  const token = (await context.cookies()).find((c) => c.name === SESSION_COOKIE)?.value
  expect(token, 'the session cookie').toBeTruthy()
  const response = await fetch(`${API_URL}/workspace`, { headers: { authorization: `Bearer ${token}` } })
  const workspace = WorkspaceSummary.parse(await response.json())
  workspaceId = workspace.id
  // A first workspace is named after its person.
  expect(workspace.name).toBe('Dazbee E2E')
  await page.screenshot({ path: join(OUTPUT, 'workos-signed-in.png') })

  await page.getByTestId('account-open').click()
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await context.cookies()).map((c) => c.name)).not.toContain(SESSION_COOKIE)

  // WorkOS ended its session as well: signing in again asks for the email.
  await page.getByTestId('sign-in').click()
  await page.waitForURL(/authkit\.app/)
  await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  await page.screenshot({ path: join(OUTPUT, 'workos-signed-out.png') })
})
