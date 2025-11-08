import {
  FilesetResolver,
  GestureRecognizer,
  DrawingUtils,
  FaceLandmarker,
  // PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

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
const EPSILON = 1e-3;

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);
const distanceMeterEl = document.getElementById("distance_meter");
const distanceValueEl = document.getElementById("distance_value");
const noseMetricsEl = document.getElementById("nose_metrics");
const noseMetricsBodyEl = document.getElementById("nose_metrics_body");
const noseOverlayToggleEl = document.getElementById("nose_overlay_toggle");

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

let LEFT_EYE_WIDTH_IDX=[35,244];
let RIGHT_EYE_WIDTH_IDX=[464,265];
const NOSE_METRIC_COLORS = {
  bridge: "#FF9F43",
  padSpan: "#00FFC8",
  padHeight: "#FFD166",
  padAngle: "#4DA6FF",
  flareAngle: "#FF6AD5",
};
const EYE_WIDTH_COLORS = {
  left: "#6AE1FF",
  right: "#FF9BEA",
};

function pixelsPerMillimeter(pixelLength) {
  return pixelLength > 0 ? pixelLength / DEFAULT_IRIS_DIAMETER_MM : null;
}

function millimetersPerPixel(pixelLength) {
  const pxPerMm = pixelsPerMillimeter(pixelLength);
  return pxPerMm ? 1 / pxPerMm : null;
}

