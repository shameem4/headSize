/**
 * Main Application Entry - UI, wiring and render loop
 * @module main
 */

import {
  CAMERA_CONFIG,
  HEAD_CONFIG,
  UI_CONFIG,
  THREEJS_CONFIG,
  COLOR_CONFIG,
  IPD_OVERLAY_CONFIG,
} from "./config.js";
import { createMeasurer } from "./measure.js";
import { CameraManager, ModelManager } from "./camera.js";
import { createGraphics } from "./overlay-2d.js";
import { createGraphics3D } from "./overlay-3d.js";

// DOM
const video = document.getElementById("webcam");
const liveView = document.getElementById("liveView");
const canvas2D = document.getElementById("output_canvas");
const canvas3D = document.getElementById("output_canvas_3d");
const ctx = canvas2D.getContext("2d");
const threejsControls = document.getElementById("threejs_controls");
const metricsPanelBody = document.getElementById("metrics_panel_body");
const statusEl = document.getElementById("status");

// Modules
const measurer = createMeasurer(CAMERA_CONFIG, HEAD_CONFIG);
const camera = new CameraManager(video, CAMERA_CONFIG);
const graphics = createGraphics(ctx);
const graphics3D = createGraphics3D(canvas3D);

// Application state
let models;
let currentRenderMode = UI_CONFIG.renderMode;

// ============================================================================
// DISPLAY
// ============================================================================

/**
 * Canvas display size (CSS size, not backing buffer size)
 * @returns {{width: number, height: number}}
 */
function getCanvasDisplaySize() {
  const r = canvas2D.getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
}

/**
 * Fit video and 2D canvas to the container, keeping aspect ratio
 */
function resizeDisplayToContainer() {
  const rect = liveView.getBoundingClientRect();
  const targetW = Math.max(1, Math.floor(rect.width));
  const targetH = Math.max(1, Math.floor(rect.height));

  const vidW = video.videoWidth || 1280;
  const vidH = video.videoHeight || 720;
  const scale = Math.min(targetW / vidW, targetH / vidH);

  const w = Math.round(vidW * scale);
  const h = Math.round(vidH * scale);

  video.style.width = `${w}px`;
  video.style.height = `${h}px`;
  canvas2D.style.width = `${w}px`;
  canvas2D.style.height = `${h}px`;

  // Keep the backing buffer sharp on HiDPI
  const dpr = window.devicePixelRatio || 1;
  canvas2D.width = Math.round(w * dpr);
  canvas2D.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  graphics3D.handleResize(w, h);
}

const fmt = (v, unit) => (v == null || !Number.isFinite(v) ? "--" : `${v.toFixed(1)}${unit}`);
const mm = (v) => fmt(v, " mm");
const deg = (v) => fmt(v, "°");

function metricRow(label, value, color) {
  const style = color ? ` style="color:${color}"` : "";
  return `<div class="metric-row"${style}><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

function metricCard(title, rows) {
  return `<div class="metric-card"><h2>${title}</h2>${rows.join("")}</div>`;
}

let lastPanelHtml = "";

/**
 * Render the metrics panel (only touches the DOM when values change)
 * @param {Object} m - Measurements
 */
function renderMetricsPanel(m) {
  const nose = m.nose || {};
  const noseColors = COLOR_CONFIG.noseMetrics;
  const ipdRows = m.ipd
    ? IPD_OVERLAY_CONFIG.rails.map(({ key, label }) => metricRow(label, mm(m.ipd[key]), COLOR_CONFIG.ipd[key]))
    : [metricRow("Values", "--")];

  const html = [
    metricCard("Camera", [metricRow("Distance", fmt(m.distanceCm, " cm"))]),
    metricCard("Face", [metricRow("Width", mm(m.faceWidth?.valueMm))]),
    metricCard("Eyes", [
      metricRow("Left width", mm(m.eyes?.left?.valueMm)),
      metricRow("Right width", mm(m.eyes?.right?.valueMm)),
    ]),
    metricCard("IPD", ipdRows),
    metricCard("Nose", [
      metricRow("Bridge width", mm(nose.bridgeWidthMm), noseColors.bridge),
      metricRow("Pad width", mm(nose.padSpanMm), noseColors.padSpan),
      metricRow("Pad height", mm(nose.padHeightMm), noseColors.padHeight),
      metricRow("Pad angle", deg(nose.padAngleDeg), noseColors.padAngle),
      metricRow("Flare angle", deg(nose.flareAngleDeg), noseColors.flareAngle),
    ]),
  ].join("");

  if (html !== lastPanelHtml) {
    metricsPanelBody.innerHTML = html;
    lastPanelHtml = html;
  }
}

// ============================================================================
// RENDER LOOP
// ============================================================================

function renderFrame() {
  const { faceResults } = models.processFrame(video);
  const raw = faceResults?.faceLandmarks?.[0];
  const landmarks = raw ? camera.applyMirrorIfEnabled(raw) : null;
  const display = getCanvasDisplaySize();

  const m = measurer.update(landmarks, { width: video.videoWidth, height: video.videoHeight }, display);
  renderMetricsPanel(m);

  ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);
  if (currentRenderMode === "canvas2d") {
    graphics.beginFrame();
    graphics.drawMeasurementOverlays(m);
  } else {
    graphics3D.updateFaceMesh(landmarks, display.width, display.height);
    graphics3D.render();
  }

  window.requestAnimationFrame(renderFrame);
}

// ============================================================================
// CONTROLS
// ============================================================================

function updateCanvasVisibility(mode) {
  const is3D = mode === "hybrid";
  canvas2D.style.display = "block";
  canvas3D.style.display = is3D ? "block" : "none";
  threejsControls.style.display = is3D ? "block" : "none";
}

function setupControls() {
  document.querySelectorAll('input[name="focus"]').forEach((radio) => {
    radio.addEventListener("change", (e) => graphics.setRenderPolicy({ focus: e.target.value }));
  });

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

  window.addEventListener("resize", resizeDisplayToContainer);
}

function showError(message) {
  statusEl.textContent = message;
  statusEl.hidden = false;
}

/**
 * User-facing message for a getUserMedia failure
 * @param {Error} error
 */
function cameraErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
      return "Camera access was blocked. Allow camera access for this site, then reload.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found.";
    case "NotReadableError":
      return "The camera is in use by another app. Close it, then reload.";
    default:
      return `Could not start the camera (${error?.name || error}).`;
  }
}

// Start application
(async () => {
  try {
    models = await ModelManager.initialize(CAMERA_CONFIG);
  } catch (error) {
    console.error(error);
    showError("Could not load the face model. Check your connection, then reload.");
    return;
  }

  setupControls();
  updateCanvasVisibility(currentRenderMode);

  const initialFocus =
    document.querySelector('input[name="focus"]:checked')?.value || "face";
  graphics.setRenderPolicy({ focus: initialFocus });

  camera.setMirrorEnabled(UI_CONFIG.mirrorEnabled);
  video.classList.toggle("mirrored", UI_CONFIG.mirrorEnabled);

  try {
    await camera.initialize();
  } catch (error) {
    console.error(error);
    showError(cameraErrorMessage(error));
    return;
  }
  video.addEventListener(
    "loadedmetadata",
    () => {
      resizeDisplayToContainer();
      renderFrame();
    },
    { once: true }
  );
})();
