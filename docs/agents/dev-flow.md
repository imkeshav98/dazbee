# Dev flow

Dazbee has no testers. Every bug and UI flaw is caught by a check, a test or a goldfish before Keshav sees the work, so his time goes to decisions and taste.

A **goldfish** is a subagent with a fresh context. Its brief names everything it gets, and it never sees the conversation, so it meets the work the way a newcomer would. Brief it with the material, never with your conclusions.

## Writing a spec

1. The spec keeps a **decisions list**: every call Keshav made, with its date. Every mock and PR is checked against it. A change that would contradict a decision goes to Keshav first.
2. Each ticket names its **test grid** before work starts:
   - the layer types it touches: text, photo, shape, box, group, several selected, mask;
   - the states: rotated, inside a group, inside a box or stack, masked, locked, hidden;
   - one size and several sizes, with own changes;
   - the screen sizes 1280×760, 820×1180 and 390×844;
   - undo and redo.
3. The spec and its tickets get an EGM review (the `egm` plugin) before any ticket starts. Each finding goes to Keshav with a recommendation, and the accepted ones are written into the issues.

## Showing a mock

Before Keshav sees a mock:

1. Script the checks at the three screen sizes, over every state the mock can reach (each selection, panel, pop-up and menu): no two pieces of UI overlap, no label wraps or is cut off, and every measurable decision holds (for example, the canvas transform never changes).
2. A goldfish design reviewer gets the decisions list, the reference screenshots and the mock's screenshots, plus the `ui-ux-pro-max` pre-delivery checklist. It lists anything ugly, cramped, inconsistent or against a decision. Fix every finding.
3. Show the mock with a line on what was checked, so his comments are about taste and decisions.

## Building a ticket

1. Logic goes test-first (`/tdd`): the test is red before the code changes.
2. A rule that must hold after every change (an auto-size text box fits its text, an export matches the canvas) lives in one shared check that the tests run after each command. #246 and #249 broke the same rule through two different paths; a per-path test caught neither.
3. A UI change starts with a thin slice in the real app: the new piece working for one layer type, with screenshots at the three screen sizes sent to Keshav before the rest is built. The layout C panels passed their mock and were replaced after ten PRs, once he used them in the app.
4. Before every push, run lint, typecheck, the unit tests of the touched packages, and the e2e specs for the touched area (off CI the suite starts its own servers and database). The unit tests of `apps/api` and `apps/sync` need CI's database, so they run in CI only. CI is the second net: of 24 commits that went red there in the first days, 20 needed a new commit.

## Merging a PR

1. **Goldfish QA.** A subagent gets the ticket, its test grid and the URL of the app running the branch. It tries to break the feature in Chromium: every cell of the grid, odd input, the keyboard, undo and redo, the three screen sizes. It reports each bug with steps and a screenshot. Each bug becomes a test that goes red, then a fix in the same PR.
2. `/code-review` against the ticket. Fix or answer every finding.
3. The PR shows the evidence: screenshots, numbers, the tests run, and each QA finding with what happened to it. Merge once CI is green on the head.

## Closing an epic

When the last ticket of an epic merges, a goldfish auditor gets the epic's spec and the app running main. It walks every decision and control: can a user reach it, and does it behave as the spec says? Each gap becomes an issue. The round 4 audit found six features the editor couldn't reach this way (#217 to #222).

## Bug issues

Every bug issue gets the `bug` label and starts with `Found by:` and one of Keshav, QA goldfish, audit, test or CI. When Keshav finds one, the issue also names the step above that should have caught it, and that step is tightened here.