function estimateCameraDistanceCm(diameterPx) {
  const mmPerPx = millimetersPerPixel(diameterPx);
  if (!mmPerPx) return null;

  const distanceX = (FOCAL_LENGTH_PX.x * mmPerPx) / 10;
  const distanceY = (FOCAL_LENGTH_PX.y * mmPerPx) / 10;

  return (distanceX + distanceY) / 2;
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
let lastIpdNear = null;
let lastIpdFar = null;
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

function drawSmoothCurve(points) {
  if (points.length < 2) return;
  canvasCtx.beginPath();
  canvasCtx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    canvasCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  canvasCtx.stroke();
}


function drawRotatedLabel(text, position, angle, color = "#FFFFFF") {
  if (!text || !position) return;
  let rot = angle;
  while (rot > Math.PI) rot -= Math.PI * 2;
  while (rot <= -Math.PI) rot += Math.PI * 2;
  if (rot > Math.PI / 2) rot -= Math.PI;
  if (rot < -Math.PI / 2) rot += Math.PI;

  canvasCtx.save();
  canvasCtx.translate(position.x, position.y);
  canvasCtx.rotate(rot);
  canvasCtx.fillStyle = color;
  canvasCtx.font = "bold 18px 'Segoe UI', sans-serif";
  canvasCtx.textAlign = "center";
  canvasCtx.textBaseline = "middle";
  canvasCtx.fillText(text, 0, 0);
  canvasCtx.restore();
}

function toDisplayPoint(pt) {
  if (!pt) return null;
  return {
    x: toDisplayX(pt.x),
    y: pt.y,
  };
}

function extractSegment(landmarks, idxPair) {
  const a = landmarks[idxPair[0]];
  const b = landmarks[idxPair[1]];
  if (!a || !b) return null;
  const ax = a.x * canvasElement.width;
  const ay = a.y * canvasElement.height;
  const bx = b.x * canvasElement.width;
  const by = b.y * canvasElement.height;
  return {
    pxLength: Math.hypot(ax - bx, ay - by),
    points: [
      { x: ax, y: ay },
      { x: bx, y: by },
    ],
  };
}

function computeRowMetrics(rowPoints) {
  if (!rowPoints) return null;
  const valid = rowPoints.filter(Boolean);
  if (valid.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let sumY = 0;
  let leftPt = null;
  let rightPt = null;
  valid.forEach((pt) => {
    if (pt.x < minX) {
      minX = pt.x;
      leftPt = { x: pt.x, y: pt.y };
    }
    if (pt.x > maxX) {
      maxX = pt.x;
      rightPt = { x: pt.x, y: pt.y };
    }
    sumY += pt.y;
  });
  return {
    widthPx: maxX - minX,
    midY: sumY / valid.length,
    left: leftPt,
    right: rightPt,
  };
}

function computeNoseMetrics(gridPoints, mmPerPx) {
  if (!gridPoints || !Number.isFinite(mmPerPx) || mmPerPx <= 0) return null;
  const rowCount = gridPoints.length;
  if (!rowCount) return null;
  const bridgeRowIndex = Math.min(2, rowCount - 1);
  const bridgeRow = computeRowMetrics(gridPoints[bridgeRowIndex]);
  const padRowIndex = Math.min(3, rowCount - 1);
  const padRow = computeRowMetrics(gridPoints[padRowIndex]);
  const tipRow = computeRowMetrics(gridPoints[rowCount - 1]);
  const padRowPoints = gridPoints[padRowIndex] || [];
  if (!bridgeRow || !padRow) return null;

  const toMm = (px) => px * mmPerPx;
  const bridgeWidthMm = toMm(bridgeRow.widthPx);
  const padSpanMm = toMm(padRow.widthPx);
  const padHeightMm = Math.abs(padRow.midY - bridgeRow.midY) * mmPerPx;
  const columnCount = gridPoints[0]?.length || 0;
  const midColumn = Math.floor(columnCount / 2);
  const getColumnPoint = (rowIdx, colIdx) => {
    const row = gridPoints[rowIdx];
    if (!row || colIdx < 0 || colIdx >= row.length) return null;
    return row[colIdx];
  };

  let topMid = null;
  let bottomMid = null;
  let topMidRow = 0;
  for (let r = 1; r <= Math.min(rowCount - 1, 3); r++) {
    const pt = getColumnPoint(r, midColumn);
    if (pt && !topMid) {
      topMid = pt;
      topMidRow = r;
    }
    if (pt) bottomMid = pt;
  }

  let diagPoint = topMid;
  let diagCol = midColumn;
  if (topMid) {
    for (let r = topMidRow + 1; r <= Math.min(rowCount - 1, 8); r++) {
      diagCol -= 1;
      const candidate = getColumnPoint(r, diagCol);
      if (!candidate) break;
      diagPoint = candidate;
    }
  }

  const padAngleDeg = (() => {
    if (!topMid || !bottomMid || !diagPoint) return null;
    const vecA = { x: bottomMid.x - topMid.x, y: bottomMid.y - topMid.y };
    const vecB = { x: diagPoint.x - topMid.x, y: diagPoint.y - topMid.y };
    const magA = Math.hypot(vecA.x, vecA.y);
    const magB = Math.hypot(vecB.x, vecB.y);
    if (!magA || !magB) return null;
    const cosTheta = (vecA.x * vecB.x + vecA.y * vecB.y) / (magA * magB);
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
    return (theta * 180) / Math.PI;
  })();
  const padAngleLines =
    topMid && bottomMid && diagPoint
      ? {
          origin: topMid,
          lineAEnd: bottomMid,
          lineBEnd: diagPoint,
        }
      : null;
  const flareAngleDeg = (() => {
    if (!padRowPoints.length) return null;
    const midIdx = Math.floor(padRowPoints.length / 2);
    const center = padRowPoints[midIdx];
    const left = padRowPoints[midIdx - 1];
    const right = padRowPoints[midIdx + 1];
    if (!center || !left || !right) return null;
    const leftVec = { x: left.x - center.x, y: left.y - center.y };
    const rightVec = { x: right.x - center.x, y: right.y - center.y };
    const leftMag = Math.hypot(leftVec.x, leftVec.y);
    const rightMag = Math.hypot(rightVec.x, rightVec.y);
    if (!leftMag || !rightMag) return null;
    const cosTheta = (leftVec.x * rightVec.x + leftVec.y * rightVec.y) / (leftMag * rightMag);
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
    return (theta * 180) / Math.PI;
  })();

  return {
    bridgeWidthMm,
    padSpanMm,
    padHeightMm,
    padAngleDeg,
    padAngleLines,
    flareAngleDeg,
    rows: {
      bridge: bridgeRow,
      pad: padRow,
      tip: tipRow,
    },
  };
}

function buildIpdMeasurement(leftIris, rightIris, mmPerPx) {
  if (!leftIris || !rightIris || !Number.isFinite(mmPerPx)) return null;
  const dxPx = rightIris.center.x - leftIris.center.x;
  const dyPx = rightIris.center.y - leftIris.center.y;
  const pupilDistancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  const near = pupilDistancePx * mmPerPx;
  const far = near * 1.05;
  const leftPupilDisplay = {
    x: toDisplayX(leftIris.center.x),
    y: leftIris.center.y,
  };
  const rightPupilDisplay = {
    x: toDisplayX(rightIris.center.x),
    y: rightIris.center.y,
  };
  const baseVec = {
    x: rightPupilDisplay.x - leftPupilDisplay.x,
    y: rightPupilDisplay.y - leftPupilDisplay.y,
  };
  const baseLen = Math.hypot(baseVec.x, baseVec.y) || 1;
  const baseNorm = { x: baseVec.x / baseLen, y: baseVec.y / baseLen };
  const perp = { x: -baseNorm.y, y: baseNorm.x };
  return {
    near,
    far,
    leftPupilDisplay,
    rightPupilDisplay,
    baseVec,
    perp,
  };
}

function drawIpdMeasurement(data) {
  if (!data) return;
  const { leftPupilDisplay, rightPupilDisplay, perp, baseVec, near, far } = data;
  const textLift = 18;
  const baseAngle = Math.atan2(baseVec.y, baseVec.x);
  const buildLabelPoint = (offset) => ({
    left: {
      x: leftPupilDisplay.x + perp.x * offset,
      y: leftPupilDisplay.y + perp.y * offset,
    },
    right: {
      x: rightPupilDisplay.x + perp.x * offset,
      y: rightPupilDisplay.y + perp.y * offset,
    },
  });

  const drawRail = (offset, color, label) => {
    const { left, right } = buildLabelPoint(offset);
    const leftTextAnchor = {
      x: left.x + perp.x * textLift,
      y: left.y + perp.y * textLift,
    };
    const rightTextAnchor = {
      x: right.x + perp.x * textLift,
      y: right.y + perp.y * textLift,
    };
    const midPoint = {
      x: (leftTextAnchor.x + rightTextAnchor.x) / 2,
      y: (leftTextAnchor.y + rightTextAnchor.y) / 2,
    };
    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(left.x, left.y);
    canvasCtx.lineTo(right.x, right.y);
    canvasCtx.moveTo(left.x, left.y);
    canvasCtx.lineTo(leftPupilDisplay.x, leftPupilDisplay.y);
    canvasCtx.moveTo(right.x, right.y);
    canvasCtx.lineTo(rightPupilDisplay.x, rightPupilDisplay.y);
    canvasCtx.stroke();
    canvasCtx.restore();
    drawRotatedLabel(label, midPoint, baseAngle, color);
  };

  drawRail(55, "#FFFFFF", `Near ${near.toFixed(1)} mm`);
  if (Number.isFinite(far)) {
    drawRail(85, "#A0FFE6", `Far ${far.toFixed(1)} mm`);
  }
}

function buildFaceWidthMeasurement(points, mmPerPx) {
  if (!points?.left || !points?.right || !Number.isFinite(mmPerPx)) return null;
  const faceWidthPx = Math.hypot(points.right.x - points.left.x, points.right.y - points.left.y);
  const faceWidthMm = faceWidthPx * mmPerPx;
  if (!Number.isFinite(faceWidthMm) || faceWidthMm <= 0) return null;
  return {
    valueMm: faceWidthMm,
    left: {
      x: toDisplayX(points.left.x),
      y: points.left.y,
    },
    right: {
      x: toDisplayX(points.right.x),
      y: points.right.y,
    },
  };
}

function drawFaceWidthMeasurement(data) {
  if (!data) return;
  const { valueMm, left, right } = data;
  const faceVec = { x: right.x - left.x, y: right.y - left.y };
  const faceLen = Math.hypot(faceVec.x, faceVec.y) || 1;
  const faceNorm = { x: faceVec.x / faceLen, y: faceVec.y / faceLen };
  const facePerp = { x: -faceNorm.y, y: faceNorm.x };
  const spanOffset = 50;
  const labelLift = 16;
  const leftFaceLabel = {
    x: left.x + facePerp.x * spanOffset,
    y: left.y + facePerp.y * spanOffset,
  };
  const rightFaceLabel = {
    x: right.x + facePerp.x * spanOffset,
    y: right.y + facePerp.y * spanOffset,
  };
  const faceMid = {
    x: (leftFaceLabel.x + rightFaceLabel.x) / 2 + facePerp.x * labelLift,
    y: (leftFaceLabel.y + rightFaceLabel.y) / 2 + facePerp.y * labelLift,
  };
  const faceAngle = Math.atan2(faceVec.y, faceVec.x);

  canvasCtx.save();
  canvasCtx.strokeStyle = "#FFFFFF";
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(leftFaceLabel.x, leftFaceLabel.y);
  canvasCtx.lineTo(rightFaceLabel.x, rightFaceLabel.y);
  canvasCtx.moveTo(leftFaceLabel.x, leftFaceLabel.y);
  canvasCtx.lineTo(left.x, left.y);
  canvasCtx.moveTo(rightFaceLabel.x, rightFaceLabel.y);
  canvasCtx.lineTo(right.x, right.y);
  canvasCtx.stroke();
  canvasCtx.restore();

  drawRotatedLabel(`Face ${valueMm.toFixed(1)} mm`, faceMid, faceAngle, "#FFFFFF");
}

function buildEyeWidthMeasurement(segment, mmPerPx) {
  if (!segment?.pxLength || !Number.isFinite(mmPerPx)) return null;
  return {
    segment,
    valueMm: segment.pxLength * mmPerPx,
  };
}

function drawMeasurementOverlays() {
  if (!noseOverlayEnabled) {
    if (measurementState.ipd) drawIpdMeasurement(measurementState.ipd);
    if (measurementState.faceWidth) drawFaceWidthMeasurement(measurementState.faceWidth);
    if (measurementState.eyes.left) {
      drawEyeWidthRail(
        measurementState.eyes.left.segment,
        "Left eye",
        measurementState.eyes.left.valueMm,
        EYE_WIDTH_COLORS.left,
        20
      );
    }
    if (measurementState.eyes.right) {
      drawEyeWidthRail(
        measurementState.eyes.right.segment,
        "Right eye",
        measurementState.eyes.right.valueMm,
        EYE_WIDTH_COLORS.right,
        20
      );
    }
  } else if (measurementState.nose) {
    drawNoseOverlay(measurementState.nose);
  }
}
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
    .map(
      ({ key, label, value, isAngle }) => {
        const color = NOSE_METRIC_COLORS[key] || "#FFFFFF";
        const hasValue = Number.isFinite(value);
        const formattedValue = hasValue ? (isAngle ? `${value.toFixed(1)}°` : `${value.toFixed(1)} mm`) : "--";
        return `
        <div class="nose-metric-row" style="color:${color}">
          <span class="nose-metric-label" style="color:${color}">${label}</span>
          <span class="nose-metric-value" style="color:${color}">${formattedValue}</span>
        </div>
      `;
      }
    )
    .join("");
  noseMetricsEl.classList.add("visible");
}

function drawHorizontalBracket(row, label, value, color, placement = "top") {
  if (!row?.left || !row?.right || !Number.isFinite(value)) return;
  const left = toDisplayPoint(row.left);
  const right = toDisplayPoint(row.right);
  if (!left || !right) return;
  const direction = placement === "top" ? -1 : 1;
  
  const offset = 8;
  const lineY =
    direction === -1
      ? Math.min(left.y, right.y) + direction * offset
      : Math.max(left.y, right.y) + direction * offset;

  canvasCtx.save();
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(left.x, left.y);
  canvasCtx.lineTo(left.x, lineY);
  canvasCtx.moveTo(right.x, right.y);
  canvasCtx.lineTo(right.x, lineY);
  canvasCtx.moveTo(left.x, lineY);
  canvasCtx.lineTo(right.x, lineY);
  canvasCtx.stroke();
  canvasCtx.restore();

  const labelPos = {
    x: (left.x + right.x) / 2,
    y: lineY + direction * 16,
  };
  drawRotatedLabel(`${label} ${value.toFixed(1)} mm`, labelPos, 0, color);
}

function drawPadHeightBracket(bridgeRow, padRow, value, color) {
  if (!bridgeRow?.left || !padRow?.left || !Number.isFinite(value)) return;
  const bridgePt = toDisplayPoint(bridgeRow.left);
  const padPt = toDisplayPoint(padRow.left);
  if (!bridgePt || !padPt) return;
  const offsetX = Math.min(bridgePt.x, padPt.x) + 120;

  canvasCtx.save();
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(bridgePt.x, bridgePt.y);
  canvasCtx.lineTo(offsetX, bridgePt.y);
  canvasCtx.lineTo(offsetX, padPt.y);
  canvasCtx.lineTo(padPt.x, padPt.y);
  canvasCtx.stroke();
  canvasCtx.restore();

  const labelPos = {
    x: offsetX + 10,
    y: (bridgePt.y + padPt.y) / 2,
  };
  drawRotatedLabel(`Pad Height ${value.toFixed(1)} mm`, labelPos, -Math.PI / 2, color);
}

function drawPadAngleGuide(lines, value, color) {
  if (!lines || !Number.isFinite(value)) return;
  const origin = toDisplayPoint(lines.origin);
  const endA = toDisplayPoint(lines.lineAEnd);
  const endB = toDisplayPoint(lines.lineBEnd);
  if (!origin || !endA || !endB) return;

  canvasCtx.save();
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(origin.x, origin.y);
  canvasCtx.lineTo(endA.x, endA.y);
  canvasCtx.moveTo(origin.x, origin.y);
  canvasCtx.lineTo(endB.x, endB.y);
  canvasCtx.stroke();
  canvasCtx.restore();

  const labelPos = {
    x: origin.x + 75,
    y: Math.min(endA.y, endB.y) + 55,
  };
  drawRotatedLabel(`Pad Angle ${value.toFixed(1)}°`, labelPos, 0, color);
}

function drawFlareAngleGuide(padRow, value, color) {
  if (!padRow?.left || !padRow?.right || !Number.isFinite(value)) return;
  const center = {
    x: (padRow.left.x + padRow.right.x) / 2,
    y: padRow.midY,
  };
  const left = toDisplayPoint(padRow.left);
  const right = toDisplayPoint(padRow.right);
  const vertex = toDisplayPoint(center);
  if (!left || !right || !vertex) return;
  const offsetY = Math.max(left.y, right.y) + 12;
  const bottomCenter = { x: vertex.x, y: offsetY };

  canvasCtx.save();
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(bottomCenter.x, bottomCenter.y);
  canvasCtx.lineTo(left.x, left.y);
  canvasCtx.moveTo(bottomCenter.x, bottomCenter.y);
  canvasCtx.lineTo(right.x, right.y);
  canvasCtx.stroke();
  canvasCtx.restore();

  const labelPos = {
    x: bottomCenter.x - 80,
    y: bottomCenter.y + 18,
  };
  drawRotatedLabel(`Flare Angle ${value.toFixed(1)}°`, labelPos, 0, color);
}

function drawEyeWidthRail(segment, label, value, color, offset = 18) {
  if (!segment?.points || !Number.isFinite(value)) return;
  const start = {
    x: toDisplayX(segment.points[0].x),
    y: segment.points[0].y,
  };
  const end = {
    x: toDisplayX(segment.points[1].x),
    y: segment.points[1].y,
  };
  const vec = { x: end.x - start.x, y: end.y - start.y };
  const len = Math.hypot(vec.x, vec.y) || 1;
  const norm = { x: vec.x / len, y: vec.y / len };
  const perp = { x: -norm.y, y: norm.x };
  const leftLabel = {
    x: start.x + perp.x * offset,
    y: start.y + perp.y * offset-20,
  };
  const rightLabel = {
    x: end.x + perp.x * offset,
    y: end.y + perp.y * offset-20,
  };
  const midPoint = {
    x: (leftLabel.x + rightLabel.x) / 2,
    y: 20+(leftLabel.y + rightLabel.y) / 2,
  };

  canvasCtx.save();
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.beginPath();
  canvasCtx.moveTo(leftLabel.x, leftLabel.y);
  canvasCtx.lineTo(rightLabel.x, rightLabel.y);
  canvasCtx.moveTo(leftLabel.x, leftLabel.y);
  canvasCtx.lineTo(start.x, start.y);
  canvasCtx.moveTo(rightLabel.x, rightLabel.y);
  canvasCtx.lineTo(end.x, end.y);
  canvasCtx.stroke();
  canvasCtx.restore();

  drawRotatedLabel(`${label} ${value.toFixed(1)} mm`, midPoint, Math.atan2(vec.y, vec.x), color);
}

function drawNoseOverlay(metrics) {
  if (!noseOverlayEnabled || !metrics?.rows) return;
  const { bridge, pad, tip } = metrics.rows;
  if (Number.isFinite(metrics.bridgeWidthMm)) {
    drawHorizontalBracket(bridge, "Bridge width", metrics.bridgeWidthMm, NOSE_METRIC_COLORS.bridge, "top");
  }
  if (Number.isFinite(metrics.padSpanMm)) {
    drawHorizontalBracket(pad, "Pad width", metrics.padSpanMm, NOSE_METRIC_COLORS.padSpan, "top");
  }
  if (Number.isFinite(metrics.padHeightMm)) {
    drawPadHeightBracket(bridge, pad, metrics.padHeightMm, NOSE_METRIC_COLORS.padHeight);
  }
  if (Number.isFinite(metrics.padAngleDeg) && metrics.padAngleLines) {
    drawPadAngleGuide(metrics.padAngleLines, metrics.padAngleDeg, NOSE_METRIC_COLORS.padAngle);
  }
  if (Number.isFinite(metrics.flareAngleDeg)) {
    drawFlareAngleGuide(pad, metrics.flareAngleDeg, NOSE_METRIC_COLORS.flareAngle);
  }
}

function toDisplayX(x) {
  return canvasElement.width - x;
}

function rotate2D(x, y, angleRad) {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return {
    x: x * cosA - y * sinA,
    y: x * sinA + y * cosA,
  };
}

function distanceBetweenPoints(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function circleFromTwoPoints(p1, p2) {
  return {
    center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    radius: distanceBetweenPoints(p1, p2) / 2,
  };
}

function circleFromThreePoints(p1, p2, p3) {
  const d =
    2 *
    (p1.x * (p2.y - p3.y) +
      p2.x * (p3.y - p1.y) +
      p3.x * (p1.y - p2.y));
  if (Math.abs(d) < EPSILON) return null;

  const ux =
    ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) +
      (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) +
      (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) /
    d;
  const uy =
    ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) +
      (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) +
      (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) /
    d;
  const center = { x: ux, y: uy };
  return {
    center,
    radius: distanceBetweenPoints(center, p1),
  };
}

