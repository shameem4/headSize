/**
 * Angle Rendering Module
 * @module utils/angle-rendering
 *
 * Provides specialized rendering for angle measurements with:
 * - Angle arms (rays from origin to points)
 * - Angle arcs (curved indicators of angle magnitude)
 * - Labels positioned along angle bisector
 * - Auto-upright text orientation
 */

import { isFinitePoint, angleOf, angleDelta, pointOnRay } from "./graphics-geometry.js";
import { drawLabel } from "./drawing-primitives.js";

/** @typedef {{x: number, y: number}} Point */

// ============================================================================
// ANGLE OVERLAY RENDERING
// ============================================================================

/**
 * Draw a complete angle visualization with arms, arc, and label
 *
 * Features:
 * - Draws two arms from origin to armA and armB
 * - Draws an arc between the arms showing the angle
 * - Places label on the angle bisector
 * - Auto-selects smaller of two possible angles
 * - Skips rendering if angle is too small (reduces clutter)
 * - Respects render policy for arm visibility
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Point} origin - Angle vertex (origin of both arms)
 * @param {Point} armA - End point of first arm
 * @param {Point} armB - End point of second arm
 * @param {string} text - Label text to display
 * @param {string} color - Color for arms, arc, and label
 * @param {Object} opts - Rendering options
 * @param {number} [opts.radius=28] - Arc radius in pixels
 * @param {number} [opts.arcWidth=2] - Arc stroke width
 * @param {number} [opts.armWidth=2] - Arm stroke width
 * @param {number} [opts.labelPad=10] - Distance from arc to label
 * @param {Object} [opts.leader] - Leader line configuration
 * @param {boolean} [opts.leader.enabled=false] - Whether to draw leader from arc to label
 * @param {number} [opts.leader.width=1.25] - Leader line width
 * @param {Object} [opts.__policy] - Render policy
 * @param {number} [opts.__policy.minAngleDeg] - Minimum angle to render (deg)
 * @param {Object} [opts.__policy.compact] - Compact rendering options
 * @param {boolean} [opts.__policy.compact.showAngleArms] - Whether to show arms
 */
export function drawAngleOverlay(ctx, origin, armA, armB, text, color, opts = {}) {
  if (!isFinitePoint(origin) || !isFinitePoint(armA) || !isFinitePoint(armB)) {
    return;
  }

  // Calculate angles
  const a0 = angleOf(armA, origin);
  const a1 = angleOf(armB, origin);
  let d = angleDelta(a0, a1); // Signed, range [-π, π]

  // Skip tiny angles to reduce visual clutter
  const deg = Math.abs((d * 180) / Math.PI);
  if (opts.__policy?.minAngleDeg && deg < opts.__policy.minAngleDeg) {
    return;
  }

  // Choose the smaller angle for the arc (always draw the acute/smaller angle)
  let start = a0;
  let end = a1;
  if (Math.abs(d) > Math.PI) {
    // Flip to shorter sweep
    const tmp = start;
    start = end;
    end = tmp;
    d = angleDelta(start, end);
  }

  const radius = Math.max(4, opts.radius ?? 28);
  const armWidth = opts.armWidth ?? 2;
  const arcWidth = opts.arcWidth ?? 2;
  const labelPad = opts.labelPad ?? 10;

  ctx.save();

  // Draw angle arms (policy-gated)
  if (opts.__policy?.compact?.showAngleArms !== false) {
    ctx.strokeStyle = color || "#fff";
    ctx.lineWidth = armWidth;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(armA.x, armA.y);
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(armB.x, armB.y);
    ctx.stroke();
  }

  // Draw arc along the smaller sweep from start to end
  ctx.strokeStyle = color || "#fff";
  ctx.lineWidth = arcWidth;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, start, start + d, d < 0);
  ctx.stroke();

  ctx.restore();

  // Position label on angle bisector, just outside the arc
  const bisector = start + d / 2;
  const labelPos = pointOnRay(origin, bisector, radius + labelPad);

  // Optional leader line from arc to label
  let leader;
  if (opts.leader?.enabled) {
    const arcMid = pointOnRay(origin, bisector, radius);
    leader = {
      from: arcMid,
      lineWidth: opts.leader.width ?? 1.25,
      color,
    };
  }

  // Draw label aligned with bisector (auto-upright)
  drawLabel(ctx, text, labelPos, {
    color,
    angle: bisector,
    align: "center",
    leader,
  });
}
