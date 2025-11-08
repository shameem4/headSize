import {
  FilesetResolver,
  GestureRecognizer,
  DrawingUtils,
  FaceLandmarker,
  // PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import {
  computeNoseMetrics,
  buildIpdMeasurement,
  buildFaceWidthMeasurement,
  buildEyeWidthMeasurement,
  extractEyeSegment,
  estimateCameraDistanceCm as calcEstimateDistance,
  minEnclosingCircle,
} from "./calculations.js";
import { createGraphics, NOSE_METRIC_COLORS } from "./graphics.js";

const MEDIA_PIPE_VERSION = "0.10.0";
const RUNNING_MODE = "VIDEO";
const VIDEO_SIZE = { width: 1280, height: 720 };
const DEFAULT_IRIS_DIAMETER_MM = 11.7;
const DEFAULT_NORM = { x: 0.8, y: 1.4 };
const FOCAL_LENGTH_PX = {
  x: VIDEO_SIZE.width * DEFAULT_NORM.x,
  y: VIDEO_SIZE.height * DEFAULT_NORM.y,
};
const DISTANCE_SMOOTHING = 0.18;
const DISTANCE_VISIBILITY_TIMEOUT = 1200; // ms

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);
const distanceMeterEl = document.getElementById("distance_meter");
const distanceValueEl = document.getElementById("distance_value");
const noseMetricsEl = document.getElementById("nose_metrics");
const noseMetricsBodyEl = document.getElementById("nose_metrics_body");
const noseOverlayToggleEl = document.getElementById("nose_overlay_toggle");
const graphics = createGraphics(canvasElement, canvasCtx);

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



let NOSE_LANDMARKS_IDX = [
  [105, 66, 107, 9, 336, 296, 334],
  [52, 65, 55, 8, 285, 295, 282],
  [190, 189, 193, 168, 417, 413, 414],
  [114, 188, 122, 6, 351, 412, 343],
  [217, 174, 196, 197, 419, 399, 437],
  [198, 236, 3, 195, 248, 456, 420],
  [131, 134, 51, 5, 281, 363, 360],
  [115, 220, 45, 4, 275, 440, 344],
];

let LEFT_EYE_WIDTH_IDX = [35, 244];
let RIGHT_EYE_WIDTH_IDX = [464, 265];

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
let lastPoseAngles = null;
let lastRightIris = null;
let lastLeftIris = null;
let lastEyeCorners = null;
let lastRotationMatrix = null;
let lastFaceWidthPoints = null;
let lastNoseGrid = null;
let lastMmPerPx = null;
let lastNoseMetrics = null;
let noseOverlayEnabled = false;
let lastEyeWidthData = { left: null, right: null };
const measurementState = {
  ipd: null,
  faceWidth: null,
  eyes: { left: null, right: null },
  nose: null,
};

noseOverlayToggleEl?.addEventListener("change", (event) => {
  noseOverlayEnabled = Boolean(event.target?.checked);
});

