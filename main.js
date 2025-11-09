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
const distanceMeterEl = document.getElementById("distance_meter");
const distanceValueEl = document.getElementById("distance_value");
const noseMetricsEl = document.getElementById("nose_metrics");
const noseMetricsBodyEl = document.getElementById("nose_metrics_body");
const noseOverlayToggleEl = document.getElementById("nose_overlay_toggle");
const graphics = createGraphics(canvasElement, canvasCtx);
const NOSE_METRIC_COLORS = COLOR_CONFIG.noseMetrics || {};

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

function resizeDisplayToWindow() {
  const { width, height } = getVideoDimensions();
  const widthScale = window.innerWidth / width;
  const heightScale = window.innerHeight / height;
  const scale = Math.min(widthScale, heightScale);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const targetWidth = Math.round(width * safeScale);
  const targetHeight = Math.round(height * safeScale);

  canvasElement.style.width = `${targetWidth}px`;
  canvasElement.style.height = `${targetHeight}px`;
  video.style.width = `${targetWidth}px`;
  video.style.height = `${targetHeight}px`;
}

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
  if (!distanceMeterEl || !distanceValueEl || !Number.isFinite(distanceCm)) return;
  if (smoothedDistance == null) smoothedDistance = distanceCm;

  smoothedDistance += (distanceCm - smoothedDistance) * DISTANCE_SMOOTHING;
  distanceValueEl.textContent = "Distance to camera: " + smoothedDistance.toFixed(1).padStart(4, "\u00a0");

  distanceMeterEl.classList.add("visible");
  distanceMeterEl.classList.remove("pulse");
  void distanceMeterEl.offsetWidth;
  distanceMeterEl.classList.add("pulse");

  lastDistanceUpdate = performance.now();
}

function decayDistanceDisplay() {
  if (!distanceMeterEl || !lastDistanceUpdate) return;
  if (performance.now() - lastDistanceUpdate > DISTANCE_VISIBILITY_TIMEOUT) {
    distanceMeterEl.classList.remove("visible");
    smoothedDistance = null;
    lastDistanceUpdate = 0;
  }
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
  resizeDisplayToWindow();

  const handleVideoReady = () => {
    syncCanvasResolution();
    resizeDisplayToWindow();
    renderFrame();
  };

  video.addEventListener("loadedmetadata", handleVideoReady, { once: true });
}

let lastVideoTime = -1;
let gestureResults;
let faceResults;
let smoothedDistance = null;
let lastDistanceUpdate = 0;
let noseOverlayEnabled = false;
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

function renderNoseMetrics(metrics) {
  if (!noseMetricsEl || !noseMetricsBodyEl) return;
  if (!metrics) {
    noseMetricsEl.classList.remove("visible");
    noseMetricsBodyEl.innerHTML = "";
    return;
  }
  const rows = [
    { key: "bridge", label: "Bridge width", value: metrics.bridgeWidthMm },
    { key: "padSpan", label: "Pad width", value: metrics.padSpanMm },
    { key: "padHeight", label: "Pad height", value: metrics.padHeightMm },
    { key: "padAngle", label: "Pad angle", value: metrics.padAngleDeg, isAngle: true },
    { key: "flareAngle", label: "Flare angle", value: metrics.flareAngleDeg, isAngle: true },
  ];
  noseMetricsBodyEl.innerHTML = rows
    .map(({ key, label, value, isAngle }) => {
      const color = NOSE_METRIC_COLORS[key] || "#FFFFFF";
      const formattedValue =
        value == null ? "--" : isAngle ? `${value.toFixed(1)}°` : `${value.toFixed(1)} mm`;
      return `
        <div class="nose-metric-row" style="color:${color}">
          <span class="nose-metric-label" style="color:${color}">${label}</span>
          <span class="nose-metric-value" style="color:${color}">${formattedValue}</span>
        </div>
      `;
    })
    .join("");
  noseMetricsEl.classList.add("visible");
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

function processFaceLandmarks() {
  if (!faceResults?.faceLandmarks) {
    head.reset();
    return { frameDistanceCm: null };
  }

  let frameDistanceCm = null;
  const canvasWidth = canvasElement.width;
  const canvasHeight = canvasElement.height;

  faceResults.faceLandmarks.forEach((landmarks) => {
    if (!noseOverlayEnabled) {
      graphics.drawNoseGrid(landmarks, HEAD_CONFIG.noseGridIndices.rows);
    }

    head.update(landmarks, canvasWidth, canvasHeight, estimateCameraDistanceCm);

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

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.translate(canvasElement.width, 0); // Mirror horizontally.
  canvasCtx.scale(-1, 1);

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

  canvasCtx.restore();

  applyMeasurementOutputs();

  graphics.drawMeasurementOverlays(measurementState, { noseOverlayEnabled });

  window.requestAnimationFrame(renderFrame);
}

window.addEventListener("resize", resizeDisplayToWindow);
enableCam();
