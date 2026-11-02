// Off CI, the browser suite runs against servers of its own (#141): an API and a sync server on
// their own ports, over a database and a storage bucket of their own, so a run on a developer's
// machine never writes into the workspace their local site shows. CI's servers are thrown away
// after each run, so it uses docker compose's as before. A POST to /restart-sync on the control port
// restarts the suite's sync server and answers once the new one is listening.
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const LOCAL = { api: 8797, sync: 1244, web: 3110, control: 1245 } as const
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SERVER = 'postgres://razzlr:razzlr-local@127.0.0.1:55432'
/** The suite's own database, on docker compose's Postgres server. */
export const DATABASE = 'razzlr_e2e'

/** Makes the suite's database once; the API brings it up to the latest migration as it starts. */
async function ensureDatabase() {
  // pg comes with @dazbee/db; the suite doesn't depend on it directly.
  const pg = createRequire(new URL('../../../packages/db/package.json', import.meta.url))('pg') as {
    Client: new (options: { connectionString: string }) => {
      connect(): Promise<void>
      query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>
      end(): Promise<void>
    }
  }
  const client = new pg.Client({ connectionString: `${SERVER}/razzlr` })
  await client.connect()
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DATABASE])
    if (found.rowCount === 0) await client.query(`CREATE DATABASE ${DATABASE}`)
  } finally {
    await client.end()
  }
}

/** The suite's own database and storage bucket. */
export const SUITE_STORE = {
  DATABASE_URL: `${SERVER}/${DATABASE}`,
  STORAGE_ENDPOINT: 'http://127.0.0.1:59000',
  STORAGE_BUCKET: 'razzlr-e2e',
  STORAGE_ACCESS_KEY_ID: 'razzlr',
  STORAGE_SECRET_ACCESS_KEY: 'razzlr-local-secret',
  STORAGE_REGION: 'us-east-1',
}

const env = {
  ...process.env,
  ...SUITE_STORE,
  SYNC_TOKEN_SECRET: 'local-only-sync-token-secret-0000',
  DAZBEE_DEV_SESSION: 'on',
  API_PORT: String(LOCAL.api),
  SYNC_PORT: String(LOCAL.sync),
  STORAGE_PUBLIC_ENDPOINT: 'http://127.0.0.1:59000',
  STORAGE_CREATE_BUCKET: 'on',
}

const stopWithChild = (code: number | null) => process.exit(code ?? 1)

/** Starts a server from the checkout and stops this process when it stops. */
function run(script: string) {
  const child = spawn(process.execPath, [script], { cwd: ROOT, env, stdio: 'inherit' })
  child.on('exit', stopWithChild)
  return child
}

/** Waits up to a minute for a server to answer `url`; whether it did. */
async function answers(url: string) {
  for (let i = 0; i < 120; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/** Stops the sync server and starts a new one in its place. */
async function restartSync(sync: ChildProcess) {
  sync.off('exit', stopWithChild)
  const stopped = new Promise((resolve) => sync.once('exit', resolve))
  sync.kill()
  await stopped
  return run('apps/sync/src/main.ts')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ensureDatabase()
  const api = run('apps/api/src/main.ts')
  // The sync server waits for the API's migrations: it starts once the API answers.
  await answers(`http://127.0.0.1:${LOCAL.api}/health`)
  let sync = run('apps/sync/src/main.ts')
  createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/restart-sync') return void response.writeHead(404).end()
    void restartSync(sync).then(async (next) => {
      sync = next
      response.writeHead(await answers(`http://127.0.0.1:${LOCAL.sync}`) ? 200 : 503).end()
    })
  }).listen(LOCAL.control, '127.0.0.1')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { api.kill(); sync.kill(); process.exit(0) })
}
