/**
 * Drawing Primitives Module
 * @module utils/drawing-primitives
 *
 * Provides low-level drawing primitives for canvas rendering:
 * - Label drawing with leaders and collision awareness
 * - Rail segments (offset lines with labels)
 * - Smooth curves through point sequences
 */

import {
  isFinitePoint,
  normalize,
  translate,
  uprightAngle,
  resolveOrientation,
} from "./graphics-geometry.js";
import { LABEL_FONT } from "../config.js";

/** @typedef {{x: number, y: number}} Point */

// ============================================================================
// MEASUREMENT BOX DRAWING
// ============================================================================

/**
 * Draw a measurement box with background and text
 * Similar to the reference image style with colored boxes
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Measurement text
 * @param {Point} position - Box position (center)
 * @param {Object} opts - Drawing options
 * @param {string} [opts.color="#fff"] - Text and border color
 * @param {string} [opts.backgroundColor="rgba(0,0,0,0.7)"] - Box background
 * @param {number} [opts.padding=6] - Box padding
 * @param {number} [opts.borderRadius=4] - Corner radius
 * @param {number} [opts.fontSize=14] - Font size in pixels
 */
export function drawMeasurementBox(ctx, text, position, opts = {}) {
  if (!text || !isFinitePoint(position)) return;

  const color = opts.color || "#fff";
  const bgColor = opts.backgroundColor || "rgba(0, 0, 0, 0.7)";
  const padding = opts.padding ?? 6;
  const borderRadius = opts.borderRadius ?? 4;
  const fontSize = opts.fontSize ?? 14;
  const font = `bold ${fontSize}px 'Segoe UI', sans-serif`;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Measure text
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  // Box dimensions
  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding * 2;
  const x = position.x - boxWidth / 2;
  const y = position.y - boxHeight / 2;

  // Draw background box with rounded corners
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, borderRadius);
  ctx.fill();

  // Draw border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw text
  ctx.fillStyle = color;
  ctx.fillText(text, position.x, position.y);

  ctx.restore();
}

// ============================================================================
// LABEL DRAWING
// ============================================================================

/**
 * Draw a text label with optional leader line and angle alignment
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Label text
 * @param {Point} position - Label position
 * @param {Object} opts - Drawing options
 * @param {string} [opts.color="#fff"] - Text color
 * @param {string} [opts.align="center"] - Text alignment
 * @param {string} [opts.baseline="middle"] - Text baseline
 * @param {number} [opts.angle] - Rotation angle in radians (auto-upright)
 * @param {Object} [opts.leader] - Leader line options
 * @param {Point} opts.leader.from - Leader start point
 * @param {string} [opts.leader.color] - Leader color (defaults to text color)
 * @param {number} [opts.leader.lineWidth=1.5] - Leader line width
 */
export function drawLabel(ctx, text, position, opts = {}) {
  if (!text || !isFinitePoint(position)) return;

  ctx.save();
  ctx.fillStyle = opts.color || "#fff";
  ctx.font = opts.font || LABEL_FONT;
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";

  // Draw leader line if specified
  if (opts.leader?.from && isFinitePoint(opts.leader.from)) {
    ctx.strokeStyle = opts.leader.color || ctx.fillStyle;
    ctx.lineWidth = opts.leader.lineWidth ?? 1.5;
    ctx.beginPath();
    ctx.moveTo(opts.leader.from.x, opts.leader.from.y);
    ctx.lineTo(position.x, position.y);
    ctx.stroke();
  }

  // Draw text with optional rotation (always upright)
  if (typeof opts.angle === "number") {
    ctx.translate(position.x, position.y);
    ctx.rotate(uprightAngle(opts.angle));
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, position.x, position.y);
  }

  ctx.restore();
}

/**
 * Measure label dimensions for collision detection
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to measure
 * @param {string} [font] - Font string (defaults to LABEL_FONT)
 * @returns {{width: number, height: number}} Label dimensions
 */
