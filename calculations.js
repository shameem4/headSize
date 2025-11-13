import {
  minEnclosingCircle,
} from "./utils/geometry.js";

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

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

// ============================================================================
// POSE UTILITIES
// ============================================================================

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

// ============================================================================
// PROJECTION UTILITIES
// ============================================================================

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

// ============================================================================
// MEASUREMENT BUILDERS - OPTIMIZED
// ============================================================================

/**
 * Compute row metrics with single-pass optimization
 * OPTIMIZED: Single loop instead of filter + forEach
 */
function computeRowMetrics(rowPoints) {
  if (!rowPoints) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let sumY = 0;
  let leftPt = null;
  let rightPt = null;
  let validCount = 0;

  // Single pass through array
  for (let i = 0; i < rowPoints.length; i++) {
    const pt = rowPoints[i];
    if (!pt) continue;

    validCount++;
    sumY += pt.y;

    if (pt.x < minX) {
      minX = pt.x;
      leftPt = pt; // Direct reference, no object creation
    }
    if (pt.x > maxX) {
      maxX = pt.x;
      rightPt = pt;
    }
  }

  if (validCount < 2) return null;

  return {
    widthPx: maxX - minX,
    midY: sumY / validCount,
    left: leftPt,
    right: rightPt,
  };
}

/**
 * Calculate angle between two vectors (optimized)
 * OPTIMIZED: Inlined to avoid function call overhead
 */
function calculateAngleDeg(vecA, vecB) {
  const magA = Math.hypot(vecA.x, vecA.y);
  const magB = Math.hypot(vecB.x, vecB.y);

  if (!magA || !magB) return null;

  // Clamp cosTheta to [-1, 1] to avoid NaN from acos
  const cosTheta = (vecA.x * vecB.x + vecA.y * vecB.y) / (magA * magB);
  const clamped = Math.max(-1, Math.min(1, cosTheta));
  const theta = Math.acos(clamped);

  return (theta * 180) / Math.PI;
}

/**
 * Compute nose metrics with optimizations
 * OPTIMIZED: Removed IIFEs, cached calculations, single-pass logic
 */
