# Dev flow

Every bug and UI flaw is caught by a check, a test or a fresh-eyes review before Keshav sees the work, so his time goes to decisions and taste.

A **goldfish** is a subagent with a fresh context. Its brief names everything it gets, and it never sees the conversation, so it meets the work the way a newcomer would. Brief it with the material, never with your conclusions.

## Writing a spec

1. The spec keeps a **decisions list**: every call Keshav made, with its date. Every mock and PR is checked against it. A change that would contradict a decision goes to Keshav first.
2. Each ticket names its **test grid** before work starts:
   - the layer types it touches: frame, group, graphic (with a shape, and with a photo fill), boolean, text, instance, lottie, and several selected;
   - the states: rotated, inside a group, inside an auto layout frame, masked, locked, hidden;
   - one format and several formats, with overrides;
   - the screen sizes 1280×760, 820×1180 and 390×844;
   - undo and redo.
3. Before any ticket starts, the spec and its tickets get an EGM review: the Elephant-Goldfish Model plugin, installed for Keshav's account and run as his personal CLAUDE.md says. Each finding goes to Keshav with a recommendation, and the accepted ones are written into the issues.

## Showing a mock

Before Keshav sees a mock:

1. Script the checks at the three screen sizes, over every state the mock can reach (each selection, panel, pop-up and menu): no two pieces of UI overlap, no label wraps or is cut off, and every measurable decision holds (for example, the canvas transform never changes).
2. A goldfish design reviewer gets the decisions list, the mock's screenshots, screenshots of any app Keshav named as the model, and the web rules of `ui-ux-pro-max` (`references/quick-reference.md`). It lists anything ugly, cramped, inconsistent or against a decision. Fix every finding.
3. Show the mock with a line on what was checked, so his comments are about taste and decisions.

## Building a ticket

1. Logic goes test-first (`/tdd`): the test is red before the code changes.
2. A rule that must hold after every change (a text layer in auto width or auto height fits its words; an export matches the canvas) lives in one shared check that the area's tests import and run after each command, so every path that changes the document is covered. The first ticket that needs a rule writes its check.
3. A UI change starts with a thin slice in the real app: the new piece working for one layer type. Send Keshav screenshots at the three screen sizes and wait for his OK before building the rest, so a layout that works only in the mock shows up after one PR.
4. Before every push, run lint, typecheck and the unit tests of the touched packages; these are light enough for Keshav's PC. The unit tests of `apps/api` and `apps/sync` write to the local database, so they run in CI only.
5. Browser tests run on GitHub, so Keshav's PC stays free: push the branch and run the `Browser tests on demand` workflow on it with the touched area's spec files as its `args`, before the PR goes up. Start it with `gh workflow run "Browser tests on demand" --ref <branch> -f args='specs/<area>.spec.ts'` (or the REST API's workflow dispatch) and read the run's result before going on. It splits the tests into four parts that run side by side, each with its own 30-minute limit; for a change that touches many areas, run every spec this way (`-f args='specs/'`) rather than a few long runs one after another. To debug one failing spec locally, run that spec alone with `--workers=1`: with docker compose up and the app built (`pnpm build`), `pnpm --filter @dazbee/e2e exec playwright test specs/<area>.spec.ts --workers=1` runs against the suite's own servers. CI is the second net.

## Merging a PR

1. **Goldfish QA**, for any change a user can see or do in the app or its exports. A goldfish gets the ticket, its test grid and the URL of the app running the branch, and tries to break the change in Chromium: every cell of the grid, odd input, the keyboard, undo and redo, the three screen sizes. It reports each bug with steps and a screenshot. Each bug becomes a test that goes red, then a fix in the same PR, and the PR lists each finding with what happened to it.
2. `/code-review` against the ticket, on every PR. Fix or answer every finding.

## Closing a parent spec

When the last sub-issue of a parent spec closes, a goldfish auditor gets the spec and the app running main. It walks every decision and control: can a user reach it, and does it behave as the spec says? Each gap becomes an issue.

## Bug issues

Every bug issue gets the `bug` label and starts with `Found by:` and one of Keshav, QA, review, audit, test or CI. When Keshav finds one, the issue names the step above that should have caught it, and that step's wording is sharpened here so it catches the next one.
