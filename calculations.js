import { minEnclosingCircle } from "./utils/geometry.js";

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

export function estimateCameraDistanceCm(diameterPx, focalLengthPx, irisDiameterMm) {
  if (!(diameterPx > 0)) return null;
  const mmPerPx = irisDiameterMm / diameterPx;
  const distanceX = (focalLengthPx.x * mmPerPx) / 10;
  const distanceY = (focalLengthPx.y * mmPerPx) / 10;
  return (distanceX + distanceY) / 2;
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

export function buildLandmarkPair(landmarks, indexMap, canvasWidth, canvasHeight) {
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

export function buildNoseGridPoints(landmarks, noseIndices, canvasWidth, canvasHeight) {
  const grid = {};
  for (const [key, row] of Object.entries(noseIndices)) {
    grid[key] = row.map((idx) => projectLandmark(landmarks, idx, canvasWidth, canvasHeight));
  }
  return grid;
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
export function computeNoseMetrics(gridPoints, mmPerPx) {
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
  const orderedRows = Object.values(gridPoints);
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
export function extractEyeSegment(landmarks, idxPair, canvasWidth, canvasHeight) {
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
export function buildIpdMeasurement(leftIris, rightIris, mmPerPx) {
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
export function buildFaceWidthMeasurement(points, mmPerPx) {
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
export function buildEyeWidthMeasurement(segment, mmPerPx) {
  if (!segment?.pxLength || !Number.isFinite(mmPerPx)) return null;

  return {
    valueMm: segment.pxLength * mmPerPx,
    points: segment.points, // OPTIMIZED: Direct reference
  };
}

/**
 * Compute iris measurement (optimized: reduced allocations)
 */
export function computeIrisMeasurement(landmarks, irisIdx, pupilIdx, canvasWidth, canvasHeight) {
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

  return {
    diameterPx: circle.radius * 2,
    center: {
      x: circle.center.x,
      y: circle.center.y,
    },
  };
}
