import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
  // PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import { ConversionUtils, MeasurementBuilders } from "./calculations.js";
import { createGraphics } from "./graphics.js";
import {
  CAMERA_CONFIG,
  HEAD_CONFIG,
  COLOR_CONFIG,
  IPD_OVERLAY_CONFIG,
} from "./config.js";
import { createHeadTracker } from "./head.js";
const { estimateCameraDistanceCm: calcEstimateDistance } = ConversionUtils;
const {
  computeNoseMetrics,
  buildIpdMeasurement,
  buildFaceWidthMeasurement,
  buildEyeWidthMeasurement,
} = MeasurementBuilders;

const {
  mediaPipeVersion: MEDIA_PIPE_VERSION,
  runningMode: RUNNING_MODE,
  videoSize: VIDEO_SIZE,
  irisDiameterMm: DEFAULT_IRIS_DIAMETER_MM,
  focalLengthScale,
  distanceSmoothing: DISTANCE_SMOOTHING,
  distanceVisibilityTimeout: DISTANCE_VISIBILITY_TIMEOUT,
} = CAMERA_CONFIG;
const FOCAL_LENGTH_PX = focalLengthScale.call(CAMERA_CONFIG);

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
// const distanceMeterEl = document.getElementById("distance_meter");
// const distanceValueEl = document.getElementById("distance_value");
// const noseMetricsEl = document.getElementById("nose_metrics");
// const noseMetricsBodyEl = document.getElementById("nose_metrics_body");
const noseOverlayToggleEl = document.getElementById("nose_overlay_toggle");
const mirrorToggleEl = document.getElementById("mirror_toggle");
const mirrorPanelEl = document.getElementById("mirror_panel");
const graphics = createGraphics(canvasElement, canvasCtx);
const NOSE_METRIC_COLORS = COLOR_CONFIG.noseMetrics || {};

// after existing DOM refs:
// const detailSelectEl = document.getElementById("detail_select");
// const focusSelectEl = document.getElementById("focus_select");

// New sidebar panel elements:
const metricsPanelEl = document.getElementById("metrics_panel");
const metricsPanelBodyEl = document.getElementById("metrics_panel_body");

function getVideoDimensions() {
  return {
    width: video?.videoWidth || VIDEO_SIZE.width,
    height: video?.videoHeight || VIDEO_SIZE.height,
  };
}

function syncCanvasResolution() {
  const { width, height } = getVideoDimensions();
  if (canvasElement.width !== width) canvasElement.width = width;
  if (canvasElement.height !== height) canvasElement.height = height;
}

function resizeDisplayToContainer() {
  // Use the full left column as the container
  const container =
    document.querySelector(".videoView") ||
    document.getElementById("liveView") ||
    document.body;

  const rect = container.getBoundingClientRect();
  const targetW = Math.max(1, Math.floor(rect.width));
  const targetH = Math.max(1, Math.floor(rect.height));

  // Preserve camera aspect
  const { width: vidW, height: vidH } = getVideoDimensions();
  const scale = Math.min(targetW / vidW, targetH / vidH);

  const w = Math.round(vidW * scale);
  const h = Math.round(vidH * scale);

  video.style.width = `${w}px`;
  video.style.height = `${h}px`;
  canvasElement.style.width = `${w}px`;
  canvasElement.style.height = `${h}px`;

  // Keep the backing buffer sharp on HiDPI
  const dpr = window.devicePixelRatio || 1;
  canvasElement.width  = Math.round(w * dpr);
  canvasElement.height = Math.round(h * dpr);
  const ctx = canvasElement.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}


function fmtMm(v) { return (v == null || !Number.isFinite(v)) ? "--" : `${v.toFixed(1)} mm`; }
function fmtDeg(v){ return (v == null || !Number.isFinite(v)) ? "--" : `${v.toFixed(1)}°`; }
function safeColor(hex, fallback="#fff"){ return typeof hex === "string" && hex ? hex : fallback; }

