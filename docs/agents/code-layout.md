# Code layout

Where code goes, the order inside each file, and the imports each folder may make. Lint checks some of these rules and `/code-review` checks the rest on every PR (see [What checks the rules](#what-checks-the-rules)).

## Adding or moving code

1. **Place it.** Pick the workspace, folder and file by [Where code lives](#where-code-lives). Search the packages below yours for a helper or type before writing one. Done when the file holds one feature, and the code sits in the lowest workspace all its users depend on.
2. **Order it.** Keep the whole file in its order: [Order inside a file](#order-inside-a-file), or its kind under [Files with their own order](#files-with-their-own-order). Done when every section of the file sits in its place in that order.
3. **Import it.** Check every import against [Imports](#imports) for its workspace. Done when each import is one its folder may make.
4. **Check it.** `pnpm lint`, `pnpm typecheck` and the unit tests of each touched workspace pass. When you moved code, madge finds no value-import cycle in each workspace you moved code in ([Import cycles](#import-cycles)), and each test runner collects as many tests as before (Tests, under [Where code lives](#where-code-lives)).
5. **Commit it.** Code moved to another file lands as a move commit, then an edit commit ([Moving code](#moving-code)). Done when each move commit holds only the changes a move may make, and the PR body names it.

## Moving code

A split, or any move of code to another file, lands in two commits:

1. **The move commit** carries the code over unchanged. It may change only imports, exports, indentation, and how a moved function reaches state it used to capture: a closure variable becomes a parameter or a dependency.
2. **The edit commit** holds every other change.

Review the move commit with:

```sh
git diff --color-moved=dimmed-zebra --color-moved-ws=allow-indentation-change <move commit>~ <move commit>
```

Moved lines show dimmed. Done when every line in full colour is one of the changes a move commit may make.

The PR body says which commits are moves.

## Where code lives

**By kind inside a file, by feature across files.** Inside a file, types, constants and functions sit in sections in a fixed order ([Order inside a file](#order-inside-a-file)). Across files, code is split by feature: a file holds one feature. A folder gets a `types.ts` only when two or more of its files share those types; otherwise a type sits in the file that uses it. Helpers, types and constants live with the feature they serve.

**Shared code moves down.** A helper or type that more than one workspace uses lives in the lowest package all its users depend on: usually `@dazbee/schema` for contract types and helpers over contract values, or `@dazbee/doc` for the layer tree and commands. It exists there once, and its users import it. Which package sits below which: [Between workspaces](#between-workspaces).

**Feature folders.** Name a folder for the feature it holds (`gestures/`, `edit-panel/`, `fonts/`), never for a kind of code (`routes/`, `services/`, `utils/`, `helpers/`, `constants/`). Two folders hold shared pieces rather than one feature: `apps/web/components/ui/` holds shared controls, and `tests/e2e/support/` holds shared test helpers. A folder stays flat until it has about 15 files; past 20, group the files that change together into a subfolder.

**Names.**

- Name files and exports after what they hold, in `GLOSSARY.md`'s terms.
- When a file no longer holds what its name says, rename it.
- Stored and wire names never change: IndexedDB names, `localStorage` and `sessionStorage` keys, cookies, the service worker's cache name, the Yjs root map names, and drag and clipboard MIME types.

**Size.**

- Keep files under 400 lines.
- Lint fails a TypeScript file with more than 500 lines of code. Blank lines and comment lines don't count, and test files count like any other. The message catalogs (`apps/web/lib/i18n/**`) and generated or vendored files are exempt.
- A file that is one deep module over the limit opens with `/* eslint-disable max-lines -- one deep module: <reason> */`. The files that open with it are the only ones that may; any other file over the limit is split.
- Split a big file only into deep modules. Each new module hides behaviour behind a small interface and passes the deletion test: if the module were deleted, its complexity would reappear in its callers. See `.claude/skills/codebase-design/SKILL.md`.
- A big file is better than several shallow ones, meaning modules whose interface is nearly as large as what they hide.

**Tests.**

- A unit test sits next to its module and is named after it: `snap.test.ts` beside `snap.ts`.
- A test-only module, imported by tests and never by the app, is named `test-*.ts` (`test-design.ts`).
- A browser test helper that two or more spec files use goes in `tests/e2e/support/`. A helper that one spec uses stays at the top of that spec, or at the top of the `describe` it belongs to.
- Specs live in area folders under `tests/e2e/specs/` (`library/`, `canvas/`, `top-bar/` …).
- A runner collects only the files its config matches: the `include` of the workspace's Vitest config (the packages share `src/**/*.test.ts` from `packages/config/vitest.preset.js`), and `testDir` in `tests/e2e/playwright.config.ts`. A test moved outside them stops running while CI stays green. Count before and after a move, with `pnpm --filter <workspace> exec vitest list` for each touched workspace and `pnpm --filter @dazbee/e2e exec playwright test --list`; the counts match. A move across a config's glob updates the glob.

## Order inside a file

Every TypeScript file follows this order, except the kinds under Files with their own order:

1. The directive (`'use client'`), if any.
2. A header comment saying what the module does, when the file name doesn't say it.
3. Imports, in these groups. `eslint --fix` puts them in the groups and sorts each group (`eslint-plugin-simple-import-sort`).
   1. Side-effect imports (`import 'server-only'`, `import './globals.css'`). They keep their order among themselves.
   2. `node:` built-ins.
   3. npm packages.
   4. `@dazbee/*`.
   5. `@/` (only in `apps/web`).
   6. `./` (and `../` outside `apps/web`).
4. Exported types and interfaces.
5. Private types.
6. Constants: exported ones first, then private ones.
7. Module state (`let` variables, caches, listener sets), if the module has any.
8. Exported functions, with the main one first.
9. Private helpers, in the order the code above first uses them.

**Declare before use.** Everything is declared above its first use, except a function declaration (`function name() {}`), which a function body may call from above it. So a private helper that sits below its first use is a function declaration, and a const arrow function, a constant, a class or a type (type references count) sits above its first use. `@typescript-eslint/no-use-before-define` checks this.

Two types that refer to each other are the one exception: above the line in the first type that names the second, put `// eslint-disable-next-line @typescript-eslint/no-use-before-define -- the types refer to each other`. Nothing else disables `no-use-before-define` or `max-lines`, apart from the one override under Size.

A table built while the module loads keeps its helpers above it, because they must exist when the table is built.

## Files with their own order

These orders replace the main one for their kind of file.

**React component files:**

1. The directive.
2. The header comment.
3. Imports.
4. Exported types.
5. Private types.
6. Constants.
7. Private pure helpers (no hooks, no JSX).
8. Hooks: exported ones, then private ones.
9. The exported component or components, with the main one first.
10. Private components, in the order the main one renders them. They sit below their first use, so each is a function declaration.

**Schema files** (`packages/schema`):

- Each zod schema is followed by its type: `export type X = z.infer<typeof X>`.
- A building block that only one schema uses sits directly above that schema.
- Functions come after all the schemas.

**Factory modules.** A factory module is a function that owns state and returns an interface, such as `exportClient`. Inside the function:

1. The dependencies it is given.
2. Its state, each piece with a one-line comment.
3. What it creates and must free.
4. Queries, then the functions that change its state or the design.
5. Listener wiring.
6. The returned object. Each member is one line that points to a named function, and `destroy()` comes last, freeing things in reverse order of creation.

**Spec files** (`tests/e2e/specs`):

1. The header.
2. Imports.
3. `test.describe.configure` and `test.use`.
4. Constants.
5. Fixture builders.
6. Readers (helpers that read the page), then actions (helpers that drive it).
7. `beforeAll`.
8. The tests, grouped in the order the feature's controls appear on screen, from top to bottom and from start to end.

A spec that tests separate groups wraps each group in a `test.describe`, with that group's helpers at the top of it.

**Unit test files:**

1. Fixtures.
2. One `describe` per export, in the order the module declares its exports.

## Imports

### Between workspaces

Import another workspace by its package name (`@dazbee/doc`), declared in the importing workspace's `package.json`. Packages depend only downward, schema → doc → renderer → editor, and never on an app (ADR-0001). `pnpm lint:deps` checks the declared dependencies, and the ADR-0001 pattern in the shared ESLint preset fails a relative import into another workspace.

### In `apps/web`

- `@/` points at the app's root, `apps/web/`.
- An import of a file outside its own folder uses `@/` (`@/lib/i18n`). An import of a sibling uses `./`.
- Lint fails `../` imports and relative imports into a subfolder (`./x/y`). So every import between folders reads `@/<folder>/…`, and the table below is checked from the import's text.

Each folder may import only what this table lists, plus npm packages and `@dazbee/*`. `no-restricted-imports` checks it.

| Folder | May import |
|---|---|
| `components/ui/` | `lib/` root files, `lib/i18n/` |
| `components/library/`, `components/brands/`, `components/brief/` | `components/ui/`, `components/brand-kit/`, each other, `lib/` root files, `lib/i18n/`, `lib/server/` |
| `components/brand-kit/` | `components/ui/`, `lib/` root files, `lib/i18n/` |
| `components/editor/` | `components/ui/`, `components/brand-kit/` (the Brand flyout shows the kit editor), `lib/` root files, `lib/i18n/`, `lib/editor/` |
| `lib/` root files | other `lib/` root files, `lib/i18n/` |
| `lib/editor/` | `lib/` root files, `lib/i18n/` |
| `lib/server/` | `lib/` root files, `lib/i18n/` |
| `lib/i18n/` | nothing else in the app |
| `scripts/` (with its tests) | nothing else in the app |
| `app/` | everything |

- Every `components/` folder may also import the server actions in `app/**/actions.ts`, because a component that submits a form calls them (`library-shell.tsx` calls `addBrand`).
- Lint can't tell client files from server files. `import 'server-only'` at the top of every `lib/server/*` file and of `lib/i18n/server.ts` makes `next build` fail when a client module reaches them. A file added to `lib/server/` opens with it too.

### In `packages/editor`

- Imports follow the build order under [The editor package](#the-editor-package): a module imports only modules built before it.
- Only `editor.ts` and `save-state.ts` import `yjs`, `y-indexeddb` or `@hocuspocus/provider`; `no-restricted-imports` checks it. This guards one way of reaching the document without a command, and does not enforce ADR-0004 on its own: the `packages/doc` session and its commands hold the only write path.
  - Test files (`*.test.ts`) are exempt, so a test may import them to fake a provider.

### Import rules in ESLint configs

In flat config, a later `no-restricted-imports` entry replaces an earlier one for the same files; the options don't merge. So every config block that sets `no-restricted-imports` lists the preset's exported `adr0001Pattern` among its `patterns`, beside its own. In `apps/web` it also keeps the app's `../` and subfolder ban. `pnpm lint:deps` (`dazbee-check-deps`) loads each workspace's ESLint config and fails on a block that lacks them.

### Import cycles

No workspace has a value-import cycle, and a change adds none. A cycle made only of type imports does nothing at runtime, so it is allowed. Check each workspace you moved code in, from the repo root, so madge reads the repo's `.madgerc` (which skips type-only imports):

```sh
pnpm dlx madge --circular --extensions ts,tsx <source folder>
```

For `apps/web`, run `pnpm dlx madge --circular --extensions ts,tsx --ts-config tsconfig.json app components lib scripts` inside `apps/web`, because madge resolves `@/` imports from the folder it runs in; it still finds the root `.madgerc`.

## The editor package

`editor.ts` builds the editor's modules in the order of this table. A module's dependency object holds only modules built before it: earlier rows, and earlier entries in its own row. Each stateful module is a factory that receives a typed dependency object with only what it uses. A callback to a module built later is passed in late-bound only where the late binding list below says so.

| Layer | Modules, in build order | State owned |
|---|---|---|
| 1. No in-memory state | `canvaskit` (the one CanvasKit loader), `run-quietly`, `shortcuts`, `canvas/{camera grid hit-test rulers cursors}`, `layers/{transform snap arrange auto-layout resize}`, `gestures/{press draw-tools path crop}`, `text/text-edit`, `clipboard` (uses `localStorage` and the system clipboard) | none |
| 2. State owners | `save-state`, `canvas/view`, `resources`, `canvas/scenes`, `tools`, `selection` | see the table below |
| 3. Queries | `layers/{boxes hug}`, `canvas/thumbnails`, `export/exports` (with `export/export-client`, its side of the export worker `export/export-worker`) | thumbnail caches; the export worker |
| 4. Behaviours | `text/typing`, `gestures/{pen cropping drawing transform-drag auto-layout-drag select-press}`, `actions`, `place`, `brand-kit`, `layer-edits` | the text being edited and its caret; pen state; snapped guides, snap work and what each drag has written; what a press may still select as a click; drop target; paste point |
| 5. Routers | `gestures/pointer`, `canvas/overlay` | the current gesture, whether a press is held, the pointer, pan, space held and the hover cursor |
| 6. Wiring | `editor.ts` | only the listener sets of the `Editor`'s public events that several modules raise (draw info, notices, text selection). It creates them first and passes each module the `emit` function it needs. It also keeps the frame callback `draw()` (which stops typing when its text is gone, re-checks the hover, draws the scene and calls the overlay), the keyboard and clipboard listeners with `onKey` routing, the first draw, and the `Editor` object, one line per member. The few members that tie modules of several layers together are short functions beside `onKey`: `perform` (undo and redo end the drag first), `select`, `focus`, `stopEditing` and `settle` |

`canvas/view` comes first among the state owners: `scenes`, `selection`, `boxes`, `thumbnails` and the behaviours read the design as last drawn, which it owns, and it needs no other module. `gestures/pointer` comes before `canvas/overlay` because the overlay reads the gesture to draw its parts. The types `startEditor` takes and resolves to (`Editor`, `EditorOptions`, `Notice`, `DrawInfo`) are in `editor-interface.ts`. `canvas/test-design` and `layers/test-boxes` are test-only.

Each piece of the editor's state has one owner:

| Module | State |
|---|---|
| `save-state` | the provider's connection, the shown save state, the offline timer |
| `canvas/view` | the WebGL `gl`, the surface, `dpr`, viewport, insets, camera, rulers, the last drawn `design` snapshot, `grid`, the focused format, the canvas frames last drawn (`inView()`, which `place` and the overlay read), the view listeners, the redraw schedule |
| `resources` | resource bytes, resources, the fonts asked for, family loads, what is loading, placeholders |
| `canvas/scenes` | canvas frames, pictures, paragraphs, scenes, layers, the recording counts |
| `tools` | the tool, the image to place, snapping, the tool listeners; `setTool` |
| `selection` | selection, entered group, picked page, crop, path edit, last selection, `hovered`, the selection and page listeners |
| `canvas/thumbnails` | the layer and page thumbnails, the crop's faint images |
| `export/exports` | the export worker's client |
| `text/typing` | the text being edited, caret and range |
| `gestures/pen` | pen state |
| `gestures/transform-drag` | snapped guides, snap work, and what each drag has written so far (`written`) |
| `gestures/select-press` | what a press may still select as a click: the layer clicked alone, the locked layer under a marquee's press, where the press went down |
| `place` | the drop target, the paste point |
| `gestures/pointer` | the gesture, whether a press is held, the pointer, pan, space held, hover cursor |

`canvas/overlay` owns no state: it draws from what the modules above own, in a fixed order.

- **The gesture lifecycle.** `gestures/pointer` routes pointer events to the behaviour that owns the gesture. Each behaviour module calls both `beginGesture` and its end (ADR-0004). One exception: `gestures/drawing` begins the step that makes a text box, and `text/typing` ends it when typing stops, so the new box and its first words are one undo step.
- **Late binding** is allowed only for:
  - `view.redraw`, which state owners call when they change;
  - the overlay's `draw`, which `selection`, the behaviours and `gestures/pointer` call to show their parts;
  - the frame callback `draw()`, which `canvas/view` receives when it is built and calls from its animation-frame schedule;
  - `tools`' `finish` and `changed`, which end the pen's path and show the pointer's cursor when the tool changes.

  In `editor.ts`, each late-bound call is a function declaration below the module it calls (`drawOverlay`, `showCursor`, `finishPath`), so it is declared before use.
- **The CPU surface.** `canvas/thumbnails` and the export code draw on the CPU surface, so they never receive `gl` or the WebGL surface (ADR-0005).

## What checks the rules

| Rule | Checked by |
|---|---|
| Formatting | Prettier: `pnpm format` writes it, and `pnpm format:check` runs in `pnpm lint`, so in the CI check job |
| Import order | `simple-import-sort`, fixed by `eslint --fix` |
| Nothing used above its declaration | `@typescript-eslint/no-use-before-define` |
| File size | `max-lines` |
| Imports between workspaces | `pnpm lint:deps` (the dependency-direction check) and the ADR-0001 pattern |
| Imports between folders in `apps/web`, and no `../` there | `no-restricted-imports` |
| Every `no-restricted-imports` block keeps the ADR-0001 pattern | `pnpm lint:deps` |
| Server-only code stays out of client bundles | `import 'server-only'`, failing `next build` |
| Yjs imports in the editor package | `no-restricted-imports` |
| Import cycles | madge, run by hand ([Import cycles](#import-cycles)) |
| A move commit holds only the changes a move may make | review only: the `--color-moved` diff ([Moving code](#moving-code)) and `/code-review` |
| Section order, feature folders, names, test placement, deep modules, the editor's layer order | review only: `/code-review` on every PR |
