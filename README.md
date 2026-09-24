# headSize — Face/Head Measurement Demo

Measures facial dimensions in the browser from a webcam feed using MediaPipe Face Landmarker. Everything runs locally; no video leaves the device.

Demo: https://shameem4.github.io/headSize/

## What it measures

- **Camera distance** — from apparent iris size (assumes an 11.7 mm iris)
- **IPD** — pupil-to-pupil distance (near, and far = near × 1.05)
- **Face width** — landmarks 127 ↔ 356
- **Eye widths** — landmarks 35 ↔ 244 and 464 ↔ 265
- **Nose** — bridge width, pad width, pad height, pad angle, flare angle

Millimetre values are scaled from the iris: `mm per px = 11.7 / iris diameter in px`.

## Views

- **2D Overlay** — measurement rails and labels over the video. Focus radio buttons (Global / Face / Eyes / Nose) pick which measurements are drawn.
- **3D Overlay** — Three.js face mesh, landmark points, and pupil lines aligned to the video, with wireframe, landmark and opacity controls.

## Running locally

ES modules need a web server:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 and allow camera access.

## Files

```text
index.html, style.css      UI
main.js                    Wiring and render loop
config.js                  Landmark indices, smoothing, colors, overlay layout
calculations.js            Iris fit, distance, IPD/face/eye/nose metrics
head.js                    Per-frame landmark projection and per-eye iris smoothing
core/
  camera-manager.js        Webcam selection and landmark mirroring
  model-manager.js         MediaPipe Face Landmarker setup and inference
  state-manager.js         Iris-based mm scale, measurements, distance smoothing
  ui-manager.js            Canvas sizing and metrics panel
graphics.js                2D overlay orchestration (focus modes)
graphics/                  Face/eye and nose overlay drawing
utils/                     Geometry, drawing primitives, label collisions, formatters
graphics-3d.js             Three.js 3D overlay
face-mesh-triangles.js     Mesh triangulation (from face_model_with_iris.obj)
face_model_with_iris.obj   MediaPipe canonical face model with iris (reference data)
```

## License

MIT, see [LICENSE](LICENSE).
