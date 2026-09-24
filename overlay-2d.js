/**
 * 2D measurement overlays drawn on the canvas over the video
 * @module overlay-2d
 */

import {
  COLOR_CONFIG,
  LABEL_FONT,
  IPD_OVERLAY_CONFIG,
  FACE_OVERLAY_CONFIG,
  EYE_WIDTH_OVERLAY_CONFIG,
  RENDER_POLICY,
} from "./config.js";

/** @typedef {{x: number, y: number}} Point */

// ============================================================================
// POINT VALIDATION
// ============================================================================

/**
 * Check if a point has finite x and y coordinates
 * @param {*} p - Potential point object
 * @returns {boolean} True if p is a valid point with finite coordinates
 */
function isFinitePoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

/**
 * Normalize a vector to unit length
 * @param {number} vx - X component of vector
 * @param {number} vy - Y component of vector
 * @returns {Vector} Normalized unit vector
 */
function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (!len) return { x: 0, y: 0 };
  return { x: vx / len, y: vy / len };
}

/**
 * Get perpendicular vector (90° counterclockwise rotation)
 * @param {Vector} v - Input vector
 * @returns {Vector} Perpendicular vector
 */
function perp(v) {
  return { x: -v.y, y: v.x };
}

/**
 * Translate a point along a direction by a distance
 * @param {Point} pt - Starting point
 * @param {Vector} dir - Direction vector (will be normalized)
 * @param {number} dist - Distance to translate
 * @returns {Point|null} Translated point, or null if input invalid
 */
function translate(pt, dir, dist) {
  if (!isFinitePoint(pt)) return null;
  const n = normalize(dir.x, dir.y);
  return { x: pt.x + n.x * dist, y: pt.y + n.y * dist };
}

// ============================================================================
// ANGLE OPERATIONS
// ============================================================================

/**
 * Keep angle visually upright for text rendering
 * Maps angle to range [-π/2, π/2] for readable text orientation
 * @param {number} theta - Input angle in radians
 * @returns {number} Upright angle in radians
 */
function uprightAngle(theta) {
  if (theta > Math.PI / 2 || theta < -Math.PI / 2) {
    return theta + Math.PI;
  }
  return theta;
}

// ============================================================================
// ORIENTATION RESOLUTION
// ============================================================================

/**
 * Resolve an orientation descriptor to a unit vector
 *
 * Supports multiple descriptor types:
 * - "perpendicular": perpendicular to baseDir
 * - "parallel": parallel to baseDir
 * - "horizontal": horizontal direction (1, 0)
 * - "vertical": vertical direction (0, 1)
 * - number: angle in radians
 * - {x, y}: explicit vector (will be normalized)
 *
 * @param {string|number|Vector} descriptor - Orientation descriptor
 * @param {Vector} baseDir - Base direction vector for relative orientations
 * @returns {Vector} Resolved unit direction vector
 */
function resolveOrientation(descriptor, baseDir) {
  if (!descriptor || descriptor === "perpendicular") {
    return perp(baseDir);
  }
  if (descriptor === "parallel") {
    return normalize(baseDir.x, baseDir.y);
  }
  if (descriptor === "horizontal") {
    return { x: 1, y: 0 };
  }
  if (descriptor === "vertical") {
    return { x: 0, y: 1 };
  }
  if (typeof descriptor === "number") {
    return { x: Math.cos(descriptor), y: Math.sin(descriptor) };
  }
  if (
    typeof descriptor === "object" &&
    Number.isFinite(descriptor.x) &&
    Number.isFinite(descriptor.y)
  ) {
    return normalize(descriptor.x, descriptor.y);
  }
  // Default fallback: perpendicular
  return perp(baseDir);
}

/** @typedef {{x1: number, y1: number, x2: number, y2: number}} BoundingBox */

/**
 * Manages collision detection for UI labels to prevent overlapping text
 */
