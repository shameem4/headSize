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

let NOSE_LANDMARKS_IDX = [193, 168, 417, 122, 351, 196, 419, 3, 248, 236, 456, 198, 420, 131, 360, 49, 279, 48,
                               278, 219, 439, 59, 289, 218, 438, 237, 457, 44, 19, 274] 



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
  distanceValueEl.textContent = smoothedDistance.toFixed(1).padStart(5, "\u00a0");

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
    });

    lastRightIris = rightIrisData;
    lastLeftIris = leftIrisData;
    lastEyeCorners = cornerData;
  } else {
    lastRightIris = null;
    lastLeftIris = null;
    lastEyeCorners = null;
  }
  if (!poseUpdated) {
    lastPoseAngles = null;
    lastRotationMatrix = null;
  }

  if (gestureResults?.landmarks) {
    for (const landmarks of gestureResults.landmarks) {
      drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 1,
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#FF0000",
      });
    }
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

      let axisX = getAxis2D(lastRotationMatrix, 0) || { x: 1, y: 0 };
      let axisY = getAxis2D(lastRotationMatrix, 1) || { x: 0, y: -1 };
      const axisXLen = Math.hypot(axisX.x, axisX.y) || 1;
      axisX = { x: axisX.x / axisXLen, y: axisX.y / axisXLen };
      const axisYLen = Math.hypot(axisY.x, axisY.y) || 1;
      axisY = { x: axisY.x / axisYLen, y: axisY.y / axisYLen };

      const outward = 45;
      const upOffset = 30;
      const leftLabel = {
        x: leftPupilDisplay.x - axisX.x * outward + axisY.x * upOffset,
        y: leftPupilDisplay.y - axisX.y * outward + axisY.y * upOffset,
      };
      const rightLabel = {
        x: rightPupilDisplay.x - axisX.x * outward + axisY.x * upOffset,
        y: rightPupilDisplay.y - axisX.y * outward + axisY.y * upOffset,
      };
      const midPoint = {
        x: (leftLabel.x + rightLabel.x) / 2,
        y: (leftLabel.y + rightLabel.y) / 2,
      };

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

      canvasCtx.save();
      canvasCtx.fillStyle = "#FFFFFF";
      canvasCtx.font = "bold 18px 'Segoe UI', sans-serif";
      canvasCtx.textAlign = "center";
      canvasCtx.fillText(`${lastIpdNear.toFixed(1)} mm`, midPoint.x, midPoint.y - 6);
      canvasCtx.restore();
    }
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