function renderCombinedPanel(state, distanceCm) {
  if (!metricsPanelEl || !metricsPanelBodyEl) return;

  // Distance card
  const distanceCard = `
    <div class="metric-card">
      <h2>Camera</h2>
      <div class="metric-row"><span class="label">Distance</span><span class="value">${Number.isFinite(distanceCm) ? `${distanceCm.toFixed(1)} cm` : "--"}</span></div>
    </div>`;

  // Face card
  const face = state.faceWidth;
  const faceCard = `
    <div class="metric-card">
      <h2>Face</h2>
      <div class="metric-row"><span class="label">Width</span><span class="value">${fmtMm(face?.valueMm)}</span></div>
    </div>`;

  // Eyes card
  const eyes = state.eyes || {};
  const leftEye = eyes.left, rightEye = eyes.right;
  const eyesCard = `
    <div class="metric-card">
      <h2>Eyes</h2>
      <div class="metric-row"><span class="label">Left width</span><span class="value">${fmtMm(leftEye?.valueMm)}</span></div>
      <div class="metric-row"><span class="label">Right width</span><span class="value">${fmtMm(rightEye?.valueMm)}</span></div>
    </div>`;

  // IPD card (render whatever rails your builder exposes, using your config labels)
  const ipd = state.ipd;
  let ipdRows = "";
  if (ipd && Array.isArray(IPD_OVERLAY_CONFIG.rails)) {
    const ipdColors = COLOR_CONFIG.ipd || {};
    ipdRows = IPD_OVERLAY_CONFIG.rails.map(({ key, label }) => {
      const val = Number.isFinite(ipd?.[key]) ? `${ipd[key].toFixed(1)} mm` : "--";
      const color = safeColor(ipdColors[key]);
      return `<div class="metric-row" style="color:${color}"><span class="label">${label}</span><span class="value">${val}</span></div>`;
    }).join("");
  }
  const ipdCard = `
    <div class="metric-card">
      <h2>IPD</h2>
      ${ipdRows || `<div class="metric-row"><span class="label">Values</span><span class="value">--</span></div>`}
    </div>`;

  // Nose card (your existing computeNoseMetrics fields)
  const NM = state.nose || {};
  const NCLR = COLOR_CONFIG.noseMetrics || {};
  const noseCard = `
    <div class="metric-card">
      <h2>Nose</h2>
      <div class="metric-row" style="color:${safeColor(NCLR.bridge)}"><span class="label">Bridge width</span><span class="value">${fmtMm(NM.bridgeWidthMm)}</span></div>
      <div class="metric-row" style="color:${safeColor(NCLR.padSpan)}"><span class="label">Pad width</span><span class="value">${fmtMm(NM.padSpanMm)}</span></div>
      <div class="metric-row" style="color:${safeColor(NCLR.padHeight)}"><span class="label">Pad height</span><span class="value">${fmtMm(NM.padHeightMm)}</span></div>
      <div class="metric-row" style="color:${safeColor(NCLR.padAngle)}"><span class="label">Pad angle</span><span class="value">${fmtDeg(NM.padAngleDeg)}</span></div>
      <div class="metric-row" style="color:${safeColor(NCLR.flareAngle)}"><span class="label">Flare angle</span><span class="value">${fmtDeg(NM.flareAngleDeg)}</span></div>
    </div>`;

  metricsPanelBodyEl.innerHTML = distanceCard + faceCard + eyesCard + ipdCard + noseCard;
}

document.querySelectorAll('input[name="focus"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    graphics.setRenderPolicy({ focus: e.target.value });
  });
});



