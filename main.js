/**
 * Main Application Entry - orchestrates all modules
 * @module main
 */

import { ConversionUtils } from "./calculations.js";
import { CAMERA_CONFIG, HEAD_CONFIG, UI_CONFIG, validateConfig } from "./config.js";
import { createHeadTracker } from "./head.js";
import { UIManager } from "./core/ui-manager.js";
import { StateManager } from "./core/state-manager.js";
import { CameraManager } from "./core/camera-manager.js";
import { ModelManager } from "./core/model-manager.js";

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

// Application state
let lastLandmarks = null;

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

  // Clear canvas
  ui.clearCanvas();

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

  // Draw measurement overlays on canvas
  ui.graphics.beginFrame();
  ui.graphics.drawMeasurementOverlays(state.getMeasurements(), {
    noseOverlayEnabled: UI_CONFIG.noseOverlayEnabled
  });

  // Request next frame
  window.requestAnimationFrame(renderFrame);
}

// Store models globally for renderFrame access
let models;

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
      renderFrame();
    },
    { once: true }
  );
})();