export function measureLabel(ctx, text, font) {
  ctx.save();
  ctx.font = font || LABEL_FONT;
  const m = ctx.measureText(text);
  ctx.restore();

  const height =
    (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || 18;

  return { width: m.width, height };
}

// ============================================================================
// RAIL SEGMENT DRAWING
// ============================================================================

/**
 * Draw a rail segment (line offset from base segment) with optional label
 *
 * A "rail" is a line drawn parallel to and offset from a base segment,
 * commonly used for measurement overlays (IPD, face width, etc.)
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Point} baseStart - Base segment start point
 * @param {Point} baseEnd - Base segment end point
 * @param {Object} options - Drawing options
 * @param {number} [options.offset=0] - Offset distance from base segment
 * @param {string|number|Object} [options.offsetOrientation="perpendicular"] - Offset direction
 * @param {string} [options.color="#fff"] - Rail color
 * @param {number} [options.lineWidth=2] - Rail line width
 * @param {boolean} [options.connectBase=true] - Draw connectors to base points
 * @param {boolean} [options.drawRail=true] - Whether to draw the rail line
 * @param {Object} [options.label] - Label configuration
 * @param {string} options.label.text - Label text
 * @param {Object} [options.label.offset] - Label offset config
 * @param {string|number|Object} [options.label.offset.orientation] - Label direction
 * @param {number} [options.label.offset.distance=0] - Label distance from rail
 * @param {string} [options.label.offset.reference="mid"] - Reference point: "start", "mid", "end"
 * @param {string} [options.label.color] - Label color (defaults to rail color)
 * @param {string} [options.label.align="center"] - Label text alignment
 * @param {string} [options.label.baseline="middle"] - Label text baseline
 * @param {boolean} [options.label.alignToRail=false] - Rotate label to align with rail
 * @param {Object} [options.label.leader] - Leader line configuration
 * @param {Object} [options.__policy] - Render policy for policy-driven features
 * @param {CollisionManager|null} collisionMgr - Collision manager for label placement
 * @returns {{angle: number, baseDir: Object, offDir: Object, a: Point, b: Point, mid: Point}|null} Rail geometry
 */
export function drawRailSegment(
  ctx,
  baseStart,
  baseEnd,
  options = {},
  collisionMgr = null
) {
  if (!isFinitePoint(baseStart) || !isFinitePoint(baseEnd)) return null;

  const color = options.color || "#fff";
  const lineWidth = options.lineWidth ?? 2;
  const connectBase = options.connectBase ?? true;
  const drawRail = options.drawRail ?? true;

  // Calculate base vector and direction
  const baseVec = { x: baseEnd.x - baseStart.x, y: baseEnd.y - baseStart.y };
  const baseLen = Math.hypot(baseVec.x, baseVec.y) || 1;
  const baseDir = { x: baseVec.x / baseLen, y: baseVec.y / baseLen };

  // Calculate offset direction and points
  const offDir = resolveOrientation(options.offsetOrientation, baseDir);
  const offset = options.offset ?? 0;
  const offVec = { x: offDir.x * offset, y: offDir.y * offset };

  const a = { x: baseStart.x + offVec.x, y: baseStart.y + offVec.y };
  const b = { x: baseEnd.x + offVec.x, y: baseEnd.y + offVec.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const geom = {
    angle: Math.atan2(baseVec.y, baseVec.x),
    baseDir,
    offDir,
    a,
    b,
    mid,
  };

  // Draw rail line
  if (drawRail) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);

    // Draw connectors to base segment
    if (connectBase && !(options.__policy?.compact?.hideRailConnectors)) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(baseStart.x, baseStart.y);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(baseEnd.x, baseEnd.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  // Draw label with collision-aware placement
  if (options.label?.text) {
    const label = options.label;
    const labelOffset = label.offset || {};

    // Determine label reference point
    const labelRef =
      labelOffset.reference === "start" ? a :
      labelOffset.reference === "end" ? b :
      mid;

    const labelDir = resolveOrientation(labelOffset.orientation, baseDir);
    const labelDist = labelOffset.distance ?? 0;

    // Generate label position candidates
    const candidates = [
      translate(labelRef, labelDir, labelDist) || mid,
      a,
      b,
      translate(mid, { x: -labelDir.y, y: labelDir.x }, (labelDist || 12) * 0.8),
      translate(mid, { x: labelDir.y, y: -labelDir.x }, (labelDist || 12) * 0.8),
    ].filter(Boolean);

    // Find non-colliding position
    let placed = null;
    if (collisionMgr) {
      placed = collisionMgr.findNonCollidingPosition(
        ctx,
        label.text,
        candidates,
        label.font || LABEL_FONT
      );
    } else {
      // Fallback: use first candidate
      placed = candidates[0];
    }

    if (placed) {
      drawLabel(ctx, label.text, placed, {
        angle: label.alignToRail ? geom.angle : 0,
        color: label.color || color,
        align: label.align || "center",
        baseline: label.baseline || "middle",
        leader: label.leader,
        font: label.font,
      });
    }
  }

  return geom;
}

// ============================================================================
// CURVE DRAWING
// ============================================================================

/**
 * Draw a smooth Catmull-Rom-style curve through a sequence of points
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Point[]} points - Array of points to connect with curve
 */
export function drawSmoothCurve(ctx, points) {
  const pts = points.filter(isFinitePoint);
  if (pts.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    // Calculate control points for smooth Bézier curve
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.stroke();
}
