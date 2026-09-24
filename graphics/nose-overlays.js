/**
 * Nose Measurement Overlays
 * @module graphics/nose-overlays
 *
 * Rendering for nose measurements: bridge width, pad width, pad height,
 * pad angle, and flare angle.
 */

import { COLOR_CONFIG } from "../config.js";

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
export function drawNoseOverlay(ctx, metrics) {
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