function computeNoseMetrics(gridPoints, mmPerPx) {
  // Early validation
  if (!gridPoints || !Number.isFinite(mmPerPx) || mmPerPx <= 0) return null;

  // Extract rows
  const bridgeRow = computeRowMetrics(gridPoints.bridgeRow);
  const padRow = computeRowMetrics(gridPoints.padRow);
  const tipRow = computeRowMetrics(gridPoints.tipRow);

  if (!bridgeRow || !padRow) return null;

  // Basic measurements (optimized: direct multiplication)
  const bridgeWidthMm = bridgeRow.widthPx * mmPerPx;
  const padSpanMm = padRow.widthPx * mmPerPx;
  const padHeightMm = Math.abs(padRow.midY - bridgeRow.midY) * mmPerPx;

  // Get ordered rows for angle calculations
  const isArrayGrid = Array.isArray(gridPoints);
  const orderedRows = isArrayGrid ? gridPoints : Object.values(gridPoints);
  const rowCount = orderedRows.length;

  // Find column reference and midpoint
  const columnReference = orderedRows.find((row) => Array.isArray(row));
  const columnCount = columnReference?.length || 0;
  const midColumn = Math.floor(columnCount / 2);

  // Helper to get point from grid
  const getColumnPoint = (rowIdx, colIdx) => {
    const row = orderedRows[rowIdx];
    if (!Array.isArray(row) || colIdx < 0 || colIdx >= row.length) return null;
    return row[colIdx];
  };

  // Find top and bottom mid points (single loop)
  let topMid = null;
  let bottomMid = null;
  let topMidRow = 0;
  const maxRow = Math.min(rowCount - 1, 3);

  for (let r = 1; r <= maxRow; r++) {
    const pt = getColumnPoint(r, midColumn);
    if (!pt) continue;

    if (!topMid) {
      topMid = pt;
      topMidRow = r;
    }
    bottomMid = pt;
  }

  // Find diagonal point
  let diagPoint = topMid;
  if (topMid) {
    let diagCol = midColumn;
    for (let r = topMidRow + 1; r <= maxRow; r++) {
      diagCol++;
      const candidate = getColumnPoint(r, diagCol);
      if (!candidate) break;
      diagPoint = candidate;
    }
  }

  // Calculate pad angle (optimized: no IIFE, direct calculation)
  let padAngleDeg = null;
  let padAngleLines = null;

  if (topMid && bottomMid && diagPoint) {
    const vecA = {
      x: bottomMid.x - topMid.x,
      y: bottomMid.y - topMid.y
    };
    const vecB = {
      x: diagPoint.x - topMid.x,
      y: diagPoint.y - topMid.y
    };

    padAngleDeg = calculateAngleDeg(vecA, vecB);
    padAngleLines = {
      origin: topMid,
      lineAEnd: diagPoint,
      lineBEnd: bottomMid,
    };
  }

  // Calculate flare angle (optimized: cached array access)
  let flareAngleDeg = null;
  const padRowPoints = Array.isArray(gridPoints.padRow) ? gridPoints.padRow : [];

  if (padRowPoints.length > 2) {
    const midIdx = Math.floor(padRowPoints.length / 2);
    const center = padRowPoints[midIdx];
    const left = padRowPoints[midIdx - 1];
    const right = padRowPoints[midIdx + 1];

    if (center && left && right) {
      const leftVec = {
        x: left.x - center.x,
        y: left.y - center.y
      };
      const rightVec = {
        x: right.x - center.x,
        y: right.y - center.y
      };

      flareAngleDeg = calculateAngleDeg(leftVec, rightVec);
    }
  }

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

/**
 * Extract eye segment (optimized: cached calculations)
 */
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

/**
 * Build IPD measurement (optimized: Math.hypot instead of manual sqrt)
 */
function buildIpdMeasurement(leftIris, rightIris, mmPerPx) {
  if (!leftIris || !rightIris || !Number.isFinite(mmPerPx)) return null;

  const dxPx = rightIris.center.x - leftIris.center.x;
  const dyPx = rightIris.center.y - leftIris.center.y;
  const pupilDistancePx = Math.hypot(dxPx, dyPx); // OPTIMIZED: Use Math.hypot

  const near = pupilDistancePx * mmPerPx;
  const far = near * 1.05;

  return {
    near,
    far,
    left: { x: leftIris.center.x, y: leftIris.center.y },
    right: { x: rightIris.center.x, y: rightIris.center.y },
  };
}

/**
 * Build face width measurement (optimized: removed unnecessary spread)
 */
function buildFaceWidthMeasurement(points, mmPerPx) {
  if (!points?.left || !points?.right || !Number.isFinite(mmPerPx)) return null;

  const faceWidthPx = Math.hypot(
    points.right.x - points.left.x,
    points.right.y - points.left.y
  );
  const faceWidthMm = faceWidthPx * mmPerPx;

  if (!Number.isFinite(faceWidthMm) || faceWidthMm <= 0) return null;

  return {
    valueMm: faceWidthMm,
    left: points.left,   // OPTIMIZED: Direct reference instead of spread
    right: points.right,
  };
}

/**
 * Build eye width measurement (optimized: removed unnecessary map spread)
 */
function buildEyeWidthMeasurement(segment, mmPerPx) {
  if (!segment?.pxLength || !Number.isFinite(mmPerPx)) return null;

  return {
    valueMm: segment.pxLength * mmPerPx,
    points: segment.points, // OPTIMIZED: Direct reference
  };
}

/**
 * Compute iris measurement (optimized: reduced allocations)
 */
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

  // OPTIMIZED: Pre-allocate array with known size
  const irisPts = new Array(4);
  let validCount = 0;

  for (let i = 0; i < 4; i++) {
    const pt = landmarks[irisIdx[i]];
    if (!pt) return null; // Early exit if any point missing

    irisPts[validCount++] = {
      x: pt.x * canvasWidth,
      y: pt.y * canvasHeight,
    };
  }

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

// ============================================================================
// EXPORTS
// ============================================================================

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
