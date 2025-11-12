# headSize — Face/Head Measurement Demo

A modular, production-ready facial measurement application that uses MediaPipe for real-time face tracking and provides precise measurements of facial features including IPD, nose metrics, eye widths, and face dimensions.

## 🎯 Features

- **Real-time face tracking** using MediaPipe Face Landmarker
- **Precise measurements**: IPD (near/far), face width, eye widths, nose metrics (bridge, pad dimensions, angles)
- **Interactive overlays** with collision-aware label placement
- **Configurable focus modes**: Global, Face, Eyes, Nose
- **Mirror view toggle** for selfie mode
- **Camera distance estimation** using iris diameter
- **Responsive UI** with real-time metrics panel

## 🏗️ Architecture (Recently Refactored)

This codebase has been **completely refactored** for maximum readability and modularity. See [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) for detailed information.

### File Structure

```
headSize/
├── core/                          # Core business logic modules
│   ├── camera-manager.js          # Webcam access and video mirroring
│   ├── model-manager.js           # MediaPipe model initialization
│   ├── state-manager.js           # Measurement state management
│   └── ui-manager.js              # DOM manipulation and UI rendering
├── utils/                         # Utility functions
│   ├── collision-manager.js       # Smart label collision detection
│   ├── formatters.js              # Value formatting (mm, deg, cm)
│   └── geometry.js                # Geometric computations (circles, etc.)
├── calculations.js                # Measurement calculations
├── config.js                      # Configuration with validation
├── graphics.js                    # Canvas rendering and overlays
├── head.js                        # Head component hierarchy
├── main.js                        # Application orchestration
├── index.html                     # UI structure
├── style.css                      # Styling
└── REFACTORING_SUMMARY.md        # Detailed refactoring documentation
```

### Key Improvements

- **71% reduction** in main.js lines of code (475 → 136 lines)
- **100% removal** of commented/dead code
- **7 new specialized modules** with single responsibilities
- **Comprehensive JSDoc** documentation throughout
- **Configuration validation** with descriptive error messages
- **Smart collision detection** for label placement

## 🚀 Quick Start

### Prerequisites

- Modern web browser with webcam support
- Local web server (for ES6 module support)

### Running Locally

**Option 1: Python (built-in)**
```bash
cd headSize
python -m http.server 8000
# Open http://localhost:8000
```

**Option 2: Node.js (npx)**
```bash
cd headSize
npx serve .
# Open http://localhost:3000
```

**Option 3: Node.js (http-server)**
```bash
cd headSize
npx http-server -c-1 . -p 5173
# Open http://localhost:5173
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
- `debug_out/` — sample processed data useful for offline testing.

How to contribute or experiment

- Modify `config.js` to adjust label offsets, colors, or default
	`screenSpace` behavior.
- Add or modify a small dataset in `debug_out/` and open `index.html` to
	visualize changes.
- If you want the original React/Vite app restored (this repo was trimmed),
	mention it and the original source can be recovered from prior commits.

Contact / next steps

If you want I can:
- Make all labels screen-space (upright) by default.
- Add a small debug toggle that draws canvas vs screen points for visual
	verification.
- Convert this demo back to a small React app if you prefer a componentized
	workflow.

```
