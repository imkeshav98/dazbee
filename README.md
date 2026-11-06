# Evidence for feat/499-radix-menus (menus on Radix, #499)

Every menu of the app open, before the move (on `origin/feat/498-top-bar`) and after it (on
`feat/499-radix-menus`), at 1280×760, 820×1180 and 390×844, in the dark and light themes. Taken by
`tests/e2e/specs/app/menus-screens.spec.ts` (`@evidence`) against the built app.

- `pairs/pair-<menu>-<width>-<theme>.png`: before on the left, after on the right, side by side.
- `after/menu-<menu>-<width>-<theme>.png`: the after picture alone.
- `before/menu-<menu>-<width>-<theme>.png`: the before picture alone.

What each `<menu>` shows:

- `full`: a text selected, the small menu's ⋯ (the full menu) with Paste ▸ open beside its row (on a
  phone, in the sheet's place under a back row), and its greyed Paste saying why (Copy layers first)
  under the pointer, or after a tap on a phone.
- `right-click`: the right-click menu on the badge, Copy to other frames ▸ open with its heading.
- `canvas`: the right-click menu on empty canvas in the square frame, with a layer hidden there:
  Show hidden layers.
- `frame`: the square frame picked by its label, its ⋯ open: Duplicate, Add size ▸, Rename, Export,
  Delete.
- `share`: Share's menu: Export and Save as template.
- `shape`: the dock's shape menu, Rectangle picked.
- `zoom`: the zoom menu with its zooms and the Rulers and Snap switches.
- `card`: the first page card's ⋯ on the Pages card; after the move its Move up is greyed and says
  why (This page is first already) under the pointer, or after a tap on a phone (before, it was a
  plain disabled row).
- `tile`: a library tile's ⋯ on the designs page: Rename, Duplicate, Delete.
