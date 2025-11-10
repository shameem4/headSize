# headSize — static demo

The project was reset to a simple static HTML demo. The original React/Vite app
and build artifacts were removed to keep this repository minimal.

```markdown
# headSize — face/head measurement demo (static)

This repository contains a compact static demo that measures and renders
face/head metrics on an HTML canvas. It is a trimmed-down version of a
larger app kept here as a small, self-contained demo for visualization and
measurement tooling.

Quick overview

- `index.html` — demo page (includes a canvas and minimal UI)
- `main.js`, `graphics.js` — drawing and overlay logic (measurements, labels)
- `process.py`, `new.py`, `arrange_grid_bbox.py` — small utilities used while
	preparing or processing measurement data
- `config.js` — visual / label configuration (colors, offsets, styles)
- `style.css` — demo styling
- `debug_out/` — example data and outputs (centroids, grids, numbers)

What the demo shows

- Rendering of nose/eye/face measurement overlays
- Angle guides, rails and screen-space labels for readability
- Example processing scripts and CSV output in `debug_out/`

Run locally (two quick options)

- With Python 3 (built-in):

```bash
python -m http.server 5173
# then open http://localhost:5173
```

- With npx http-server (no global install):

```bash
npx http-server -c-1 . -p 5173
# then open http://localhost:5173
```

Developer notes — coordinate systems and labels

- Internally the project calculates geometry in canvas (logical) coordinates
	— these are the coordinates derived from landmark data (e.g. normalized
	landmark positions multiplied by canvas size).
- Labels are drawn in screen space to stay upright and readable. A single
	helper `drawScreenLabel(text, canvasPosition, opts)` converts a canvas
	coordinate to screen coordinates and calls the low-level screen-space
	drawing function. This keeps geometry calculations consistent and prevents
	accidental mixing of coordinate spaces (the source of earlier label
	rotation bugs).
- Use the `screenSpace` flag on label objects to control whether the label is
	upright (`true`) or visually rotated to match the geometry (`false`).

Files of interest

- `graphics.js` — main drawing helper. Search for `drawScreenLabel`,
	`drawRailSegment`, `drawAngleGuide` to follow the label/rail logic.
- `config.js` — tweak colors, offsets, and label behavior here.


