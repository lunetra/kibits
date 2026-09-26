# assets/ — put your own theme files here

## boards/
Drop lichess board images (or any board image) here: `.jpg`, `.png`, `.webp`, `.svg`.
- File name = theme name (`blue-marble.jpg` → "Blue Marble").
- Full 8×8 board images are expected (lichess style). Small tileable textures are also OK — add `<name>.json` with `{ "type": "tile" }`.

## pieces/<set-name>/
One folder per piece set, 12 SVG files:
`wK.svg wQ.svg wR.svg wB.svg wN.svg wP.svg bK.svg bQ.svg bR.svg bB.svg bN.svg bP.svg`
(lichess naming). Other naming schemes are fine — the build script will normalize them or tell you what's missing.

## ATTRIBUTION.md
List where each board / piece set came from and its license.
