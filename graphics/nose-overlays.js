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
import { drawRailSegment, drawSmoothCurve, measureLabel } from "../utils/drawing-primitives.js";
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
// COMPLETE NOSE OVERLAY
// ============================================================================

/**
 * Draw complete nose measurement overlay
 *
 * Renders all enabled nose measurements based on available metrics
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

  // Bridge width
  if (Number.isFinite(metrics.bridgeWidthMm)) {
    drawHorizontalBracket(
      ctx,
      bridge,
      "Bridge width",
      metrics.bridgeWidthMm,
      colors.bridge,
      "top",
      policy,
      collisionMgr
    );
  }

  // Pad width
  if (Number.isFinite(metrics.padSpanMm)) {
    drawHorizontalBracket(
      ctx,
      pad,
      "Pad width",
      metrics.padSpanMm,
      colors.padSpan,
      "top",
      policy,
      collisionMgr
    );
  }

  // Pad height
  if (Number.isFinite(metrics.padHeightMm)) {
    drawPadHeightBracket(
      ctx,
      bridge,
      pad,
      metrics.padHeightMm,
      colors.padHeight,
      policy,
      collisionMgr
    );
  }

  // Pad angle
  if (Number.isFinite(metrics.padAngleDeg) && metrics.padAngleLines) {
    drawPadAngle(ctx, metrics.padAngleLines, metrics.padAngleDeg, colors.padAngle, policy);
  }

  // Flare angle
  if (Number.isFinite(metrics.flareAngleDeg)) {
    drawFlareAngle(ctx, pad, metrics.flareAngleDeg, colors.flareAngle, policy);
  }
}
