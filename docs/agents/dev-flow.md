# Dev flow

Every bug and UI flaw is caught by a check, a test or a fresh-eyes review before Keshav sees the work, so his time goes to decisions and taste.

A **goldfish** is a subagent with a fresh context. Its brief names everything it gets, and it never sees the conversation, so it meets the work the way a newcomer would. Brief it with the material, never with your conclusions.

## Writing a spec

1. The spec keeps a **decisions list**: every call Keshav made, with its date. Every mock and PR is checked against it. A change that would contradict a decision goes to Keshav first.
2. Each ticket names its **test grid** before work starts:
   - the layer types it touches: box, group, graphic (with a shape, and with a photo fill), boolean, text, instance, lottie, and several selected;
   - the states: rotated, inside a group, inside an auto layout box, masked, locked, hidden;
   - for text, each box mode (auto width, auto height, fixed) and shrink to fit on, since they change what the width, height and handles do;
   - one frame, linked frames, unlinked frames on one page, and two pages;
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
3. A UI change starts with a thin slice in the real app: the new piece working for one layer type. Send Keshav screenshots at the three screen sizes and wait for his OK before building the rest, so a layout that works only in the mock shows up after one PR. Before any screenshots of the built app go to Keshav, a goldfish design reviewer checks them as it checks a mock (Showing a mock, step 2), against the mock itself, and every finding is fixed first.
4. Each ticket is built in a Claude Code cloud session of its own, on the ticket's branch, so Keshav's PC only runs his app. The session starts with `bash .claude/cloud-setup.sh` (about two minutes: Docker with the compose stack, the repo's Node and pnpm, Chromium and the built web app) and runs `source .claude/cloud-env.sh` in every shell. Before every push it runs lint, typecheck and the unit tests of the packages it touched, `apps/api` and `apps/sync` included, since the session has a database of its own.
   - The brief carries the rules of Keshav's personal CLAUDE.md, which cloud sessions don't load: no AI attribution in commits or PRs (`.claude/settings.json` turns it off too), formatting with prettier and `eslint --fix`, never printing a secret, and asking before writing to anything shared.
   - A running session takes no messages, so a fix round is a new session on the same branch, briefed with the findings.
   - `gh pr` and `gh issue` don't work in a cloud session (`gh api` does), so the PR is opened, and its auto-merge turned on, from a local session.
5. The session runs the browser tests of what it touched: it builds the web app again after changing it (`pnpm turbo run build --filter=@dazbee/web`), then runs `pnpm --filter @dazbee/e2e exec playwright test specs/<area>/<spec>.spec.ts` in the background with its output in a log, because a shell command in a cloud session stops after ten minutes. To debug one failing spec, run it alone with `--workers=1`. A cloud machine runs about four tests a minute, so for a change across many areas, or an area of a hundred tests or more, run them on GitHub instead: push the branch, start `gh workflow run "Browser tests on demand" --ref <branch> -f args='specs/<area>'` (`-f args='specs/'` for every spec), and read the run's result before going on. It splits the tests into four parts that run side by side, each with its own 30-minute limit. The full suite runs in the PR's checks. A bug's test goes into the spec of the area it is in, beside the tests it belongs with, and checks the one behaviour that broke. CI is the second net.
6. The PR's screenshots are taken in the session, at the three screen sizes in both themes: by the `@evidence` tests (a test that only takes pictures for a PR, or repeats a check at sizes CI already covers, is tagged `@evidence`, and CI skips it) or by a throwaway Playwright script against the suite's servers. The session pushes them to the orphan branch `evidence/<branch>`, and the PR links them by their raw.githubusercontent.com URLs.

## Merging a PR

1. **Goldfish QA**, for any change a user can see or do in the app or its exports. A goldfish gets the ticket and its test grid in a cloud session of its own on the branch. It runs `.claude/cloud-setup.sh`, starts the suite's servers (`node tests/e2e/support/local-servers.ts`) and the built web app on port 3110 as `tests/e2e/playwright.config.ts` does, and tries to break the change in Chromium, driven by Playwright scripts: every cell of the grid, odd input, the keyboard, undo and redo, the three screen sizes, and for each pop-up, panel and menu opened by a click and by a key, what has the focus and how that looks; and for each state the grid lists (locked, hidden, masked), that a person can also leave it from the canvas, where they are. It reports each bug with steps and a screenshot, pushed to `evidence/<branch>-qa`. Each bug becomes a test that goes red, then a fix in the same PR, and the PR lists each finding with what happened to it.
2. `/code-review` against the ticket, on every PR. Fix or answer every finding.

## Closing a parent spec

When the last sub-issue of a parent spec closes, a goldfish auditor gets the spec in a cloud session on main, with the app running there as for Goldfish QA. It walks every decision and control: can a user reach it, and does it behave as the spec says? Each gap becomes an issue.

## Bug issues

Every bug issue gets the `bug` label and starts with `Found by:` and one of Keshav, QA, review, audit, test or CI. When Keshav finds one, the issue names the step above that should have caught it, and that step's wording is sharpened here so it catches the next one.