function isPointInsideCircle(point, circle) {
  if (!circle) return false;
  return distanceBetweenPoints(point, circle.center) <= circle.radius + EPSILON;
}

function minEnclosingCircle(points) {
  if (!points.length) return null;
  let circle = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (circle && isPointInsideCircle(p, circle)) continue;

    circle = { center: { ...p }, radius: 0 };
    for (let j = 0; j < i; j++) {
      const q = points[j];
      if (isPointInsideCircle(q, circle)) continue;

      circle = circleFromTwoPoints(p, q);
      for (let k = 0; k < j; k++) {
        const r = points[k];
        if (isPointInsideCircle(r, circle)) continue;

        const candidate = circleFromThreePoints(p, q, r);
        if (candidate) circle = candidate;
      }
    }
  }
  return circle;
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
        drawNoseGrid(landmarks);
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
      const leftEyeSegment = extractSegment(landmarks, LEFT_EYE_WIDTH_IDX);
      if (leftEyeSegment) eyeWidthData.left = leftEyeSegment;
      const rightEyeSegment = extractSegment(landmarks, RIGHT_EYE_WIDTH_IDX);
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

      const dxPx = lastRightIris.center.x - lastLeftIris.center.x;
      const dyPx = lastRightIris.center.y - lastLeftIris.center.y;
      const pupilDistancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
      lastIpdNear = pupilDistancePx * mmPerPx;

      lastIpdFar = lastIpdNear * 1.05;

      const leftPupilDisplay = {
        x: toDisplayX(lastLeftIris.center.x),
        y: lastLeftIris.center.y,
      };
      const rightPupilDisplay = {
        x: toDisplayX(lastRightIris.center.x),
        y: lastRightIris.center.y,
      };

      const baseVec = {
        x: rightPupilDisplay.x - leftPupilDisplay.x,
        y: rightPupilDisplay.y - leftPupilDisplay.y,
      };
      const baseLen = Math.hypot(baseVec.x, baseVec.y) || 1;
      const baseNorm = { x: baseVec.x / baseLen, y: baseVec.y / baseLen };
      const perp = { x: -baseNorm.y, y: baseNorm.x };

      const normalOffset = 55;
      const textLift = 18;
      const baseAngle = Math.atan2(baseVec.y, baseVec.x);
      const leftLabel = {
        x: leftPupilDisplay.x + perp.x * normalOffset,
        y: leftPupilDisplay.y + perp.y * normalOffset,
      };
      const rightLabel = {
        x: rightPupilDisplay.x + perp.x * normalOffset,
        y: rightPupilDisplay.y + perp.y * normalOffset,
      };
      const leftTextAnchor = {
        x: leftLabel.x + perp.x * textLift,
        y: leftLabel.y + perp.y * textLift,
      };
      const rightTextAnchor = {
        x: rightLabel.x + perp.x * textLift,
        y: rightLabel.y + perp.y * textLift,
      };
      const midPoint = {
        x: (leftTextAnchor.x + rightTextAnchor.x) / 2,
        y: (leftTextAnchor.y + rightTextAnchor.y) / 2,
      };

      if (!noseOverlayEnabled) {
        canvasCtx.save();
        canvasCtx.strokeStyle = "#FFFFFF";
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();
        canvasCtx.moveTo(leftLabel.x, leftLabel.y);
        canvasCtx.lineTo(rightLabel.x, rightLabel.y);
        canvasCtx.stroke();

        canvasCtx.beginPath();
        canvasCtx.moveTo(leftLabel.x, leftLabel.y);
        canvasCtx.lineTo(leftPupilDisplay.x, leftPupilDisplay.y);
        canvasCtx.moveTo(rightLabel.x, rightLabel.y);
        canvasCtx.lineTo(rightPupilDisplay.x, rightPupilDisplay.y);
        canvasCtx.stroke();
        canvasCtx.restore();

        drawRotatedLabel(`Near ${lastIpdNear.toFixed(1)} mm`, midPoint, baseAngle, "#FFFFFF");
        if (lastIpdFar) {
          const farMid = {
            x: midPoint.x + perp.x * 26,
            y: midPoint.y + perp.y * 26,
          };
          drawRotatedLabel(`Far ${lastIpdFar.toFixed(1)} mm`, farMid, baseAngle, "#c0c0cc");
        }
      }

      const noseMetrics = computeNoseMetrics(lastNoseGrid, lastMmPerPx);
      lastNoseMetrics = noseMetrics;
      renderNoseMetrics(noseMetrics);
      if (noseOverlayEnabled) {
        drawNoseOverlay(noseMetrics);
      }

      if (!noseOverlayEnabled) {
        const leftEyeMm = lastEyeWidthData.left?.pxLength ? lastEyeWidthData.left.pxLength * mmPerPx : null;
        const rightEyeMm = lastEyeWidthData.right?.pxLength ? lastEyeWidthData.right.pxLength * mmPerPx : null;
        if (leftEyeMm) {
          drawEyeWidthRail(lastEyeWidthData.left, "Leye width", leftEyeMm, "#ffffFF", -150);
        }
        if (rightEyeMm) {
          drawEyeWidthRail(lastEyeWidthData.right, "Reye width", rightEyeMm, "#ffffff", -150);
        }
      }

      if (!noseOverlayEnabled && lastFaceWidthPoints?.left && lastFaceWidthPoints?.right) {
        const faceWidthPx = Math.hypot(
          lastFaceWidthPoints.right.x - lastFaceWidthPoints.left.x,
          lastFaceWidthPoints.right.y - lastFaceWidthPoints.left.y
        );
        const faceWidthMm = faceWidthPx * mmPerPx;
        if (faceWidthMm > 0) {
          const leftFaceDisplay = {
            x: toDisplayX(lastFaceWidthPoints.left.x),
            y: lastFaceWidthPoints.left.y,
          };
          const rightFaceDisplay = {
            x: toDisplayX(lastFaceWidthPoints.right.x),
            y: lastFaceWidthPoints.right.y,
          };
          const faceVec = {
            x: rightFaceDisplay.x - leftFaceDisplay.x,
            y: rightFaceDisplay.y - leftFaceDisplay.y,
          };
          const faceLen = Math.hypot(faceVec.x, faceVec.y) || 1;
          const faceNorm = { x: faceVec.x / faceLen, y: faceVec.y / faceLen };
          const facePerp = { x: -faceNorm.y, y: faceNorm.x };
          const spanOffset = 50;
          const labelLift = 16;
          const leftFaceLabel = {
            x: leftFaceDisplay.x + facePerp.x * spanOffset,
            y: leftFaceDisplay.y + facePerp.y * spanOffset,
          };
          const rightFaceLabel = {
            x: rightFaceDisplay.x + facePerp.x * spanOffset,
            y: rightFaceDisplay.y + facePerp.y * spanOffset,
          };
          const faceMid = {
            x: (leftFaceLabel.x + rightFaceLabel.x) / 2 + facePerp.x * labelLift,
            y: (leftFaceLabel.y + rightFaceLabel.y) / 2 + facePerp.y * labelLift,
          };
          const faceAngle = Math.atan2(faceVec.y, faceVec.x);

          canvasCtx.save();
          canvasCtx.strokeStyle = "#FFFFFF";
          canvasCtx.lineWidth = 2;
          canvasCtx.beginPath();
          canvasCtx.moveTo(leftFaceLabel.x, leftFaceLabel.y);
          canvasCtx.lineTo(rightFaceLabel.x, rightFaceLabel.y);
          canvasCtx.moveTo(leftFaceLabel.x, leftFaceLabel.y);
          canvasCtx.lineTo(leftFaceDisplay.x, leftFaceDisplay.y);
          canvasCtx.moveTo(rightFaceLabel.x, rightFaceLabel.y);
          canvasCtx.lineTo(rightFaceDisplay.x, rightFaceDisplay.y);
          canvasCtx.stroke();
          canvasCtx.restore();

          drawRotatedLabel(`Face ${faceWidthMm.toFixed(1)} mm`, faceMid, faceAngle, "#FFFFFF");
        }
      }
    }
  } else {
    lastMmPerPx = null;
    lastNoseMetrics = null;
    renderNoseMetrics(null);
  }

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