class CollisionManager {
  constructor() {
    /** @type {BoundingBox[]} */
    this.boxes = [];
  }

  /**
   * Reset all registered collision boxes (call at frame start)
   */
  reset() {
    this.boxes = [];
  }

  /**
   * Check if a box would collide with any registered boxes
   * @param {BoundingBox} box - Bounding box to test
   * @returns {boolean} True if collision detected
   */
  wouldCollide(box) {
    return this.boxes.some(
      (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
    );
  }

  /**
   * Register a box in the collision system
   * @param {BoundingBox} box - Bounding box to register
   */
  register(box) {
    this.boxes.push(box);
  }

  /**
   * Measure a text bounding box at a given position
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} text - Text to measure
   * @param {Point} pos - Position of the text
   * @param {string} font - Font string (e.g., "bold 18px sans-serif")
   * @returns {BoundingBox} Bounding box for the text
   */
  measureTextBox(ctx, text, pos, font) {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const height =
      (metrics.actualBoundingBoxAscent || 0) +
      (metrics.actualBoundingBoxDescent || 0) || 18;
    ctx.restore();

    return {
      x1: pos.x - width / 2,
      y1: pos.y - height / 2,
      x2: pos.x + width / 2,
      y2: pos.y + height / 2,
    };
  }

  /**
   * Find first non-colliding position from candidate list
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} text - Text to place
   * @param {Point[]} candidates - Candidate positions to try
   * @param {string} font - Font string
   * @returns {Point|null} First valid position or null if all collide
   */
  findNonCollidingPosition(ctx, text, candidates, font) {
    for (const pos of candidates) {
      const box = this.measureTextBox(ctx, text, pos, font);
      if (!this.wouldCollide(box)) {
        this.register(box);
        return pos;
      }
    }
    return null;
  }
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
function drawLabel(ctx, text, position, opts = {}) {
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
function drawRailSegment(
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
function drawIpdMeasurement(ctx, ipd, collisionMgr) {
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
function drawFaceWidthMeasurement(ctx, faceData, collisionMgr) {
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
function drawEyeWidth(
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

// ============================================================================
// REFERENCE-STYLE RENDERING
// ============================================================================

/**
 * Draw bridge width measurement box (reference style)
 */
function drawBridgeWidthBox(ctx, bridgeRow, value, color) {
  if (!bridgeRow) return;

  const midX = (bridgeRow.left.x + bridgeRow.right.x) / 2;
  const midY = bridgeRow.midY - 25; // Above bridge

  // Calculate head tilt angle from bridge row
  const angle = Math.atan2(
    bridgeRow.right.y - bridgeRow.left.y,
    bridgeRow.right.x - bridgeRow.left.x
  );

  // Draw text with rotation matching head orientation
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 13px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.fillText(`Bridge width ${value.toFixed(1)}mm`, 0, 0);
  ctx.restore();

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

  // Calculate head tilt angle from pad row
  const angle = Math.atan2(
    padRow.right.y - padRow.left.y,
    padRow.right.x - padRow.left.x
  );

  // Draw text with rotation matching head orientation
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 13px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.fillText(`Pad width ${value.toFixed(1)}mm`, 0, 0);
  ctx.restore();

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

  // Calculate vertical angle (perpendicular to head tilt)
  const bridgeAngle = Math.atan2(
    bridgeRow.right.y - bridgeRow.left.y,
    bridgeRow.right.x - bridgeRow.left.x
  );
  // Rotate 90 degrees for vertical text
  const verticalAngle = bridgeAngle + Math.PI / 2;

  // Draw text with rotation matching head orientation
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 13px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(x, midY);
  ctx.rotate(verticalAngle);
  ctx.fillText(`Pad Height ${value.toFixed(1)}mm`, 0, 0);
  ctx.restore();

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

  // Draw text with rotation matching bisector angle
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(labelPos.x, labelPos.y);
  ctx.rotate(bisector);
  ctx.fillText(`Pad Angle ${value.toFixed(1)}°`, 0, 0);
  ctx.restore();
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

  // Calculate angle from pad row for text rotation
  const padAngle = Math.atan2(
    padRow.right.y - padRow.left.y,
    padRow.right.x - padRow.left.x
  );

  // Draw text with rotation matching head orientation
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "bold 12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(centerX, baseY + 35);
  ctx.rotate(padAngle);
  ctx.fillText(`Flare Angle ${value.toFixed(1)}°`, 0, 0);
  ctx.restore();
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
 */
function drawNoseOverlay(ctx, metrics) {
  if (!metrics?.rows) return;

  const colors = COLOR_CONFIG.noseMetrics;
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

// ============================================================================
// GRAPHICS FACTORY
// ============================================================================

/**
 * Create a graphics renderer instance
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @returns {Object} Graphics renderer with public methods
 */
export function createGraphics(ctx) {
  const collisionManager = new CollisionManager();

  // Render policy state (mutable)
  let policy = { ...RENDER_POLICY };
  let leadersUsed = 0;

  // ========================================================================
  // FRAME MANAGEMENT
  // ========================================================================

  /**
   * Begin a new rendering frame
   * Resets collision manager and leader count
   */
  function beginFrame() {
    collisionManager.reset();
    leadersUsed = 0;
  }

  /**
   * Update render policy
   * @param {Object} next - Policy updates to merge
   */
  function setRenderPolicy(next) {
    policy = {
      ...policy,
      ...next,
      compact: { ...policy.compact, ...(next?.compact || {}) },
    };
  }

  // ========================================================================
  // RENDERING HELPERS
  // ========================================================================

  /**
   * Execute rendering function with optional alpha for secondary elements
   * @param {Function} fn - Rendering function to execute
   * @param {boolean} isSecondary - Whether this is a secondary element
   */
  function withAlpha(fn, isSecondary) {
    if (!isSecondary) {
      return fn();
    }
    ctx.save();
    ctx.globalAlpha = policy.compact.alphaSecondary;
    fn();
    ctx.restore();
  }

  // ========================================================================
  // MEASUREMENT OVERLAY RENDERING
  // ========================================================================

  /**
   * Draw all measurement overlays based on state and focus mode
   *
   * @param {Object} state - Measurement state
   * @param {Object} state.faceWidth - Face width measurement
   * @param {Object} state.ipd - IPD measurements (near/far)
   * @param {Object} state.eyes - Eye width measurements (left/right)
   * @param {Object} state.nose - Nose metrics
   */
  function drawMeasurementOverlays(state) {
    const focus = policy.focus;

    // FACE WIDTH
    if (state?.faceWidth && (focus === "global" || focus === "face")) {
      withAlpha(
        () => drawFaceWidthMeasurement(ctx, state.faceWidth, collisionManager),
        focus !== "face"
      );
    }

    // IPD
    if (state?.ipd && (focus === "global" || focus === "eyes" || focus === "face")) {
      withAlpha(
        () => drawIpdMeasurement(ctx, state.ipd, collisionManager),
        focus !== "eyes" && focus !== "face"
      );
    }

    // EYE WIDTHS
    if (focus === "global" || focus === "eyes") {
      for (const [side, label] of [["left", "L"], ["right", "R"]]) {
        if (!state?.eyes?.[side]) continue;
        withAlpha(() => {
          leadersUsed = drawEyeWidth(
            ctx,
            state.eyes[side],
            side,
            label,
            policy,
            leadersUsed,
            collisionManager
          );
        }, focus !== "eyes");
      }
    }

    // NOSE
    if (focus === "global" || focus === "nose") {
      withAlpha(() => drawNoseOverlay(ctx, state.nose), focus !== "nose");
    }
  }

  return {
    beginFrame,
    setRenderPolicy,
    drawMeasurementOverlays,
  };
}
