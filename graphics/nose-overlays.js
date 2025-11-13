/**
 * Nose Measurement Overlays
 * @module graphics/nose-overlays
 *
 * Specialized rendering for nose measurements:
 * - Nose grid (landmark grid with smooth curves)
 * - Bridge width (horizontal bracket)
 * - Pad width (horizontal bracket)
 * - Pad height (vertical bracket)
 * - Pad angle (angle visualization)
 * - Flare angle (angle visualization)
 */

import { isFinitePoint } from "../utils/graphics-geometry.js";
import {
  drawRailSegment,
  drawSmoothCurve,
  measureLabel,
  drawMeasurementBox,
} from "../utils/drawing-primitives.js";
import { drawAngleOverlay } from "../utils/angle-rendering.js";
import {
  COLOR_CONFIG,
  NOSE_GRID_STYLE,
  NOSE_OVERLAY_OFFSETS,
} from "../config.js";

/** @typedef {{x: number, y: number}} Point */

// ============================================================================
// NOSE GRID RENDERING
// ============================================================================

/**
 * Extract rows from nose indices configuration
 * Handles multiple formats: array, object with rows property, or map of named rows
 * @param {Array|Object} noseIndices - Nose landmark indices configuration
 * @returns {Array[]} Array of landmark index rows
 */
function noseRowsFromIndices(noseIndices) {
  if (!noseIndices) return [];
  if (Array.isArray(noseIndices)) return noseIndices;
  if (Array.isArray(noseIndices.rows)) return noseIndices.rows;
  // Accept map of named rows (e.g., {topRow: [...], browRow: [...]})
  return Object.values(noseIndices).filter(Array.isArray);
}

/**
 * Draw nose landmark grid with smooth curves
 *
 * Draws both horizontal rows and vertical columns through the landmark grid,
 * creating a smooth mesh overlay on the nose.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLCanvasElement} canvas - Canvas element for coordinate conversion
 * @param {Array} landmarks - MediaPipe face landmarks array
 * @param {Object|Array} noseIndices - Nose landmark indices
 * @param {string} [color] - Grid color (defaults to config)
 */
export function drawNoseGrid(ctx, canvas, landmarks, noseIndices, color) {
  if (!Array.isArray(landmarks)) return;

  const rows = noseRowsFromIndices(noseIndices);
  if (!rows.length) return;

  const gridColor = color || NOSE_GRID_STYLE.color;

  // Convert landmark index to canvas point
  const toPoint = (idx) => {
    const lm = landmarks[idx];
    if (!lm) return null;
    return { x: lm.x * canvas.width, y: lm.y * canvas.height };
  };

  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = NOSE_GRID_STYLE.lineWidth;

  // Helper to draw a sequence of landmark indices as a smooth curve
  const drawIdxSequence = (indices) => {
    const seg = [];
    indices.forEach((idx) => {
      const pt = typeof idx === "number" ? toPoint(idx) : null;
      if (pt) {
        seg.push(pt);
      } else if (seg.length) {
        // Break in sequence - draw accumulated points
        drawSmoothCurve(ctx, seg);
        seg.length = 0;
      }
    });
    // Draw remaining points
    if (seg.length) drawSmoothCurve(ctx, seg);
  };

  // Draw horizontal rows
  rows.forEach((row) => drawIdxSequence(row));

  // Draw vertical columns (aligned by index position)
  const maxCols = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  for (let c = 0; c < maxCols; c++) {
    const col = rows
      .map((r) => (Array.isArray(r) ? r[c] : null))
      .filter((v) => v != null);
    drawIdxSequence(col);
  }

  ctx.restore();
}

// ============================================================================
// BRACKET RENDERING
// ============================================================================

