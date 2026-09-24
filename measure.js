/**
 * Measurement pipeline: landmarks -> iris scale -> mm measurements
 * @module measure
 */


/** @typedef {{x: number, y: number}} Point */

/** @typedef {{center: Point, radius: number}} Circle */

const EPSILON = 1e-3;

/**
 * Calculate Euclidean distance between two points
 * @param {Point} a - First point
 * @param {Point} b - Second point
 * @returns {number} Distance in pixels
 */
function distanceBetweenPoints(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Create a circle from two points (diameter)
 * @param {Point} p1 - First point
 * @param {Point} p2 - Second point
 * @returns {Circle} Circle with center at midpoint
 */
function circleFromTwoPoints(p1, p2) {
  return {
    center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    radius: distanceBetweenPoints(p1, p2) / 2,
  };
}

/**
 * Create a circle passing through three points (circumcircle)
 * @param {Point} p1 - First point
 * @param {Point} p2 - Second point
 * @param {Point} p3 - Third point
 * @returns {Circle|null} Circumcircle or null if points are collinear
 */
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

/**
 * Check if a point is inside or on a circle
 * @param {Point} point - Point to test
 * @param {Circle|null} circle - Circle to test against
 * @returns {boolean} True if point is inside or on circle boundary
 */
function isPointInsideCircle(point, circle) {
  if (!circle) return false;
  return distanceBetweenPoints(point, circle.center) <= circle.radius + EPSILON;
}

/**
 * Compute the minimum enclosing circle for a set of points using Welzl's algorithm
 * @param {Point[]} points - Array of points
 * @returns {Circle|null} Minimum enclosing circle or null if no points
 */
function minEnclosingCircle(points) {
  if (!points?.length) return null;
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
function computeIrisMeasurement(landmarks, irisIdx, pupilIdx, canvasWidth, canvasHeight) {
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

class NoseComponent {
  constructor(indices) {
    this.indices = indices;
    this.grid = null;
  }

  reset() {
    this.grid = null;
  }

  update(landmarks, canvasWidth, canvasHeight) {
    if (!landmarks) {
      this.reset();
      return;
    }
    this.grid = buildNoseGridPoints(landmarks, this.indices, canvasWidth, canvasHeight);
  }
}

class FaceComponent {
  constructor(indexMap) {
    this.indexMap = indexMap;
    this.widthPoints = null;
  }

  reset() {
    this.widthPoints = null;
  }

  update(landmarks, canvasWidth, canvasHeight) {
    if (!landmarks) {
      this.reset();
      return;
    }
    this.widthPoints = buildLandmarkPair(landmarks, this.indexMap, canvasWidth, canvasHeight);
  }
}

class EyeSide {
  constructor({ iris, widthIdx }) {
    this.irisIndices = iris;
    this.widthIdx = widthIdx;
    this.iris = null;
    this.segment = null;
    this.smoothedDiameter = null;
    this.smoothingFactor = 0.3; // Lower = smoother but slower response (0.2-0.4 recommended)
  }

  reset() {
    this.iris = null;
    this.segment = null;
    this.smoothedDiameter = null;
  }

  update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn) {
    if (!landmarks) {
      this.reset();
      return;
    }
    const rawMeasurement = computeIrisMeasurement(
      landmarks,
      this.irisIndices.iris,
      this.irisIndices.pupil,
      canvasWidth,
      canvasHeight
    );

    if (rawMeasurement && rawMeasurement.diameterPx > 0) {
      // Apply exponential moving average smoothing to diameter
      if (this.smoothedDiameter === null) {
        this.smoothedDiameter = rawMeasurement.diameterPx;
      } else {
        this.smoothedDiameter =
          this.smoothingFactor * rawMeasurement.diameterPx +
          (1 - this.smoothingFactor) * this.smoothedDiameter;
      }

      // Calculate distance from smoothed diameter
      const distanceCm = estimateDistanceFn(this.smoothedDiameter);

      // Return measurement with smoothed diameter and calculated distance
      this.iris = {
        ...rawMeasurement,
        diameterPx: this.smoothedDiameter,
        distanceCm
      };
    } else {
      this.iris = rawMeasurement;
    }
    this.segment = extractEyeSegment(landmarks, this.widthIdx, canvasWidth, canvasHeight);
  }
}

class EyesComponent {
  constructor(config) {
    this.left = new EyeSide({ iris: config.leftIris, widthIdx: config.leftWidthIdx });
    this.right = new EyeSide({ iris: config.rightIris, widthIdx: config.rightWidthIdx });
  }

  reset() {
    this.left.reset();
    this.right.reset();
  }

  update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn) {
    this.left.update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn);
    this.right.update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn);
  }
}

class HeadComponent {
  constructor({ noseGridIndices, faceWidthIdx, eyeWidthIdx, iris }) {
    this.nose = new NoseComponent(noseGridIndices);
    this.face = new FaceComponent(faceWidthIdx);
    this.eyes = new EyesComponent({
      leftIris: iris.left,
      rightIris: iris.right,
      leftWidthIdx: eyeWidthIdx.left,
      rightWidthIdx: eyeWidthIdx.right,
    });
  }

  reset() {
    this.nose.reset();
    this.face.reset();
    this.eyes.reset();
  }

  update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn) {
    if (!landmarks) {
      this.reset();
      return;
    }
    this.nose.update(landmarks, canvasWidth, canvasHeight);
    this.face.update(landmarks, canvasWidth, canvasHeight);
    this.eyes.update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn);
  }

  getAverageCameraDistance() {
    const left = this.eyes.left.iris;
    const right = this.eyes.right.iris;
    if (left?.distanceCm && right?.distanceCm) {
      return (left.distanceCm + right.distanceCm) / 2;
    }
    return null;
  }
}

