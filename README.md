# #459 Export lists frames: review fixes (`feat/459-export-frames` at 0a8050f)

Taken in Chromium (Playwright, SwiftShader) by the `@evidence` tests in
`tests/e2e/specs/app/export-frames-screens.spec.ts`, against the built web app with the suite's own
API and sync server.

## At each screen size (1280×760, 820×1180, 390×844), dark and light

| File | Shows |
| --- | --- |
| `shots/export-frames-<w>-<theme>-1-list.png` | Share → Export: the Export heading, Share in its open state (glass under the pressed tint, pink icon), each row's own name with its file's number muted after it ("Sale" then "2"), Banner unticked |
| `shots/export-frames-<w>-<theme>-2-hovered.png` | The second Sale's row under the pointer lights its frame on the canvas: outlined as a layer under the pointer is, its label pink (D1) |
| `shots/export-frames-<w>-<theme>-3-menu.png` | A picked frame's ⋯ with Export |
| `shots/export-frames-<w>-<theme>-4-one.png` | Export opened from that ⋯: its frame ticked alone, Share shown open |

On a phone every control is 44 px tall.

## Nine frames on a phone

`shots/export-frames-390-dark-5-nine-scrolled.png`: nine frames with JPG's Quality showing at
390×844, the list scrolled part way: its bar shown, rows cut at its edges, the whole form on screen
(C2, Q5).
