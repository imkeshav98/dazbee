# Dev flow

Keshav's time goes to decisions and taste. Every bug a person could hit and every visible flaw is caught by a test, a check or a fresh-eyes review before he sees the work, and each ticket gets there in one **round**: one cloud session that builds the ticket, reviews it and fixes what the review finds.

## Words

- A **goldfish** is a subagent with a fresh context. Its brief names everything it gets, and it never sees the conversation, so it meets the work the way a newcomer would. Brief it with the material, never with your conclusions.
- A **blocker** is a finding that stops a merge. There are four kinds:
  1. a person can hit it: a wrong result, lost work, a crash, a control they can't reach or use;
  2. it breaks a decision on the spec or the approved mock;
  3. it is visibly broken at one of the three screen sizes: overlapping, cut off, unreadable, under a 44 px target on a phone;
  4. a test passes while the behaviour it covers is broken.
- A **note** is every other finding: naming, code smells, tidier structure, polish nobody would notice in use. Notes are listed on the PR and collected in one cleanup ticket per stage of the spec; they never start a round.

## Writing a spec

1. The spec keeps a **decisions list**: every call Keshav made, with its date. Every mock and PR is checked against it. A change that would contradict a decision goes to Keshav first.
2. Each ticket names its **test grid** before work starts:
   - the layer types it touches: box, group, graphic (with a shape, and with a photo fill), boolean, text, instance, lottie, and several selected;
   - the states: rotated, inside a group, inside an auto layout box, masked, locked, hidden;
   - for text, each box mode (auto width, auto height, fixed) and shrink to fit on, since they change what the width, height and handles do;
   - one frame, linked frames, unlinked frames on one page, and two pages;
   - the screen sizes 1280×760, 820×1180 and 390×844;
   - undo and redo.
3. Each ticket names the files it expects to change. Tickets that share files run one after another; the rest run side by side.
4. Before any ticket starts, the spec and its tickets get an EGM review: the Elephant-Goldfish Model plugin, installed for Keshav's account and run as his personal CLAUDE.md says. Each finding goes to Keshav with a recommendation, and the accepted ones are written into the issues.

## Showing a mock

1. Script the checks at the three screen sizes, over every state the mock can reach (each selection, panel, pop-up and menu): no two pieces of UI overlap, no label wraps or is cut off, and every measurable decision holds (for example, the canvas transform never changes).
2. A goldfish design reviewer gets the decisions list, the mock's screenshots, screenshots of any app Keshav named as the model, and the web rules of `ui-ux-pro-max` (`references/quick-reference.md`). It lists anything ugly, cramped, inconsistent or against a decision. Fix every finding.
3. Show the mock with a line on what was checked, so his comments are about taste and decisions.
4. Once Keshav picks an option, push its screenshots, every state at the three sizes, to the orphan branch `mock/<ticket>`, with a README naming the state each file shows. The builder works from these pictures.

## A round

Each round runs in a Claude Code cloud session on the ticket's branch, so Keshav's PC only runs his app. A local session starts it and writes its brief. The brief carries the rules of Keshav's personal CLAUDE.md, which cloud sessions don't load: no AI attribution in commits or PRs (`.claude/settings.json` turns it off too), formatting with prettier and `eslint --fix`, never printing a secret, and asking before writing to anything shared. A running session takes no messages, and `gh pr` and `gh issue` don't work there (`gh api` does).

1. **Set up.** Run `bash .claude/cloud-setup.sh` (about two minutes: Docker with the compose stack, the repo's Node and pnpm, Chromium and the built web app) and `source .claude/cloud-env.sh` in every shell.
2. **Build test-first** (`/tdd`): each test is red before the code changes. A rule that must hold after every change (a text layer in auto width or auto height fits its words; an export matches the canvas) lives in one shared check that the area's tests import and run after each command; the first ticket that needs a rule writes it. A behaviour many controls share is built once in the shared component or hook, and every instance uses it. A UI change is built against the screenshots on `mock/<ticket>`.
3. **Run the checks.** Lint, typecheck and the unit tests of every package touched, `apps/api` and `apps/sync` included (the session has a database of its own). Rebuild the web app (`pnpm turbo run build --filter=@dazbee/web`), then run the browser specs of what changed: `pnpm --filter @dazbee/e2e exec playwright test specs/<area>/` in the background with its output in a log, since a shell command stops after ten minutes. Run one failing spec alone with `--workers=1`, and re-run a timed-out test alone before calling it a timeout. A cloud machine runs about four tests a minute; for an area of a hundred tests or more, push the branch and run `gh workflow run "Browser tests on demand" --ref <branch> -f args='specs/<area>'`, which splits them into four parts with 30 minutes each, and read its result. A bug's test goes into the spec of its area and checks the one behaviour that broke.
4. **Take the screenshots** at the three screen sizes in both themes, with the `@evidence` tests (tests that only take pictures for a PR; CI skips them) or a throwaway Playwright script against the suite's servers. Look at every one.
5. **Review**, with goldfish subagents that run side by side. Each sorts its findings into blockers and notes.
   - **Goldfish QA**, for any change a person can see or do. It starts the suite's servers (`node tests/e2e/support/local-servers.ts`) and the built web app on port 3110 as `tests/e2e/playwright.config.ts` does, and uses the change in Chromium the way a person does: real clicks, drags, taps and typing, never `fill()` or one long synthetic move, then a look at what the person sees (the selection, the caret, where the value went, what has the focus). A drag that changes a value goes in small moves, comparing how far the pointer went with how far the value went. It covers every cell of the test grid, odd input, the keyboard, undo and redo, and each pop-up, panel and menu opened by a click and by a key; for each state the grid lists (locked, hidden, masked), a person can leave it from the canvas, where they are.
   - **Design review**, for a UI change: the screenshots against `mock/<ticket>`, the decisions list and the `ui-ux-pro-max` web rules, as for a mock.
   - **Code review**: `/code-review` against the ticket. Its smell baseline gives notes.
   - A small bug fix gets one goldfish doing all three.
6. **Fix every blocker** test-first, re-run the checks it touched, and have a goldfish confirm the fix in the running app.
7. **Push** the branch, then the screenshots to the orphan branch `evidence/<branch>` last; the PR links them by their raw.githubusercontent.com URLs.
8. **Report**, in the final message: what changed and where, each test red then green, the specs run with their counts, each blocker and its fix, the notes, and the commits.

A UI change that has no approved mock takes two rounds: the first builds the new piece for one layer type, a goldfish design reviewer checks its screenshots, and Keshav OKs them before the second round builds the rest.

## Merging a PR

1. A local session opens the PR from the round's report (`/pr`), with the notes listed, and turns on auto-merge with a merge commit. GitHub merges it when every required check is green; Keshav reviews after merge.
2. A red check or a blocker found after the round starts one more round, briefed with exactly that.
3. The notes go into the stage's cleanup ticket.

## Closing a parent spec

When the last sub-issue of a parent spec closes, a goldfish auditor gets the spec in a cloud session on main, with the app running there as for Goldfish QA. It walks every decision and control: can a person reach it, and does it behave as the spec says? Each blocker becomes an issue; the notes go into one cleanup ticket.

## Bug issues

Every bug issue gets the `bug` label and starts with `Found by:` and one of Keshav, QA, review, audit, test or CI. When Keshav finds one, the issue names the step above that should have caught it, and that step's wording is sharpened here so it catches the next one.