const vision = await FilesetResolver.forVisionTasks(
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIA_PIPE_VERSION}/wasm`
);

const gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
    delegate: "GPU",
  },
  runningMode: RUNNING_MODE,
  numHands: 2,
});

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    delegate: "GPU",
  },
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
  runningMode: RUNNING_MODE,
  numFaces: 1,
});
function estimateCameraDistanceCm(diameterPx) {
  return calcEstimateDistance(diameterPx, FOCAL_LENGTH_PX, DEFAULT_IRIS_DIAMETER_MM);
}

function updateDistanceDisplay(distanceCm) {
  // if (!distanceMeterEl || !distanceValueEl || !Number.isFinite(distanceCm)) return;
  if (smoothedDistance == null) smoothedDistance = distanceCm;

  smoothedDistance += (distanceCm - smoothedDistance) * DISTANCE_SMOOTHING;
  // distanceValueEl.textContent = "Distance to camera: " + smoothedDistance.toFixed(1).padStart(4, "\u00a0");

  // distanceMeterEl.classList.add("visible");
  // distanceMeterEl.classList.remove("pulse");
  // void distanceMeterEl.offsetWidth;
  // distanceMeterEl.classList.add("pulse");

  lastDistanceUpdate = performance.now();
}

function decayDistanceDisplay() {
  // if (!distanceMeterEl || !lastDistanceUpdate) return;
  if (performance.now() - lastDistanceUpdate > DISTANCE_VISIBILITY_TIMEOUT) {
    // distanceMeterEl.classList.remove("visible");
    smoothedDistance = null;
    lastDistanceUpdate = 0;
  }
}

function mirrorLandmarks(landmarks) {
  if (!Array.isArray(landmarks)) return null;
  return landmarks.map((lm) => {
    if (!lm) return lm;
    const mirroredX = Number.isFinite(lm.x) ? 1 - lm.x : lm.x;
    return { ...lm, x: mirroredX };
  });
}

// Enable the live webcam view and start detection.
async function enableCam() {
  const constraints = {
    audio: false,
    video: {
      ...VIDEO_SIZE,
      facingMode: "environment",
      resizeMode: "none",
    },
  };
  const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

  video.srcObject = mediaStream;
  // resizeDisplayToWindow();
  resizeDisplayToContainer();

  const handleVideoReady = () => {
    syncCanvasResolution();
    resizeDisplayToContainer();
    renderFrame();
  };

  video.addEventListener("loadedmetadata", handleVideoReady, { once: true });
}

let lastVideoTime = -1;
let gestureResults;
let faceResults;
let smoothedDistance = null;
let lastDistanceUpdate = 0;
// let noseOverlayEnabled = false;
let mirrorEnabled = true;
let lastLandmarks = null;
const measurementState = {
  ipd: null,
  faceWidth: null,
  eyes: { left: null, right: null },
  nose: null,
};
const head = createHeadTracker(HEAD_CONFIG);

noseOverlayToggleEl?.addEventListener("change", (event) => {
  noseOverlayEnabled = Boolean(event.target?.checked);
});

function applyMirrorSetting() {
  if (mirrorToggleEl) {
    mirrorToggleEl.checked = mirrorEnabled;
  }
  if (video) {
    video.classList.toggle("mirrored", mirrorEnabled);
  }
  mirrorPanelEl?.classList.add("visible");
}

mirrorToggleEl?.addEventListener("change", (event) => {
  mirrorEnabled = Boolean(event.target?.checked);
  applyMirrorSetting();
});

applyMirrorSetting();




// set initial policy
// graphics.setRenderPolicy({ detailLevel: "full", focus: "face" });

// listeners
// detailSelectEl?.addEventListener("change", (e) => {
//   graphics.setRenderPolicy({ detailLevel: e.target.value });
// });
// focusSelectEl?.addEventListener("change", (e) => {
//   graphics.setRenderPolicy({ focus: e.target.value });
// });

// grab initial values from the UI
const initialDetail =
  document.getElementById("detail_select")?.value || "standard";
const initialFocus =
  document.querySelector('input[name="focus"]:checked')?.value || "global";
const initialNose =
  document.getElementById("nose_overlay_toggle")?.checked || false;

// apply to graphics BEFORE the first render
graphics.setRenderPolicy({ detailLevel: initialDetail, focus: initialFocus });

// if you keep nose overlay state outside, also seed it (example):
let noseOverlayEnabled = initialNose;
// and keep your existing change handler:
document.getElementById("nose_overlay_toggle")?.addEventListener("change", (e) => {
  noseOverlayEnabled = e.target.checked;
});



function renderNoseMetrics(metrics) {
  // if (!noseMetricsEl || !noseMetricsBodyEl) return;
  if (!metrics) {
    // noseMetricsEl.classList.remove("visible");
    // noseMetricsBodyEl.innerHTML = "";
    return;
  }
  const rows = [
    { key: "bridge", label: "Bridge width", value: metrics.bridgeWidthMm },
    { key: "padSpan", label: "Pad width", value: metrics.padSpanMm },
    { key: "padHeight", label: "Pad height", value: metrics.padHeightMm },
    { key: "padAngle", label: "Pad angle", value: metrics.padAngleDeg, isAngle: true },
    { key: "flareAngle", label: "Flare angle", value: metrics.flareAngleDeg, isAngle: true },
  ];
  // noseMetricsBodyEl.innerHTML = rows
  //   .map(({ key, label, value, isAngle }) => {
  //     const color = NOSE_METRIC_COLORS[key] || "#FFFFFF";
  //     const formattedValue =
  //       value == null ? "--" : isAngle ? `${value.toFixed(1)}°` : `${value.toFixed(1)} mm`;
  //     return `
  //       <div class="nose-metric-row" style="color:${color}">
  //         <span class="nose-metric-label" style="color:${color}">${label}</span>
  //         <span class="nose-metric-value" style="color:${color}">${formattedValue}</span>
  //       </div>
  //     `;
  //   })
  //   .join("");
  // noseMetricsEl.classList.add("visible");
}