export function createHeadTracker(config) {
  return new HeadComponent(config);
}

/**
 * @typedef {Object} MeasurementState
 * @property {Object|null} ipd - IPD measurements (near, far)
 * @property {Object|null} faceWidth - Face width measurement
 * @property {Object} eyes - Eye width measurements
 * @property {Object|null} nose - Nose metrics
 */

/**
 * Manages the application's measurement state with stabilization
 */
export class StateManager {
  constructor(config) {
    this.config = config;
    this.smoothedDistance = null;
    this.lastDistanceUpdate = 0;

    // Iris diameter smoothing for stable measurements (configurable)
    this.smoothedIrisDiameterPx = null;
    this.smoothingFactor = config.irisSmoothing ?? 0.15;
    this.stabilizationThreshold = config.irisStabilizationThreshold ?? 0.5;

    /** @type {MeasurementState} */
    this.measurements = {
      ipd: null,
      faceWidth: null,
      eyes: { left: null, right: null },
      nose: null,
    };
  }

  /**
   * Reset all measurements to null
   */
  reset() {
    this.measurements.ipd = null;
    this.measurements.faceWidth = null;
    this.measurements.eyes = { left: null, right: null };
    this.measurements.nose = null;
    // Don't reset smoothed iris diameter - maintain stability across brief interruptions
  }

  /**
   * Smooth iris diameter with exponential smoothing and stabilization threshold
   * @param {number} rawDiameterPx - Raw iris diameter in pixels
   * @returns {number} Smoothed iris diameter
   */
  smoothIrisDiameter(rawDiameterPx) {
    // Initialize on first call
    if (this.smoothedIrisDiameterPx === null) {
      this.smoothedIrisDiameterPx = rawDiameterPx;
      return rawDiameterPx;
    }

    // Calculate difference
    const diff = Math.abs(rawDiameterPx - this.smoothedIrisDiameterPx);

    // Ignore tiny changes (stabilization threshold)
    if (diff < this.stabilizationThreshold) {
      return this.smoothedIrisDiameterPx; // No change
    }

    // Apply exponential smoothing for larger changes
    this.smoothedIrisDiameterPx += (rawDiameterPx - this.smoothedIrisDiameterPx) * this.smoothingFactor;

    return this.smoothedIrisDiameterPx;
  }

  /**
   * Update measurements from head tracking data with iris diameter stabilization
   * @param {Object} head - Head tracker instance
   * @param {number} irisDiameterMm - Expected iris diameter in mm
   */
  updateMeasurements(head, irisDiameterMm) {
    const leftIris = head.eyes.left.iris;
    const rightIris = head.eyes.right.iris;

    if (!leftIris || !rightIris) {
      this.reset();
      return;
    }

    // Calculate raw average iris diameter
    const rawAvgDiameterPx = (rightIris.diameterPx + leftIris.diameterPx) / 2;
    if (!Number.isFinite(rawAvgDiameterPx) || rawAvgDiameterPx <= 0) {
      this.reset();
      return;
    }

    // Apply smoothing to reduce jitter
    const smoothedDiameterPx = this.smoothIrisDiameter(rawAvgDiameterPx);

    // Calculate mmPerPx using smoothed diameter for stable measurements
    const mmPerPx = irisDiameterMm / smoothedDiameterPx;

    this.measurements.ipd = buildIpdMeasurement(leftIris, rightIris, mmPerPx);
    this.measurements.faceWidth = buildFaceWidthMeasurement(head.face.widthPoints, mmPerPx);
    this.measurements.eyes = {
      left: buildEyeWidthMeasurement(head.eyes.left.segment, mmPerPx),
      right: buildEyeWidthMeasurement(head.eyes.right.segment, mmPerPx),
    };

    const noseMetrics = computeNoseMetrics(head.nose.grid, mmPerPx);
    this.measurements.nose = noseMetrics;
  }

  /**
   * Update smoothed distance with exponential smoothing
   * @param {number} distanceCm - Raw distance measurement in cm
   * @returns {number} Smoothed distance
   */
  updateDistance(distanceCm) {
    if (this.smoothedDistance == null) {
      this.smoothedDistance = distanceCm;
    } else {
      const smoothingFactor = this.config.distanceSmoothing || 0.18;
      this.smoothedDistance += (distanceCm - this.smoothedDistance) * smoothingFactor;
    }

    this.lastDistanceUpdate = performance.now();
    return this.smoothedDistance;
  }

  /**
   * Check if distance should be hidden due to timeout
   * @returns {boolean} True if distance should be decayed
   */
  shouldDecayDistance() {
    if (!this.lastDistanceUpdate) return false;
    const timeout = this.config.distanceVisibilityTimeout || 1200;
    return performance.now() - this.lastDistanceUpdate > timeout;
  }

  /**
   * Decay (reset) distance when timeout expires
   */
  decayDistance() {
    if (this.shouldDecayDistance()) {
      this.smoothedDistance = null;
      this.lastDistanceUpdate = 0;
    }
  }

  /**
   * Get current smoothed distance
   * @returns {number|null} Smoothed distance in cm or null
   */
  getSmoothedDistance() {
    return this.smoothedDistance;
  }

  /**
   * Get current measurement state
   * @returns {MeasurementState}
   */
  getMeasurements() {
    return this.measurements;
  }
}
