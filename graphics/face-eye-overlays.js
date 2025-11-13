/**
 * Face and Eye Measurement Overlays
 * @module graphics/face-eye-overlays
 *
 * Rendering for face-level measurements:
 * - IPD (Interpupillary Distance) - near and far measurements
 * - Face width
 * - Eye widths (left and right)
 */

import { isFinitePoint } from "../utils/graphics-geometry.js";
import { drawRailSegment } from "../utils/drawing-primitives.js";
import {
  COLOR_CONFIG,
  IPD_OVERLAY_CONFIG,
  FACE_OVERLAY_CONFIG,
  EYE_WIDTH_OVERLAY_CONFIG,
} from "../config.js";

/** @typedef {{x: number, y: number}} Point */

// ============================================================================
// IPD (INTERPUPILLARY DISTANCE) RENDERING
// ============================================================================

/**
 * Draw IPD measurement overlays
 *
 * Renders multiple IPD rails (near and far) as specified in config
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} ipd - IPD measurement object
 * @param {Point} ipd.left - Left pupil position
 * @param {Point} ipd.right - Right pupil position
 * @param {number} ipd.near - Near IPD value in mm
 * @param {number} ipd.far - Far IPD value in mm
 * @param {CollisionManager|null} collisionMgr - Collision manager
 */
export function drawIpdMeasurement(ctx, ipd, collisionMgr) {
  if (!ipd) return;

  const colors = COLOR_CONFIG.ipd || {};
  const textLift = IPD_OVERLAY_CONFIG.textLift ?? 18;
  const start = { x: ipd.left.x, y: ipd.left.y };
  const end = { x: ipd.right.x, y: ipd.right.y };

  IPD_OVERLAY_CONFIG.rails.forEach(({ key, label, offset, drawRail = true, textAlign }) => {
    const value = ipd[key];
    if (!Number.isFinite(value)) return;

    const color = colors[key] || "#fff";

    drawRailSegment(
      ctx,
      start,
      end,
      {
        offset,
        color,
        drawRail,
        label: {
          text: `${label} ${value.toFixed(1)} mm`,
          offset: { distance: textLift }, // Perpendicular to rail
          color,
          align: textAlign || "center",
          alignToRail: true, // Align with rail but keep upright
        },
      },
      collisionMgr
    );
  });
}

// ============================================================================
// FACE WIDTH RENDERING
// ============================================================================

/**
 * Draw face width measurement overlay
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} faceData - Face width measurement
 * @param {Point} faceData.left - Left face edge point
 * @param {Point} faceData.right - Right face edge point
 * @param {number} faceData.valueMm - Face width value in mm
 * @param {CollisionManager|null} collisionMgr - Collision manager
 */
export function drawFaceWidthMeasurement(ctx, faceData, collisionMgr) {
  if (!faceData) return;

  const color = COLOR_CONFIG.faceWidth || "#fff";
  const spanOffset = FACE_OVERLAY_CONFIG.spanOffset ?? 50;
  const labelLift = FACE_OVERLAY_CONFIG.labelLift ?? 16;
  const label = FACE_OVERLAY_CONFIG.label || "Face";

  drawRailSegment(
    ctx,
    faceData.left,
    faceData.right,
    {
      offset: spanOffset,
      color,
      label: {
        text: `${label} ${faceData.valueMm.toFixed(1)} mm`,
        offset: { distance: labelLift }, // Perpendicular offset from rail
        color,
        alignToRail: true, // Align with rail but keep upright
      },
    },
    collisionMgr
  );
}

// ============================================================================
// EYE WIDTH RENDERING
// ============================================================================

/**
 * Draw eye width measurement for a single eye
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} eyeData - Eye measurement data
 * @param {Point[]} eyeData.points - [start, end] points of eye segment
 * @param {number} eyeData.valueMm - Eye width value in mm
 * @param {string} side - Eye side: "left" or "right"
 * @param {string} label - Label text (e.g., "L" or "R")
 * @param {Object} policy - Render policy
 * @param {number} leadersUsed - Count of leaders already used
 * @param {CollisionManager|null} collisionMgr - Collision manager
 * @returns {number} Updated leader count
 */
export function drawEyeWidth(
  ctx,
  eyeData,
  side,
  label,
  policy,
  leadersUsed,
  collisionMgr
) {
  if (!eyeData) return leadersUsed;

  const start = eyeData.points?.[0];
  const end = eyeData.points?.[1];

  if (!isFinitePoint(start) || !isFinitePoint(end) || !Number.isFinite(eyeData.valueMm)) {
    return leadersUsed;
  }

  const eyeWidthColors = COLOR_CONFIG.eyeWidths || {};
  const color = eyeWidthColors[side] || "#fff";

  // Format label text (shorter in compact mode)
  const labelText = policy.compact.shortenLabels
    ? `${label} ${eyeData.valueMm.toFixed(1)} mm`
    : `${label} width ${eyeData.valueMm.toFixed(1)} mm`;

  // Add leader if under limit
  const hasLeader = policy.maxLeaders > leadersUsed;
  const leader = hasLeader ? { from: start, lineWidth: 1.1, color } : undefined;

  drawRailSegment(
    ctx,
    start,
    end,
    {
      offset: EYE_WIDTH_OVERLAY_CONFIG.railOffset,
      color,
      drawRail: EYE_WIDTH_OVERLAY_CONFIG.drawRail !== false,
      __policy: policy,
      label: {
        text: labelText,
        color,
        offset: {
          orientation: { x: 0, y: Math.sign(EYE_WIDTH_OVERLAY_CONFIG.railOffset || -120) },
          distance: Math.abs(EYE_WIDTH_OVERLAY_CONFIG.textLift ?? 18),
        },
        alignToRail: true,
        leader,
      },
    },
    collisionMgr
  );

  return hasLeader ? leadersUsed + 1 : leadersUsed;
}
