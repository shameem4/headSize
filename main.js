/**
 * Main Application Entry - orchestrates all modules
 * @module main
 */

import { ConversionUtils } from "./calculations.js";
import { CAMERA_CONFIG, HEAD_CONFIG, UI_CONFIG, THREEJS_CONFIG, validateConfig } from "./config.js";
import { createHeadTracker } from "./head.js";
import { UIManager } from "./core/ui-manager.js";
import { StateManager } from "./core/state-manager.js";
import { CameraManager } from "./core/camera-manager.js";
import { ModelManager } from "./core/model-manager.js";
import { createGraphics3D } from "./graphics-3d.js";

// Validate configuration on startup
validateConfig();

const { estimateCameraDistanceCm: calcEstimateDistance } = ConversionUtils;
const { irisDiameterMm: DEFAULT_IRIS_DIAMETER_MM, focalLengthScale } = CAMERA_CONFIG;
const FOCAL_LENGTH_PX = focalLengthScale.call(CAMERA_CONFIG);

// Initialize core modules
const ui = new UIManager();
const state = new StateManager(CAMERA_CONFIG);
const camera = new CameraManager(ui.video, CAMERA_CONFIG);
const head = createHeadTracker(HEAD_CONFIG);

// Initialize 3D graphics (if enabled)
const canvas3D = document.getElementById("output_canvas_3d");
const graphics3D = THREEJS_CONFIG.enabled ? createGraphics3D(canvas3D) : null;

// Application state
let lastLandmarks = null;
let currentRenderMode = UI_CONFIG.renderMode;

/**
 * Estimate camera distance from iris diameter in pixels
 * @param {number} diameterPx - Iris diameter in pixels
 * @returns {number|null} Distance in centimeters
 */
function estimateCameraDistanceCm(diameterPx) {
  return calcEstimateDistance(diameterPx, FOCAL_LENGTH_PX, DEFAULT_IRIS_DIAMETER_MM);
}

/**
 * Process face landmarks and update head tracking
 * @param {Object} faceResults - Face detection results from MediaPipe
 * @returns {{frameDistanceCm: number|null}}
 */
function processFaceLandmarks(faceResults) {
  if (!faceResults?.faceLandmarks) {
    head.reset();
    lastLandmarks = null;
    return { frameDistanceCm: null };
  }

  let frameDistanceCm = null;
  const { width: canvasWidth, height: canvasHeight } = ui.getCanvasDisplaySize();

  faceResults.faceLandmarks.forEach((landmarks) => {
    const displayLandmarks = camera.applyMirrorIfEnabled(landmarks);
    if (!displayLandmarks) return;
    lastLandmarks = displayLandmarks;

    head.update(displayLandmarks, canvasWidth, canvasHeight, estimateCameraDistanceCm);

    const leftIris = head.eyes.left.iris;
    const rightIris = head.eyes.right.iris;
    if (leftIris?.distanceCm && rightIris?.distanceCm) {
      frameDistanceCm = (leftIris.distanceCm + rightIris.distanceCm) / 2;
    }
  });

  return { frameDistanceCm };
}

/**
 * Main render loop - processes video frames and draws overlays
 */