/**
 * Draw horizontal bracket for bridge width or pad width measurements
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} row - Row with left and right points
 * @param {Point} row.left - Left endpoint
 * @param {Point} row.right - Right endpoint
 * @param {string} label - Measurement label (e.g., "Bridge width")
 * @param {number} value - Measurement value in mm
 * @param {string} color - Bracket color
 * @param {string} [placement="top"] - Placement relative to row: "top" or "bottom"
 * @param {Object} policy - Render policy
 * @param {CollisionManager|null} collisionMgr - Collision manager
 */
export function drawHorizontalBracket(
  ctx,
  row,
  label,
  value,
  color,
  placement = "top",
  policy,
  collisionMgr
) {
  if (!row?.left || !row?.right || !Number.isFinite(value)) return;

  const dir = placement === "top" ? -1 : 1;
  const offsets = NOSE_OVERLAY_OFFSETS.horizontalBracket;
  const text = `${label} ${value.toFixed(1)} mm`;
  const labelDim = measureLabel(ctx, text);
  const labelDist = dir * (offsets.labelPadding + labelDim.height / 2);

  drawRailSegment(
    ctx,
    row.left,
    row.right,
    {
      offset: dir * offsets.lineOffset,
      offsetOrientation: "vertical",
      color,
      __policy: policy,
      label: {
        text,
        offset: { distance: labelDist },
        color,
        align: "center",
        alignToRail: true,
      },
    },
    collisionMgr
  );
}

/**
 * Draw vertical bracket for pad height measurement
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} bridgeRow - Bridge row with left point
 * @param {Object} padRow - Pad row with left point
 * @param {number} value - Pad height value in mm
 * @param {string} color - Bracket color
 * @param {Object} policy - Render policy
 * @param {CollisionManager|null} collisionMgr - Collision manager
 */
export function drawPadHeightBracket(
  ctx,
  bridgeRow,
  padRow,
  value,
  color,
  policy,
  collisionMgr
) {
  if (!bridgeRow?.left || !padRow?.left || !Number.isFinite(value)) return;

  const leftBridge = bridgeRow.left;
  const leftPad = padRow.left;
  const inset = NOSE_OVERLAY_OFFSETS.padHeight.horizontalInset;
  const targetX = Math.min(leftBridge.x, leftPad.x) + inset;
  const offset = targetX - leftBridge.x;

  const label = `Pad Height ${value.toFixed(1)} mm`;
  const direction = offset >= 0 ? 1 : -1;
  const labelGap = NOSE_OVERLAY_OFFSETS.padHeight.labelGap;

  drawRailSegment(
    ctx,
    leftBridge,
    leftPad,
    {
      offset,
      offsetOrientation: "horizontal",
      color,
      __policy: policy,
      label: {
        text: label,
        offset: { distance: direction * labelGap },
        color,
        align: "center",
        alignToRail: true,
        leader: {
          from: { x: targetX, y: (leftBridge.y + leftPad.y) / 2 },
          lineWidth: 1.25,
          color,
        },
      },
    },
    collisionMgr
  );
}

// ============================================================================
// ANGLE RENDERING
// ============================================================================

/**
 * Draw pad angle visualization
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} lines - Angle geometry
 * @param {Point} lines.origin - Angle vertex
 * @param {Point} lines.lineAEnd - End of first arm
 * @param {Point} lines.lineBEnd - End of second arm
 * @param {number} value - Angle value in degrees
 * @param {string} color - Angle color
 * @param {Object} policy - Render policy
 */
export function drawPadAngle(ctx, lines, value, color, policy) {
  if (!lines || !Number.isFinite(value)) return;

  const label = `Pad Angle ${value.toFixed(1)}°`;
  const opts = NOSE_OVERLAY_OFFSETS.padAngle;

  drawAngleOverlay(ctx, lines.origin, lines.lineAEnd, lines.lineBEnd, label, color, {
    radius: opts?.radius ?? 28,
    arcWidth: opts?.arcWidth ?? 2,
    armWidth: opts?.armWidth ?? 2,
    labelPad: opts?.labelPad ?? 10,
    leader: {
      enabled: !!opts?.leader,
      width: opts?.leaderWidth ?? 1.25,
    },
    __policy: policy,
  });
}