function resetMeasurementOutputs() {
  measurementState.ipd = null;
  measurementState.faceWidth = null;
  measurementState.eyes = { left: null, right: null };
  measurementState.nose = null;
  renderNoseMetrics(null);
}

function applyMeasurementOutputs() {
  const leftIris = head.eyes.left.iris;
  const rightIris = head.eyes.right.iris;
  if (!leftIris || !rightIris) {
    resetMeasurementOutputs();
    return;
  }
  const avgDiameterPx = (rightIris.diameterPx + leftIris.diameterPx) / 2;
  if (!Number.isFinite(avgDiameterPx) || avgDiameterPx <= 0) {
    resetMeasurementOutputs();
    return;
  }

  const mmPerPx = DEFAULT_IRIS_DIAMETER_MM / avgDiameterPx;

  measurementState.ipd = buildIpdMeasurement(leftIris, rightIris, mmPerPx);
  measurementState.faceWidth = buildFaceWidthMeasurement(head.face.widthPoints, mmPerPx);
  measurementState.eyes = {
    left: buildEyeWidthMeasurement(head.eyes.left.segment, mmPerPx),
    right: buildEyeWidthMeasurement(head.eyes.right.segment, mmPerPx),
  };

  const noseMetrics = computeNoseMetrics(head.nose.grid, mmPerPx);
  measurementState.nose = noseMetrics;
  renderNoseMetrics(noseMetrics);
}

function getCanvasDisplaySize() {
  const r = canvasElement.getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
}

function processFaceLandmarks() {
  if (!faceResults?.faceLandmarks) {
    head.reset();
    lastLandmarks = null;
    return { frameDistanceCm: null };
  }

  let frameDistanceCm = null;
  const { width: canvasWidth, height: canvasHeight } = getCanvasDisplaySize();

  faceResults.faceLandmarks.forEach((landmarks) => {
    const displayLandmarks = mirrorEnabled ? mirrorLandmarks(landmarks) : landmarks;
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

async function renderFrame() {
  const nowInMs = Date.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    gestureResults = gestureRecognizer.recognizeForVideo(video, nowInMs);
    faceResults = faceLandmarker.detectForVideo(video, nowInMs);
  }

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const { frameDistanceCm } = processFaceLandmarks();

  if (gestureResults?.landmarks) {
    // for (const landmarks of gestureResults.landmarks) {
    //   drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
    //     color: "#00FF00",
    //     lineWidth: 1,
    //   });
    //   drawingUtils.drawLandmarks(landmarks, {
    //     color: "#FF0000",
    //     lineWidth: 1,
    //   });
    // }
  }


  if (Number.isFinite(frameDistanceCm)) {
    updateDistanceDisplay(frameDistanceCm);
  } else {
    decayDistanceDisplay();
  }

  applyMeasurementOutputs();
  renderCombinedPanel(measurementState, frameDistanceCm);
  if (lastLandmarks) {
    //graphics.drawNoseGrid(lastLandmarks, HEAD_CONFIG.noseGridIndices);
  }

  graphics.beginFrame();
  graphics.drawMeasurementOverlays(measurementState, { noseOverlayEnabled:true });

  window.requestAnimationFrame(renderFrame);
}

window.addEventListener("resize", resizeDisplayToContainer);
enableCam();
