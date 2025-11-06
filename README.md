# headSize

Camera-based facial measurement tool built with React, Vite, and
React Bootstrap on
top of MediaPipe Tasks Vision. The app mirrors your webcam feed, runs the on-device
face-landmarker model, and overlays estimated metrics such as interpupillary distance
(IPD), face breadth, nose arch height, and nose flare angle.

Check it out <https://shameem4.github.io/headSize/>

## How It Works

- The React shell renders the measurement stage, layering `<video>` and `<canvas>`
  in a
  styled Bootstrap card (`src/components/MeasurementStage.jsx`).
- On load the hook in `src/hooks/MediapipeCallback.js`:
  1. Preloads the MediaPipe face-landmarker model through
     `FilesetResolver.forVisionTasks` and `FaceLandmarker.createFromOptions`.
  2. Requests the user camera with `getUserMedia` and streams it into the `<video>`
     element.
  3. Resizes the `<canvas>` to the intrinsic video size for pixel-accurate drawing.
  4. Runs `detectForVideo` inside `requestAnimationFrame`, delegating to
     `drawFaceMeasurements` for overlays (iris spacing, face breadth, nose metrics).
  5. Updates status text and button states to reflect the capture lifecycle.
- Cleanup cancels animation frames, clears the canvas, stops media tracks, and removes
  the resize listener.

All measurement math from the original static prototype lives in
`src/lib/drawFaceMeasurements.js`, while lifecycle management is handled via React
hooks (`useRef`, `useCallback`, `useEffect`) for predictable cleanup.

## Requirements

- Node.js ≥ 18.0 (Vite requires modern ESM support)
- npm ≥ 9 (ships with Node ≥ 18)
- WebRTC-capable browser with camera permissions granted
- Initial internet access so the model and WASM bundle can load from Google’s CDN

## Installation & Scripts

```bash
npm install
npm run dev      # start the Vite dev server
npm run build    # production build
npm run preview  # preview the production build locally
npm run lint     # run ESLint
```

The dev server runs at <http://localhost:5173> by default. Open it in a browser,
allow camera access when prompted, and the mirrored feed with overlay measurements
appears.

## Key Dependencies

- `react`, `react-dom` — UI foundation
- `vite` — fast development and build tooling
- `react-bootstrap`, `bootstrap` — component styling and layout helpers
- `@mediapipe/tasks-vision` — on-device face-landmarker model and drawing utilities

## Project Layout

- `src/App.jsx` — Container that wires the hook, stage component, and status UI
- `src/App.css` — Dark theme and layout styles aligned with the original prototype
- `src/hooks/MediapipeCallback.js` — Camera + model lifecycle encapsulated as a
  hook
- `src/lib/drawFaceMeasurements.js` — MediaPipe landmark calculations and rendering
- `src/index.css` — Global font, body, and root styling
- `src/main.jsx` — Application bootstrap and Bootstrap CSS import
- `legacy-index.html` — Original static HTML prototype preserved for reference

## Privacy & Permissions

- Everything runs locally in the browser; no video frames leave your machine.
- Denying camera access surfaces a warning and skips detection until permission is
  granted.
- Change system permissions? Reload the page to re-trigger the webcam prompt.