/**
 * Draw flare angle visualization
 *
 * Constructs angle arms from pad row endpoints with origin below pads
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} padRow - Pad row with left and right points
 * @param {number} value - Angle value in degrees
 * @param {string} color - Angle color
 * @param {Object} policy - Render policy
 */
export function drawFlareAngle(ctx, padRow, value, color, policy) {
  if (!padRow?.left || !padRow?.right || !Number.isFinite(value)) return;

  const centerX = (padRow.left.x + padRow.right.x) / 2;
  const baseY =
    Math.max(padRow.left.y, padRow.right.y) +
    (NOSE_OVERLAY_OFFSETS.flareAngle?.baseOffsetY || 12);
  const origin = { x: centerX, y: baseY };

  const label = `Flare Angle ${value.toFixed(1)}°`;
  const opts = NOSE_OVERLAY_OFFSETS.flareAngle;

  drawAngleOverlay(ctx, origin, padRow.right, padRow.left, label, color, {
    radius: opts?.radius ?? 30,
    arcWidth: opts?.arcWidth ?? 2,
    armWidth: opts?.armWidth ?? 2,
    labelPad: opts?.labelPad ?? 12,
    leader: {
      enabled: !!opts?.leader,
      width: opts?.leaderWidth ?? 1.25,
    },
    __policy: policy,
  });
}

// ============================================================================
// NEW REFERENCE-STYLE RENDERING
// ============================================================================

/**
 * Draw bridge width measurement box (reference style)
 */
function drawBridgeWidthBox(ctx, bridgeRow, value, color) {
  if (!bridgeRow) return;

  const midX = (bridgeRow.left.x + bridgeRow.right.x) / 2;
  const midY = bridgeRow.midY - 25; // Above bridge

  drawMeasurementBox(ctx, `Bridge width ${value.toFixed(1)}mm`, { x: midX, y: midY }, {
    color,
    backgroundColor: `${color}33`, // 20% opacity
    fontSize: 13,
  });

  // Draw simple bracket
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bridgeRow.left.x, bridgeRow.left.y - 15);
  ctx.lineTo(bridgeRow.left.x, bridgeRow.left.y - 10);
  ctx.lineTo(bridgeRow.right.x, bridgeRow.right.y - 10);
  ctx.lineTo(bridgeRow.right.x, bridgeRow.right.y - 15);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw pad width measurement box (reference style)
 */
function drawPadWidthBox(ctx, padRow, value, color) {
  if (!padRow) return;

  const midX = (padRow.left.x + padRow.right.x) / 2;
  const midY = padRow.midY + 35; // Below pad

  drawMeasurementBox(ctx, `Pad width ${value.toFixed(1)}mm`, { x: midX, y: midY }, {
    color,
    backgroundColor: `${color}33`,
    fontSize: 13,
  });

  // Draw simple bracket
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padRow.left.x, padRow.left.y + 10);
  ctx.lineTo(padRow.left.x, padRow.left.y + 15);
  ctx.lineTo(padRow.right.x, padRow.right.y + 15);
  ctx.lineTo(padRow.right.x, padRow.right.y + 10);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw pad height measurement box (reference style)
 */
