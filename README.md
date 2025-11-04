# headSize

Camera-based facial measurement tool built with React, Vite, and React Bootstrap on top of MediaPipe Tasks Vision. The app mirrors your webcam feed, runs the on-device face-landmarker model, and overlays estimated metrics such as interpupillary distance (IPD), face breadth, nose arch height, and nose flare angle.

## How It Works

- The React component mounts a `<video>` and `<canvas>` stacked inside a styled Bootstrap card (`src/App.jsx:1-418`).
- On load we:
  1. Preload the MediaPipe face-landmarker model via `FilesetResolver.forVisionTasks` and `FaceLandmarker.createFromOptions`.
  2. Request webcam access (`getUserMedia`) and attach the stream to the hidden `<video>` element.
  3. Resize the canvas to match the intrinsic video dimensions for pixel-accurate overlays.
  4. Continuously run `detectForVideo` inside `requestAnimationFrame`, drawing:
     - Iris centers and an IPD line to compute approximate millimeter spacing using an average iris diameter calibration.
     - Face breadth using landmarks 127 and 356.
     - Nose bridge → tip vectors for arch height and flare angle.
  5. Update a status badge and control button state based on the capture lifecycle.
- Cleanup stops the animation loop, clears the canvas, and stops media tracks.

All measurement math matches the original static prototype, now encapsulated in hooks (`useRef`, `useCallback`, `useEffect`) for predictable lifecycle management.

## Requirements

- Node.js ≥ 18.0 (Vite requires modern ESM support)
- npm ≥ 9 (ships with Node ≥ 18)
- A WebRTC-capable browser with camera permissions granted
- Stable internet access for the first load (model + WASM are fetched from Google’s CDN)

## Installation & Scripts

```bash
npm install
npm run dev      # start the Vite dev server
npm run build    # production build
npm run preview  # preview the production build locally
npm run lint     # run ESLint
```

The dev server runs at http://localhost:5173 by default. Open it in a browser, allow camera access when prompted, and you should see the mirrored feed with overlay measurements.

## Key Dependencies

- `react`, `react-dom` — UI foundation
- `vite` — fast development/build tooling
- `react-bootstrap`, `bootstrap` — layout and component styling
- `@mediapipe/tasks-vision` — on-device face-landmarker model and drawing utilities

## Project Structure Highlights

| Path                  | Purpose |
| --------------------- | ------- |
| `src/App.jsx`         | Main React component handling model load, camera control, and rendering overlays |
| `src/App.css`         | Dark theme and layout styles aligned with the original prototype |
| `src/index.css`       | Global font, body, and root styling |
| `src/main.jsx`        | Application bootstrap, imports Bootstrap styles |
| `legacy-index.html`   | Original static HTML prototype preserved for reference |

## Privacy & Permissions

- Everything runs locally in the browser; no video frames leave your machine.
- If you deny camera access, the UI displays a warning and no detection occurs.
- Reload after changing system permissions to re-trigger the webcam prompt.