async function renderFrame() {
  // Process video frame with MediaPipe models
  const { faceResults } = models.processFrame(ui.video);

  // Process face landmarks
  const { frameDistanceCm } = processFaceLandmarks(faceResults);

  // Update distance with smoothing
  if (Number.isFinite(frameDistanceCm)) {
    state.updateDistance(frameDistanceCm);
  } else {
    state.decayDistance();
  }

  // Update measurements from head tracking
  state.updateMeasurements(head, DEFAULT_IRIS_DIAMETER_MM);

  // Render metrics panel
  ui.renderMetricsPanel(state.getMeasurements(), state.getSmoothedDistance());

  // Render based on mode
  if (currentRenderMode === "canvas2d") {
    // Clear and draw 2D canvas
    ui.clearCanvas();
    ui.graphics.beginFrame();
    ui.graphics.drawMeasurementOverlays(state.getMeasurements(), {
      noseOverlayEnabled: UI_CONFIG.noseOverlayEnabled
    });
  }

  if (currentRenderMode === "hybrid") {
    // Clear 2D canvas and render 3D scene only (no 2D overlays)
    ui.clearCanvas();
    if (graphics3D && lastLandmarks) {
      const { width, height } = ui.getCanvasDisplaySize();
      graphics3D.updateFaceMesh(lastLandmarks, width, height);
      graphics3D.render();
    }
  }

  // Request next frame
  window.requestAnimationFrame(renderFrame);
}

// Store models globally for renderFrame access
let models;

/**
 * Toggle canvas visibility based on render mode
 */
function updateCanvasVisibility(mode) {
  const canvas2D = document.getElementById("output_canvas");
  const canvas3DEl = document.getElementById("output_canvas_3d");
  const threejsControls = document.getElementById("threejs_controls");

  if (mode === "canvas2d") {
    canvas2D.style.display = "block";
    canvas3DEl.style.display = "none";
    threejsControls.style.display = "none";
  } else if (mode === "hybrid") {
    canvas2D.style.display = "block";
    canvas3DEl.style.display = "block";
    threejsControls.style.display = "block";
  }
}

/**
 * Setup 3D controls event listeners
 */
function setup3DControls() {
  if (!graphics3D) return;

  // Render mode toggle
  document.querySelectorAll('input[name="renderMode"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      currentRenderMode = e.target.value;
      updateCanvasVisibility(currentRenderMode);
    });
  });

  // Wireframe toggle
  const wireframeToggle = document.getElementById("wireframe_toggle");
  if (wireframeToggle) {
    wireframeToggle.addEventListener("change", (e) => {
      graphics3D.setWireframe(e.target.checked);
    });
  }

  // Landmarks toggle
  const landmarksToggle = document.getElementById("landmarks_toggle");
  if (landmarksToggle) {
    landmarksToggle.addEventListener("change", (e) => {
      graphics3D.setLandmarksVisible(e.target.checked);
    });
  }

  // Opacity slider
  const opacitySlider = document.getElementById("opacity_slider");
  if (opacitySlider) {
    // Set initial value from config
    opacitySlider.value = THREEJS_CONFIG.headModel.opacity * 100;

    opacitySlider.addEventListener("input", (e) => {
      graphics3D.setOpacity(e.target.value / 100);
    });
  }
}

// Start application
(async () => {
  models = await ModelManager.initialize(CAMERA_CONFIG);

  ui.setupEventListeners({
    onFocusChange: (focus) => {
      ui.graphics.setRenderPolicy({ focus });
    },
    onMirrorToggle: (enabled) => {
      camera.setMirrorEnabled(enabled);
      ui.applyMirrorSetting(enabled);
    },
  });

  // Setup 3D controls
  setup3DControls();
  updateCanvasVisibility(currentRenderMode);

  const initialFocus =
    document.querySelector('input[name="focus"]:checked')?.value || "face";
  ui.graphics.setRenderPolicy({ focus: initialFocus });

  // Set initial mirror state from config
  const initialMirrorEnabled = UI_CONFIG.mirrorEnabled;
  camera.setMirrorEnabled(initialMirrorEnabled);
  ui.applyMirrorSetting(initialMirrorEnabled);

  await camera.initialize();
  ui.video.addEventListener(
    "loadedmetadata",
    () => {
      ui.syncCanvasResolution();
      ui.resizeDisplayToContainer();

      // Handle window resize for 3D canvas
      if (graphics3D) {
        const { width, height } = ui.getCanvasDisplaySize();
        graphics3D.handleResize(width, height);
      }

      renderFrame();
    },
    { once: true }
  );
})();
