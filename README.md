# Evidence: feat/455-add-frame-card, second round

Taken in a Claude Code cloud session (Chromium, Playwright) against the built web app.

- `add-frame-{1280,820,390}-{dark,light}-{1-card,2-past-limits,3-menu,4-add-size,5-drawn}.png`: the add-frame @evidence tests (add-frame-screens.spec.ts). The past-limits pictures have the focus out of the fields: only the width, the side at fault, has the danger outline.
- `add-frame-d5-drawn-picked.png`: a frame drawn with the Frame tool, picked at once (accent label and outline, its top bar showing).
- `add-frame-empty-page-390.png`: just after Feed square on an empty page at 390×844 and 100%: the frame shows whole at 0, 0, its label clear.
- `add-frame-shown-{1280,820,390}.png`: a Story added at 100% zooms out only as far as it needs; no label under the header.
- `add-frame-q2-add-size-auto-layout.png`, `add-frame-q2-from-square.png`: Add size (Medium rectangle) on a square holding a 600×200 auto layout row, padding 50, gap 40: the copy's row is 139×46 with padding 11.57 and gap 9.26, its three squares inside.
- `add-frame-ar-ratio.png`: the Arabic ratio line, counting twelve with the singular noun.