function getAxis2D(rotationMatrix, column) {
  if (!rotationMatrix) return null;
  const x = -rotationMatrix[0][column];
  const y = rotationMatrix[1][column];
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function extractRotation(matrixData) {
  if (!matrixData || matrixData.length < 9) return null;
  // MediaPipe provides row-major 4x4; extract top-left 3x3.
  const r00 = matrixData[0];
  const r01 = matrixData[1];
  const r02 = matrixData[2];
  const r10 = matrixData[4];
  const r11 = matrixData[5];
  const r12 = matrixData[6];
  const r20 = matrixData[8];
  const r21 = matrixData[9];
  const r22 = matrixData[10];

  const sy = Math.sqrt(r00 * r00 + r10 * r10);
  const singular = sy < 1e-6;

  let x, y, z;
  if (!singular) {
    x = Math.atan2(r21, r22);
    y = Math.atan2(-r20, sy);
    z = Math.atan2(r10, r00);
  } else {
    x = Math.atan2(-r12, r11);
    y = Math.atan2(-r20, sy);
    z = 0;
  }
  return {
    pitch: (x * 180) / Math.PI,
    yaw: (y * 180) / Math.PI,
    roll: (z * 180) / Math.PI,
    rotationMatrix: [
      [r00, r01, r02],
      [r10, r11, r12],
      [r20, r21, r22],
    ],
  };
}

function drawHeadPoseAxes(origin, rotation, scale = 120) {
  if (!rotation) return;
  const axes = [
    { dir: [rotation[0][0], rotation[1][0], rotation[2][0]], color: "#FF4D4D", label: "X" },
    { dir: [rotation[0][1], rotation[1][1], rotation[2][1]], color: "#4DFFB8", label: "Y" },
    { dir: [rotation[0][2], rotation[1][2], rotation[2][2]], color: "#4DA6FF", label: "Z" },
  ];
  axes.forEach(({ dir, color, label }) => {
    const endX = origin.x + dir[0] * scale;
    const endY = origin.y - dir[1] * scale;

    // canvasCtx.beginPath();
    // canvasCtx.moveTo(origin.x, origin.y);
    // canvasCtx.strokeStyle = color;
    // canvasCtx.lineWidth = 3;
    // canvasCtx.lineTo(endX, endY);
    // canvasCtx.stroke();

    // canvasCtx.save();
    // canvasCtx.fillStyle = color;
    // canvasCtx.font = "14px 'Segoe UI', sans-serif";
    // const labelX = endX + (endX - origin.x) * 0.05;
    // const labelY = endY + (endY - origin.y) * 0.05;
    // canvasCtx.fillText(label, labelX, labelY);
    // canvasCtx.restore();
  });
}

function drawEyeGaze(landmarks, innerIdx, outerIdx, pupilIdx, color) {
  const inner = landmarks[innerIdx];
  const outer = landmarks[outerIdx];
  const pupil = landmarks[pupilIdx];
  if (!inner || !outer || !pupil) return;

  const centerX = (inner.x + outer.x) / 2;
  const centerY = (inner.y + outer.y) / 2;
  const startX = centerX * canvasElement.width;
  const startY = centerY * canvasElement.height;
  const dx = (pupil.x - centerX) * canvasElement.width;
  const dy = (pupil.y - centerY) * canvasElement.height;

  // canvasCtx.beginPath();
  // canvasCtx.moveTo(startX, startY);
  // canvasCtx.lineTo(startX + dx * 6, startY + dy * 6);
  // canvasCtx.strokeStyle = color;
  // canvasCtx.lineWidth = 2;
  // canvasCtx.stroke();

  return {
    startX,
    startY,
    dx,
    dy,
    pupil: {
      x: pupil.x * canvasElement.width,
      y: pupil.y * canvasElement.height,
      worldX: pupil.x,
      worldY: pupil.y,
    },
  };
}

function drawIrisCircle(landmarks, irisIdx, pupilIdx, color = "#00FF00", pupilColor = "#0000FF") {
  const pupil = landmarks[pupilIdx];
  if (!pupil || !irisIdx || irisIdx.length !== 4) return null;

  const irisPts = irisIdx
    .map((idx) => landmarks[idx])
    .map((pt) =>
      pt
        ? {
            x: pt.x * canvasElement.width,
            y: pt.y * canvasElement.height,
          }
        : null
    )
    .filter(Boolean);
  if (irisPts.length !== 4) return null;

  const circle = minEnclosingCircle(irisPts);
  if (!circle || circle.radius <= 0) return null;

  // canvasCtx.beginPath();
  // canvasCtx.arc(circle.center.x, circle.center.y, circle.radius, 0, 2 * Math.PI);
  // canvasCtx.strokeStyle = color;
  // canvasCtx.lineWidth = 2;
  // canvasCtx.stroke();

  const px = pupil.x * canvasElement.width;
  const py = pupil.y * canvasElement.height;
  // canvasCtx.beginPath();
  // canvasCtx.arc(px, py, 4, 0, 2 * Math.PI);
  // canvasCtx.fillStyle = pupilColor;
  // canvasCtx.fill();

  const diameter = circle.radius * 2;
  return {
    distanceCm: estimateCameraDistanceCm(diameter),
    diameterPx: diameter,
    center: {
      x: circle.center.x,
      y: circle.center.y,
    },
  };
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

  let frameDistanceCm = null;
  let poseUpdated = false;
  if (faceResults?.faceLandmarks) {
    let rightIrisData = null;
    let leftIrisData = null;
    let cornerData = null;
    let faceWidthPoints = null;
    let eyeWidthData = { left: null, right: null };
    const matrices = faceResults.facialTransformationMatrixes || [];
    faceResults.faceLandmarks.forEach((landmarks, idx) => {
      // drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
      //   color: "#C0C0C070",
      //   lineWidth: 1,
      // });

      const poseMatrix = matrices[idx]?.data;
      const poseData = extractRotation(poseMatrix);
      if (poseData) {
        lastPoseAngles = poseData;
        lastRotationMatrix = poseData.rotationMatrix;
        poseUpdated = true;
        const nose = landmarks[1];
        if (nose) {
          const origin = {
            x: nose.x * canvasElement.width,
            y: nose.y * canvasElement.height,
          };
          drawHeadPoseAxes(origin, poseData.rotationMatrix);
        }
      }

      drawEyeGaze(landmarks, 133, 33, 468, "#FFD166");
      drawEyeGaze(landmarks, 362, 263, 473, "#06D6A0");
      if (!noseOverlayEnabled) {
        graphics.drawNoseGrid(landmarks, NOSE_LANDMARKS_IDX);
      }
      lastNoseGrid = NOSE_LANDMARKS_IDX.map((row) =>
        row.map((idx) => {
          const lm = landmarks[idx];
          return lm
            ? {
                x: lm.x * canvasElement.width,
                y: lm.y * canvasElement.height,
              }
            : null;
        })
      );

      const irisRight = drawIrisCircle(landmarks, [469, 470, 471, 472], 468, "#00FF00", "#0000FF");
      const irisLeft = drawIrisCircle(landmarks, [474, 475, 476, 477], 473, "#FF00FF", "#0000FF");

      rightIrisData = irisRight || rightIrisData;
      leftIrisData = irisLeft || leftIrisData;

      if (irisRight?.distanceCm && irisLeft?.distanceCm) {
        frameDistanceCm = (irisRight.distanceCm + irisLeft.distanceCm) / 2;
      }
      cornerData = {
        right: {
          x: landmarks[33].x * canvasElement.width,
          y: landmarks[33].y * canvasElement.height,
        },
        left: {
          x: landmarks[263].x * canvasElement.width,
          y: landmarks[263].y * canvasElement.height,
        },
      };
      faceWidthPoints = {
        left: {
          x: landmarks[127].x * canvasElement.width,
          y: landmarks[127].y * canvasElement.height,
        },
        right: {
          x: landmarks[356].x * canvasElement.width,
          y: landmarks[356].y * canvasElement.height,
        },
      };
      const leftEyeSegment = extractEyeSegment(landmarks, LEFT_EYE_WIDTH_IDX, canvasElement.width, canvasElement.height);
      if (leftEyeSegment) eyeWidthData.left = leftEyeSegment;
      const rightEyeSegment = extractEyeSegment(landmarks, RIGHT_EYE_WIDTH_IDX, canvasElement.width, canvasElement.height);
      if (rightEyeSegment) eyeWidthData.right = rightEyeSegment;
    });

    lastRightIris = rightIrisData;
    lastLeftIris = leftIrisData;
    lastEyeCorners = cornerData;
    lastFaceWidthPoints = faceWidthPoints;
    lastEyeWidthData = eyeWidthData;
  } else {
    lastRightIris = null;
    lastLeftIris = null;
    lastEyeCorners = null;
    lastFaceWidthPoints = null;
    lastNoseGrid = null;
    lastEyeWidthData = { left: null, right: null };
  }
  if (!poseUpdated) {
    lastPoseAngles = null;
    lastRotationMatrix = null;
  }

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

  if (lastRightIris && lastLeftIris) {
    const avgDiameterPx = (lastRightIris.diameterPx + lastLeftIris.diameterPx) / 2;
    if (avgDiameterPx > 0) {
      const mmPerPx = DEFAULT_IRIS_DIAMETER_MM / avgDiameterPx;
      lastMmPerPx = mmPerPx;

      measurementState.ipd = buildIpdMeasurement(lastLeftIris, lastRightIris, mmPerPx);
      measurementState.faceWidth = buildFaceWidthMeasurement(lastFaceWidthPoints, mmPerPx);
      measurementState.eyes = {
        left: buildEyeWidthMeasurement(lastEyeWidthData.left, mmPerPx),
        right: buildEyeWidthMeasurement(lastEyeWidthData.right, mmPerPx),
      };

      const noseMetrics = computeNoseMetrics(lastNoseGrid, lastMmPerPx);
      lastNoseMetrics = noseMetrics;
      renderNoseMetrics(noseMetrics);
      measurementState.nose = noseMetrics;
    }
  } else {
    lastMmPerPx = null;
    lastNoseMetrics = null;
    renderNoseMetrics(null);
    measurementState.ipd = null;
    measurementState.faceWidth = null;
    measurementState.eyes = { left: null, right: null };
    measurementState.nose = null;
  }

  graphics.drawMeasurementOverlays(measurementState, { noseOverlayEnabled });

  // if (lastPoseAngles) {
  //   canvasCtx.save();
  //   canvasCtx.font = "16px 'Courier New', monospace";
  //   canvasCtx.fillStyle = "rgba(0, 0, 0, 0.65)";
  //   canvasCtx.fillRect(12, 12, 210, 66);
  //   canvasCtx.fillStyle = "#FFFFFF";
  //   canvasCtx.fillText(`Pitch: ${lastPoseAngles.pitch.toFixed(1)}°`, 20, 32);
  //   canvasCtx.fillText(`Yaw:   ${lastPoseAngles.yaw.toFixed(1)}°`, 20, 52);
  //   canvasCtx.fillText(`Roll:  ${lastPoseAngles.roll.toFixed(1)}°`, 20, 72);
  //   canvasCtx.restore();
  // }

  window.requestAnimationFrame(renderFrame);
}

window.addEventListener("resize", resizeDisplayToWindow);
enableCam();