function drawPadHeightBox(ctx, bridgeRow, padRow, value, color) {
  if (!bridgeRow || !padRow) return;

  const x = Math.min(bridgeRow.left.x, padRow.left.x) - 50;
  const midY = (bridgeRow.midY + padRow.midY) / 2;

  drawMeasurementBox(ctx, `Pad Height ${value.toFixed(1)}mm`, { x, y: midY }, {
    color,
    backgroundColor: `${color}33`,
    fontSize: 13,
  });

  // Draw vertical bracket
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 35, bridgeRow.left.y);
  ctx.lineTo(x + 40, bridgeRow.left.y);
  ctx.lineTo(x + 40, padRow.left.y);
  ctx.lineTo(x + 35, padRow.left.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw pad angle with compact arc and box label (reference style)
 */
function drawPadAngleBox(ctx, lines, value, color) {
  if (!lines) return;

  const { origin, lineAEnd, lineBEnd } = lines;

  // Draw small arc
  const radius = 20;
  const angleA = Math.atan2(lineAEnd.y - origin.y, lineAEnd.x - origin.x);
  const angleB = Math.atan2(lineBEnd.y - origin.y, lineBEnd.x - origin.x);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, angleA, angleB, angleB < angleA);
  ctx.stroke();
  ctx.restore();

  // Label position on bisector
  const bisector = (angleA + angleB) / 2;
  const labelDist = radius + 25;
  const labelPos = {
    x: origin.x + Math.cos(bisector) * labelDist,
    y: origin.y + Math.sin(bisector) * labelDist,
  };

  drawMeasurementBox(ctx, `Pad Angle ${value.toFixed(1)}°`, labelPos, {
    color,
    backgroundColor: `${color}33`,
    fontSize: 12,
  });
}

/**
 * Draw flare angle with compact arc and box label (reference style)
 */
function drawFlareAngleBox(ctx, padRow, value, color) {
  if (!padRow?.left || !padRow?.right) return;

  const centerX = (padRow.left.x + padRow.right.x) / 2;
  const baseY = Math.max(padRow.left.y, padRow.right.y) + 15;
  const origin = { x: centerX, y: baseY };

  // Draw small arc
  const radius = 25;
  const angleLeft = Math.atan2(padRow.left.y - origin.y, padRow.left.x - origin.x);
  const angleRight = Math.atan2(padRow.right.y - origin.y, padRow.right.x - origin.x);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, angleRight, angleLeft, false);
  ctx.stroke();
  ctx.restore();

  // Label below arc
  drawMeasurementBox(ctx, `Flare Angle ${value.toFixed(1)}°`, { x: centerX, y: baseY + 35 }, {
    color,
    backgroundColor: `${color}33`,
    fontSize: 12,
  });
}

// ============================================================================
// COMPLETE NOSE OVERLAY (REFERENCE STYLE)
// ============================================================================

/**
 * Draw complete nose measurement overlay - Reference Image Style
 *
 * Renders measurements with colored boxes and compact brackets
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} metrics - Nose metrics object
 * @param {Object} policy - Render policy
 * @param {CollisionManager|null} collisionMgr - Collision manager
 */
export function drawNoseOverlay(ctx, metrics, policy, collisionMgr) {
  if (!metrics?.rows) return;

  const colors = COLOR_CONFIG.noseMetrics || {};
  const { bridge, pad } = metrics.rows;

  // Bridge width (orange in reference)
  if (Number.isFinite(metrics.bridgeWidthMm)) {
    drawBridgeWidthBox(ctx, bridge, metrics.bridgeWidthMm, colors.bridge);
  }

  // Pad width (cyan in reference)
  if (Number.isFinite(metrics.padSpanMm)) {
    drawPadWidthBox(ctx, pad, metrics.padSpanMm, colors.padSpan);
  }

  // Pad height (yellow in reference)
  if (Number.isFinite(metrics.padHeightMm)) {
    drawPadHeightBox(ctx, bridge, pad, metrics.padHeightMm, colors.padHeight);
  }

  // Pad angle (blue in reference)
  if (Number.isFinite(metrics.padAngleDeg) && metrics.padAngleLines) {
    drawPadAngleBox(ctx, metrics.padAngleLines, metrics.padAngleDeg, colors.padAngle);
  }

  // Flare angle (magenta in reference)
  if (Number.isFinite(metrics.flareAngleDeg)) {
    drawFlareAngleBox(ctx, pad, metrics.flareAngleDeg, colors.flareAngle);
  }
}
