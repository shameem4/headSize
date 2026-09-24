/**
 * Main Application Entry - orchestrates all modules
 * @module main
 */

import { estimateCameraDistanceCm as calcEstimateDistance } from "./calculations.js";
import { CAMERA_CONFIG, HEAD_CONFIG, UI_CONFIG, THREEJS_CONFIG } from "./config.js";
import { createHeadTracker } from "./head.js";
import { UIManager } from "./core/ui-manager.js";
import { StateManager } from "./core/state-manager.js";
import { CameraManager } from "./core/camera-manager.js";
import { ModelManager } from "./core/model-manager.js";
import { createGraphics3D } from "./graphics-3d.js";

const IRIS_DIAMETER_MM = CAMERA_CONFIG.irisDiameterMm;
const FOCAL_LENGTH_PX = CAMERA_CONFIG.focalLengthScale();

// Initialize core modules
const ui = new UIManager();
const state = new StateManager(CAMERA_CONFIG);
const camera = new CameraManager(ui.video, CAMERA_CONFIG);
const head = createHeadTracker(HEAD_CONFIG);

const canvas2D = document.getElementById("output_canvas");
const canvas3D = document.getElementById("output_canvas_3d");
const threejsControls = document.getElementById("threejs_controls");
const graphics3D = createGraphics3D(canvas3D);

// Application state
let models;
let lastLandmarks = null;
let currentRenderMode = UI_CONFIG.renderMode;

/**
 * Estimate camera distance from iris diameter in pixels
 * @param {number} diameterPx - Iris diameter in pixels
 * @returns {number|null} Distance in centimeters
 */
function estimateCameraDistanceCm(diameterPx) {
  return calcEstimateDistance(diameterPx, FOCAL_LENGTH_PX, IRIS_DIAMETER_MM);
}

/**
 * Process face landmarks and update head tracking
 * @param {Object} faceResults - Face detection results from MediaPipe
 * @returns {number|null} Camera distance for this frame in cm
 */
function processFaceLandmarks(faceResults) {
  if (!faceResults?.faceLandmarks) {
    head.reset();
    lastLandmarks = null;
    return null;
  }

  // numFaces is 1; an empty list (face lost) keeps the last head state
  const landmarks = faceResults.faceLandmarks[0];
  if (!landmarks) return null;

  const { width, height } = ui.getCanvasDisplaySize();
  lastLandmarks = camera.applyMirrorIfEnabled(landmarks);
  head.update(lastLandmarks, width, height, estimateCameraDistanceCm);
  return head.getAverageCameraDistance();
}

/**
 * Main render loop - processes video frames and draws overlays
 */
function renderFrame() {
  const { faceResults } = models.processFrame(ui.video);
  const frameDistanceCm = processFaceLandmarks(faceResults);

  // Update distance with smoothing
  if (Number.isFinite(frameDistanceCm)) {
    state.updateDistance(frameDistanceCm);
  } else {
    state.decayDistance();
  }

  state.updateMeasurements(head, IRIS_DIAMETER_MM);
  ui.renderMetricsPanel(state.getMeasurements(), state.getSmoothedDistance());

  ui.clearCanvas();
  if (currentRenderMode === "canvas2d") {
    ui.graphics.beginFrame();
    ui.graphics.drawMeasurementOverlays(state.getMeasurements());
  } else if (lastLandmarks) {
    const { width, height } = ui.getCanvasDisplaySize();
    graphics3D.updateFaceMesh(lastLandmarks, width, height);
    graphics3D.render();
  }

  window.requestAnimationFrame(renderFrame);
}

/**
 * Toggle canvas visibility based on render mode
 */
function updateCanvasVisibility(mode) {
  const is3D = mode === "hybrid";
  canvas2D.style.display = "block";
  canvas3D.style.display = is3D ? "block" : "none";
  threejsControls.style.display = is3D ? "block" : "none";
}

/**
 * Setup 3D controls event listeners
 */
function setup3DControls() {
  document.querySelectorAll('input[name="renderMode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      currentRenderMode = e.target.value;
      updateCanvasVisibility(currentRenderMode);
    });
  });

  document.getElementById("wireframe_toggle").addEventListener("change", (e) => {
    graphics3D.setWireframe(e.target.checked);
  });

  document.getElementById("landmarks_toggle").addEventListener("change", (e) => {
    graphics3D.setLandmarksVisible(e.target.checked);
  });

  const opacitySlider = document.getElementById("opacity_slider");
  opacitySlider.value = THREEJS_CONFIG.headModel.opacity * 100;
  opacitySlider.addEventListener("input", (e) => {
    graphics3D.setOpacity(e.target.value / 100);
  });
}

// Start application
(async () => {
  models = await ModelManager.initialize(CAMERA_CONFIG);

  ui.setupEventListeners({
    onFocusChange: (focus) => ui.graphics.setRenderPolicy({ focus }),
  });

  setup3DControls();
  updateCanvasVisibility(currentRenderMode);

  const initialFocus =
    document.querySelector('input[name="focus"]:checked')?.value || "face";
  ui.graphics.setRenderPolicy({ focus: initialFocus });

  camera.setMirrorEnabled(UI_CONFIG.mirrorEnabled);
  ui.applyMirrorSetting(UI_CONFIG.mirrorEnabled);

  await camera.initialize();
  ui.video.addEventListener(
    "loadedmetadata",
    () => {
      ui.resizeDisplayToContainer();
      const { width, height } = ui.getCanvasDisplaySize();
      graphics3D.handleResize(width, height);
      renderFrame();
    },
    { once: true }
  );
})();
