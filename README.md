# Dazbee

Formerly Razzlr. The local Postgres and storage (user, database, bucket and keys in `docker-compose.yml`) and the browser's offline copy of each design (IndexedDB `razzlr-design-<id>`) keep the old name, so data made before the rename still opens.

## Develop

Needs Node 22.18 or later (CI and docker compose run Node 26) and pnpm 12 (`npm install -g pnpm@12`).

```sh
pnpm install
pnpm dev --filter @dazbee/web   # http://localhost:3000
pnpm lint        # dependency direction + ESLint
pnpm typecheck
pnpm test        # Vitest
pnpm build && pnpm e2e   # Playwright (run `pnpm --filter @dazbee/e2e exec playwright install chromium` once)
```

Off CI, `pnpm e2e` starts its own API (8797), sync server (1244) and web app (3110) over a `razzlr_e2e` database and a `razzlr-e2e` bucket, next to docker compose's Postgres and storage, so a run never writes into the workspace of your local site.

## Layout

```
apps/web/             Next.js app: sign-in, brands, designs, brand kit, asset library, font catalog, templates, settings and the editor's UI
apps/api/             Hono API: workspace records, uploads, sign-in, sync tokens and server renders; runs the migrations (ADR-0009, ADR-0012)
apps/sync/            Hocuspocus server that keeps each design's Yjs state (ADR-0009)
packages/schema/      the zod contract for the design document and the API (ADR-0002)
packages/doc/         the Yjs design document and the commands that change it (ADR-0004)
packages/canvaskit/   our CanvasKit build, loaded by every runtime (ADR-0005)
packages/renderer/    lays out and draws a design with CanvasKit
packages/editor/      the client-only editor: canvas, tools, gestures, sync and offline copy
packages/export/      PNG, JPG, PDF and SVG exports, and their zips (ADR-0005)
packages/svg/         turns an SVG file into layers
packages/fonts/       the font files we ship, the Google font catalog list and their Node loader
packages/db/          Drizzle tables and migrations (ADR-0009)
packages/storage/     object storage over the S3 API (ADR-0010)
packages/sync-token/  tokens the API signs for the sync server
packages/config/      shared tsconfig, ESLint and Vitest presets; the dependency-direction check
tests/e2e/            Playwright user flows
tests/pixels/         Vitest and Playwright checks: exports against reference renders, browser exports against Node's, the WebGL stage's drift from the CPU export
```

Packages only depend downward: schema → doc → renderer → editor, and never on an app. `pnpm lint:deps` enforces it (ADR-0001).

Inside each workspace, code is laid out by `docs/agents/code-layout.md`: feature folders, one order inside every file, and the imports each folder may make.

## Vercel previews

One-time setup by the repo owner: in Vercel, **Add New → Project**, import `imkeshav98/dazbee`, set **Root Directory** to `apps/web` (framework Next.js; Vercel detects pnpm and the workspace). Every pull request then gets a preview URL.
