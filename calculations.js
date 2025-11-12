import {
  minEnclosingCircle,
} from "./utils/geometry.js";

function pixelsPerMillimeter(pixelLength, irisDiameterMm = 11.7) {
  return pixelLength > 0 ? pixelLength / irisDiameterMm : null;
}

function millimetersPerPixel(pixelLength, irisDiameterMm = 11.7) {
  const pxPerMm = pixelsPerMillimeter(pixelLength, irisDiameterMm);
  return pxPerMm ? 1 / pxPerMm : null;
}

function estimateCameraDistanceCm(diameterPx, focalLengthPx, irisDiameterMm = 11.7) {
  const mmPerPx = millimetersPerPixel(diameterPx, irisDiameterMm);
  if (!mmPerPx) return null;
  const distanceX = (focalLengthPx.x * mmPerPx) / 10;
  const distanceY = (focalLengthPx.y * mmPerPx) / 10;
  return (distanceX + distanceY) / 2;
}

function extractRotation(matrixData) {
  if (!matrixData || matrixData.length < 9) return null;
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

  let x;
  let y;
  let z;
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

function projectLandmark(landmarks, index, canvasWidth, canvasHeight) {
  const lm = landmarks?.[index];
  if (!lm) return null;
  return {
    x: lm.x * canvasWidth,
    y: lm.y * canvasHeight,
  };
}

function buildLandmarkPair(landmarks, indexMap, canvasWidth, canvasHeight) {
  if (!landmarks || !indexMap) return null;
  const entries = Object.entries(indexMap);
  const result = {};
  for (const [key, idx] of entries) {
    const point = projectLandmark(landmarks, idx, canvasWidth, canvasHeight);
    if (!point) return null;
    result[key] = point;
  }
  return result;
}

function buildNoseGridPoints(landmarks, noseIndices, canvasWidth, canvasHeight) {
  if (!landmarks || !noseIndices) return null;
  const projectIdx = (idx) =>
    typeof idx === "number" ? projectLandmark(landmarks, idx, canvasWidth, canvasHeight) : null;

  const mapRow = (row) => {
    if (!Array.isArray(row)) return null;
    return row.map((idx) => projectIdx(idx));
  };

  if (Array.isArray(noseIndices)) {
    return noseIndices.map((row) => mapRow(row));
  }

  if (Array.isArray(noseIndices.rows)) {
    return noseIndices.rows.map((row) => mapRow(row));
  }

  const mapped = {};
  for (const [key, row] of Object.entries(noseIndices)) {
    const projected = mapRow(row);
    if (!projected) continue;
    mapped[key] = projected;
  }
  return Object.keys(mapped).length ? mapped : null;
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

  const isArrayGrid = Array.isArray(gridPoints);
  const orderedRows = isArrayGrid ? gridPoints : Object.values(gridPoints);
  const rowCount = orderedRows.length;
  if (!rowCount) return null;


  const bridgeRow = computeRowMetrics(gridPoints.bridgeRow);
  const padRow = computeRowMetrics(gridPoints.padRow);
  const tipRow = computeRowMetrics(gridPoints.tipRow);
  const padRowPoints = Array.isArray(gridPoints.padRow) ? gridPoints.padRow : [];
  if (!bridgeRow || !padRow) return null;

  const toMm = (px) => px * mmPerPx;
  const bridgeWidthMm = toMm(bridgeRow.widthPx);
  const padSpanMm = toMm(padRow.widthPx);
  const padHeightMm = Math.abs(padRow.midY - bridgeRow.midY) * mmPerPx;

  const columnReference = orderedRows.find((row) => Array.isArray(row));
  const columnCount = columnReference?.length || 0;
  const midColumn = Math.floor(columnCount / 2);
  const getColumnPoint = (rowIdx, colIdx) => {
    const row = orderedRows[rowIdx];
    if (!Array.isArray(row) || colIdx < 0 || colIdx >= row.length) return null;
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
    for (let r = topMidRow + 1; r <= Math.min(rowCount - 1, 3); r++) {
      diagCol += 1;
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
          lineAEnd: diagPoint,
          lineBEnd: bottomMid,
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

function extractEyeSegment(landmarks, idxPair, canvasWidth, canvasHeight) {
  const a = landmarks[idxPair[0]];
  const b = landmarks[idxPair[1]];
  if (!a || !b) return null;
  const ax = a.x * canvasWidth;
  const ay = a.y * canvasHeight;
  const bx = b.x * canvasWidth;
  const by = b.y * canvasHeight;
  return {
    pxLength: Math.hypot(ax - bx, ay - by),
    points: [
      { x: ax, y: ay },
      { x: bx, y: by },
    ],
  };
}

function buildIpdMeasurement(leftIris, rightIris, mmPerPx) {
  if (!leftIris || !rightIris || !Number.isFinite(mmPerPx)) return null;
  const dxPx = rightIris.center.x - leftIris.center.x;
  const dyPx = rightIris.center.y - leftIris.center.y;
  const pupilDistancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  const near = pupilDistancePx * mmPerPx;
  const far = near * 1.05;
  return {
    near,
    far,
    left: { x: leftIris.center.x, y: leftIris.center.y },
    right: { x: rightIris.center.x, y: rightIris.center.y },
  };
}

function buildFaceWidthMeasurement(points, mmPerPx) {
  if (!points?.left || !points?.right || !Number.isFinite(mmPerPx)) return null;
  const faceWidthPx = Math.hypot(points.right.x - points.left.x, points.right.y - points.left.y);
  const faceWidthMm = faceWidthPx * mmPerPx;
  if (!Number.isFinite(faceWidthMm) || faceWidthMm <= 0) return null;
  return {
    valueMm: faceWidthMm,
    left: { ...points.left },
    right: { ...points.right },
  };
}

function buildEyeWidthMeasurement(segment, mmPerPx) {
  if (!segment?.pxLength || !Number.isFinite(mmPerPx)) return null;
  return {
    valueMm: segment.pxLength * mmPerPx,
    points: segment.points.map((pt) => ({ ...pt })),
  };
}

function computeIrisMeasurement(
  landmarks,
  irisIdx,
  pupilIdx,
  canvasWidth,
  canvasHeight,
  estimateDistanceFn
) {
  const pupil = landmarks?.[pupilIdx];
  if (!pupil || !Array.isArray(irisIdx) || irisIdx.length !== 4) return null;
  const irisPts = irisIdx
    .map((idx) => landmarks[idx])
    .map((pt) =>
      pt
        ? {
            x: pt.x * canvasWidth,
            y: pt.y * canvasHeight,
          }
        : null
    )
    .filter(Boolean);
  if (irisPts.length !== irisIdx.length) return null;

  const circle = minEnclosingCircle(irisPts);
  if (!circle || circle.radius <= 0) return null;

  const diameter = circle.radius * 2;
  const distanceCm =
    typeof estimateDistanceFn === "function" ? estimateDistanceFn(diameter) : null;

  return {
    distanceCm,
    diameterPx: diameter,
    center: {
      x: circle.center.x,
      y: circle.center.y,
    },
  };
}

export const ConversionUtils = {
  pixelsPerMillimeter,
  millimetersPerPixel,
  estimateCameraDistanceCm,
};

export const PoseUtils = {
  extractRotation,
};

export const ProjectionUtils = {
  projectLandmark,
  buildLandmarkPair,
  buildNoseGridPoints,
};

export const MeasurementBuilders = {
  computeNoseMetrics,
  extractEyeSegment,
  buildIpdMeasurement,
  buildFaceWidthMeasurement,
  buildEyeWidthMeasurement,
  computeIrisMeasurement,
};
