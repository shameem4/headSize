// graphics.js — decluttered overlays, upright labels, and policy-driven rendering
// Public surface: createGraphics(...) returns { beginFrame, setRenderPolicy, drawNoseGrid, drawMeasurementOverlays, drawNoseOverlay }

import {
  COLOR_CONFIG,
  LABEL_FONT,
  NOSE_OVERLAY_OFFSETS,
  NOSE_GRID_STYLE,
  IPD_OVERLAY_CONFIG,
  FACE_OVERLAY_CONFIG,
  EYE_WIDTH_OVERLAY_CONFIG,
} from "./config.js";

/** @typedef {{x:number,y:number}} Point */

// --- Render policy (defaults) ---
const DEFAULT_RENDER_POLICY = {
  detailLevel: "standard",   // "minimal" | "standard" | "full"
  focus: "global",           // "global" | "face" | "eyes" | "nose"
  maxLeaders: 1,
  minAngleDeg: 8,
  compact: {
    alphaSecondary: 0.55,
    shortenLabels: true,
    hideRailConnectors: true,
    showAngleArms: false,
  },
};

// collision registry (cleared each frame)
let _drawnBoxes = [];
function _labelCollides(box) {
  return _drawnBoxes.some(
    (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
  );
}
function _measureBox(ctx, text, pos) {
  const { width, height } = measureLabel(ctx, text);
  return {
    x1: pos.x - width / 2,
    y1: pos.y - height / 2,
    x2: pos.x + width / 2,
    y2: pos.y + height / 2,
  };
}

/** --- math & guards ------------------------------------------------------- */

function isFinitePoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (!len) return { x: 0, y: 0 };
  return { x: vx / len, y: vy / len };
}

function perp({ x, y }) {
  return { x: -y, y: x };
}

function translate(pt, dir, dist) {
  if (!isFinitePoint(pt)) return null;
  const n = normalize(dir.x, dir.y);
  return { x: pt.x + n.x * dist, y: pt.y + n.y * dist };
}

/** Keep an angle visually upright for text (range -> [-π/2, π/2]) */
function uprightAngle(theta) {
  if (theta > Math.PI / 2 || theta < -Math.PI / 2) return theta + Math.PI;
  return theta;
}

/** --- label & measurement helpers ---------------------------------------- */

/** Screen-space text drawing for crisp labels regardless of canvas transforms. */
function drawLabelScreen(ctx, text, position, opts = {}) {
  if (!text || !isFinitePoint(position)) return;
  ctx.save();
  // ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = opts.color || "#fff";
  ctx.font = LABEL_FONT;
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";

  if (opts.leader?.from && isFinitePoint(opts.leader.from)) {
    ctx.strokeStyle = opts.leader.color || ctx.fillStyle;
    ctx.lineWidth = opts.leader.lineWidth ?? 1.5;
    ctx.beginPath();
    ctx.moveTo(opts.leader.from.x, opts.leader.from.y);
    ctx.lineTo(position.x, position.y);
    ctx.stroke();
  }

  if (typeof opts.angle === "number") {
    ctx.translate(position.x, position.y);
    ctx.rotate(uprightAngle(opts.angle)); // ensure upright text
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, position.x, position.y);
  }
  ctx.restore();
}

function measureLabel(ctx, text) {
  ctx.save();
  ctx.font = LABEL_FONT;
  const m = ctx.measureText(text);
  ctx.restore();
  const height =
    (m.actualBoundingBoxAscent || 0) +
      (m.actualBoundingBoxDescent || 0) || 18;
  return { width: m.width, height };
}

/** Resolve an orientation descriptor to a unit vector in canvas space. */
function resolveOrientation(descriptor, baseDir /** Point */) {
  if (!descriptor || descriptor === "perpendicular") return perp(baseDir);
  if (descriptor === "parallel") return normalize(baseDir.x, baseDir.y);
  if (descriptor === "horizontal") return { x: 1, y: 0 };
  if (descriptor === "vertical") return { x: 0, y: 1 };
  if (typeof descriptor === "number")
    return { x: Math.cos(descriptor), y: Math.sin(descriptor) };
  if (
    typeof descriptor === "object" &&
    Number.isFinite(descriptor.x) &&
    Number.isFinite(descriptor.y)
  ) {
    return normalize(descriptor.x, descriptor.y);
  }
  return perp(baseDir);
}

/** Draw a rail offset from a base segment, optionally with a label. */
function drawRailSegment(ctx, baseStart, baseEnd, options = {}) {
  if (!isFinitePoint(baseStart) || !isFinitePoint(baseEnd)) return null;
  const color = options.color || "#fff";
  const lineWidth = options.lineWidth ?? 2;
  const connectBase = options.connectBase ?? true;
  const drawRail = options.drawRail ?? true;

  const baseVec = { x: baseEnd.x - baseStart.x, y: baseEnd.y - baseStart.y };
  const baseLen = Math.hypot(baseVec.x, baseVec.y) || 1;
  const baseDir = { x: baseVec.x / baseLen, y: baseVec.y / baseLen };

  const offDir = resolveOrientation(options.offsetOrientation, baseDir);
  const offset = options.offset ?? 0;
  const offVec = { x: offDir.x * offset, y: offDir.y * offset };

  const a = { x: baseStart.x + offVec.x, y: baseStart.y + offVec.y };
  const b = { x: baseEnd.x + offVec.x, y: baseEnd.y + offVec.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const geom = { angle: Math.atan2(baseVec.y, baseVec.x), baseDir, offDir, a, b, mid };

  // draw rail
  if (drawRail) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (connectBase && !(options.__policy?.compact?.hideRailConnectors)) {
      ctx.moveTo(a.x, a.y); ctx.lineTo(baseStart.x, baseStart.y);
      ctx.moveTo(b.x, b.y); ctx.lineTo(baseEnd.x, baseEnd.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // label w/ collision-aware placement
  if (options.label?.text) {
    const label = options.label;
    const labelOffset = label.offset || {};
    const labelRef =
      labelOffset.reference === "start" ? a :
      labelOffset.reference === "end"   ? b : mid;
    const labelDir = resolveOrientation(labelOffset.orientation, baseDir);
    const labelDist = labelOffset.distance ?? 0;

    // candidates: mid, start, end, +/- extra perpendicular nudge
    const candidates = [
      translate(labelRef, labelDir, labelDist) || mid,
      a, b,
      translate(mid, { x: -labelDir.y, y: labelDir.x }, (labelDist || 12) * 0.8),
      translate(mid, { x:  labelDir.y, y: -labelDir.x }, (labelDist || 12) * 0.8),
    ].filter(Boolean);

    let placed = null;
    for (const p of candidates) {
      const box = _measureBox(ctx, label.text, p);
      if (!_labelCollides(box)) { _drawnBoxes.push(box); placed = p; break; }
    }
    if (placed) {
      drawLabelScreen(ctx, label.text, placed, {
        angle: label.alignToRail ? geom.angle : 0,
        color: label.color || color,
        align: label.align || "center",
        baseline: label.baseline || "middle",
        leader: label.leader,
      });
    }
  }
  return geom;
}

function drawSmoothCurve(ctx, points) {
  const pts = points.filter(isFinitePoint);
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
}

function noseRowsFromIndices(noseIndices) {
  if (!noseIndices) return [];
  if (Array.isArray(noseIndices)) return noseIndices;
  if (Array.isArray(noseIndices.rows)) return noseIndices.rows;
  // Accept map of named rows
  return Object.values(noseIndices).filter(Array.isArray);
}

function drawNoseGrid(
  ctx,
  canvas,
  landmarks,
  noseIndices,
  color = NOSE_GRID_STYLE.color
) {
  if (!Array.isArray(landmarks)) return;
  const rows = noseRowsFromIndices(noseIndices);
  if (!rows.length) return;

  const toPoint = (idx) => {
    const lm = landmarks[idx];
    if (!lm) return null;
    return { x: lm.x * canvas.width, y: lm.y * canvas.height };
  };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = NOSE_GRID_STYLE.lineWidth;

  const drawIdxSequence = (indices) => {
    const seg = [];
    indices.forEach((idx) => {
      const pt = typeof idx === "number" ? toPoint(idx) : null;
      if (pt) seg.push(pt);
      else if (seg.length) {
        drawSmoothCurve(ctx, seg);
        seg.length = 0;
      }
    });
    if (seg.length) drawSmoothCurve(ctx, seg);
  };

  // rows
  rows.forEach((row) => drawIdxSequence(row));
  // columns (align by index)
  const maxCols = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  for (let c = 0; c < maxCols; c++) {
    const col = rows
      .map((r) => (Array.isArray(r) ? r[c] : null))
      .filter((v) => v != null);
    drawIdxSequence(col);
  }

  ctx.restore();
}

/** --- nose overlays ------------------------------------------------------- */

function drawPadHeightBracket(ctx, bridgeRow, padRow, value, color, policy) {
  if (!bridgeRow?.left || !padRow?.left || !Number.isFinite(value)) return;
  const leftBridge = bridgeRow.left;
  const leftPad = padRow.left;
  const inset = NOSE_OVERLAY_OFFSETS.padHeight.horizontalInset;
  const targetX = Math.min(leftBridge.x, leftPad.x) + inset;
  const offset = targetX - leftBridge.x; // horizontal offset

  const label = `Pad Height ${value.toFixed(1)} mm`;
  const direction = offset >= 0 ? 1 : -1;
  const labelGap = NOSE_OVERLAY_OFFSETS.padHeight.labelGap;

  drawRailSegment(ctx, leftBridge, leftPad, {
    offset,
    offsetOrientation: "horizontal",
    color,
    __policy: policy,
    label: {
      text: label,
      // omit explicit orientation -> defaults to perpendicular to rail
      offset: { distance: direction * labelGap },
      color,
      align: "center",
      alignToRail: true, // align label with rail (auto-upright handled in drawLabelScreen)
      leader: {
        from: { x: targetX, y: (leftBridge.y + leftPad.y) / 2 },
        lineWidth: 1.25,
        color,
      },
    },
  });
}

function drawHorizontalBracket(ctx, row, label, value, color, placement = "top", policy) {
  if (!row?.left || !row?.right || !Number.isFinite(value)) return;
  const dir = placement === "top" ? -1 : 1;
  const offsets = NOSE_OVERLAY_OFFSETS.horizontalBracket;
  const text = `${label} ${value.toFixed(1)} mm`;
  const labelDim = measureLabel(ctx, text);
  const labelDist = dir * (offsets.labelPadding + labelDim.height / 2);

  drawRailSegment(ctx, row.left, row.right, {
    offset: dir * offsets.lineOffset,
    offsetOrientation: "vertical",
    color,
    __policy: policy,
    label: {
      text,
      // omit explicit orientation -> default perpendicular to rail
      offset: { distance: labelDist },
      color,
      align: "center",
      alignToRail: true, // harmonized with IPD/Face width labels
    },
  });
}

/** --- angle helpers ------------------------------------------------------- */

function angleOf(p, o) {
  return Math.atan2(p.y - o.y, p.x - o.x);
}

function angleDelta(a, b) {
  // smallest signed difference a->b in [-PI, PI]
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function pointOnRay(origin, angle, dist) {
  return { x: origin.x + Math.cos(angle) * dist, y: origin.y + Math.sin(angle) * dist };
}

/**
 * Draws angle arms + arc + label, with label along bisector and always upright.
 * opts:
 *  - radius: arc radius in px
 *  - arcWidth: stroke width for arc
 *  - armWidth: stroke width for arms
 *  - labelPad: distance to push label beyond arc
 *  - leader: {enabled, width}
 *  - __policy: render policy
 */
function drawAngleOverlay(ctx, origin, armA, armB, text, color, opts = {}) {
  if (!isFinitePoint(origin) || !isFinitePoint(armA) || !isFinitePoint(armB)) return;

  const a0 = angleOf(armA, origin);
  const a1 = angleOf(armB, origin);
  let d = angleDelta(a0, a1); // signed, [-PI, PI]

  // skip tiny angles to reduce noise
  const deg = Math.abs((d * 180) / Math.PI);
  if (opts.__policy?.minAngleDeg && deg < opts.__policy.minAngleDeg) return;

  // choose the smaller angle magnitude for the arc
  let start = a0;
  let end   = a1;
  if (Math.abs(d) > Math.PI) {
    // flip to shorter sweep
    const tmp = start; start = end; end = tmp;
    d = angleDelta(start, end);
  }

  const radius   = Math.max(4, opts.radius ?? 28);
  const armWidth = opts.armWidth ?? 2;
  const arcWidth = opts.arcWidth ?? 2;
  const labelPad = opts.labelPad ?? 10;

  ctx.save();
  // draw arms (policy-gated)
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

  // draw arc along the smaller sweep from start->end
  ctx.strokeStyle = color || "#fff";
  ctx.lineWidth = arcWidth;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, start, start + d, d < 0);
  ctx.stroke();
  ctx.restore();

  // label on angle bisector, just outside the arc
  const bisector = start + d / 2;
  const labelPos = pointOnRay(origin, bisector, radius + labelPad);

  // (optional) leader from arc midpoint to label
  let leader;
  if (opts.leader?.enabled) {
    const arcMid = pointOnRay(origin, bisector, radius);
    leader = { from: arcMid, lineWidth: opts.leader.width ?? 1.25, color };
  }

  drawLabelScreen(ctx, text, labelPos, {
    color,
    angle: bisector,     // align with geometry
    align: "center",     // upright handled inside drawLabelScreen
    leader,
  });
}

// Pad angle: uses padAngle offsets from config
function drawPadAngleGuide(ctx, lines, value, color, policy) {
  if (!lines || !Number.isFinite(value)) return;
  const label = `Pad Angle ${value.toFixed(1)}°`;

  // lines: { origin, lineAEnd, lineBEnd }
  drawAngleOverlay(
    ctx,
    lines.origin,
    lines.lineAEnd,
    lines.lineBEnd,
    label,
    color,
    {
      radius:   NOSE_OVERLAY_OFFSETS.padAngle?.radius ?? 28,
      arcWidth: NOSE_OVERLAY_OFFSETS.padAngle?.arcWidth ?? 2,
      armWidth: NOSE_OVERLAY_OFFSETS.padAngle?.armWidth ?? 2,
      labelPad: NOSE_OVERLAY_OFFSETS.padAngle?.labelPad ?? 10,
      leader:   { enabled: !!NOSE_OVERLAY_OFFSETS.padAngle?.leader, width: NOSE_OVERLAY_OFFSETS.padAngle?.leaderWidth ?? 1.25 },
      __policy: policy,
    }
  );
}

// Flare angle: construct arms from pad row ends, origin just below pads
function drawFlareAngleGuide(ctx, padRow, value, color, policy) {
  if (!padRow?.left || !padRow?.right || !Number.isFinite(value)) return;

  const centerX = (padRow.left.x + padRow.right.x) / 2;
  const baseY   = Math.max(padRow.left.y, padRow.right.y) + (NOSE_OVERLAY_OFFSETS.flareAngle?.baseOffsetY || 12);
  const origin  = { x: centerX, y: baseY };

  const label = `Flare Angle ${value.toFixed(1)}°`;
  drawAngleOverlay(
    ctx,
    origin,
    padRow.right,
    padRow.left,     // order doesn't matter; helper picks smaller arc
    label,
    color,
    {
      radius:   NOSE_OVERLAY_OFFSETS.flareAngle?.radius ?? 30,
      arcWidth: NOSE_OVERLAY_OFFSETS.flareAngle?.arcWidth ?? 2,
      armWidth: NOSE_OVERLAY_OFFSETS.flareAngle?.armWidth ?? 2,
      labelPad: NOSE_OVERLAY_OFFSETS.flareAngle?.labelPad ?? 12,
      leader:   { enabled: !!NOSE_OVERLAY_OFFSETS.flareAngle?.leader, width: NOSE_OVERLAY_OFFSETS.flareAngle?.leaderWidth ?? 1.25 },
      __policy: policy,
    }
  );
}

function drawNoseOverlay(ctx, metrics, policy) {
  if (!metrics?.rows) return;
  const colors = COLOR_CONFIG.noseMetrics || {};
  const { bridge, pad } = metrics.rows;

  if (Number.isFinite(metrics.bridgeWidthMm)) {
    drawHorizontalBracket(
      ctx,
      bridge,
      "Bridge width",
      metrics.bridgeWidthMm,
      colors.bridge,
      "top",
      policy
    );
  }
  if (Number.isFinite(metrics.padSpanMm)) {
    drawHorizontalBracket(
      ctx,
      pad,
      "Pad width",
      metrics.padSpanMm,
      colors.padSpan,
      "top",
      policy
    );
  }
  if (Number.isFinite(metrics.padHeightMm)) {
    drawPadHeightBracket(
      ctx,
      bridge,
      pad,
      metrics.padHeightMm,
      colors.padHeight,
      policy
    );
  }
  if (Number.isFinite(metrics.padAngleDeg) && metrics.padAngleLines) {
    drawPadAngleGuide(
      ctx,
      metrics.padAngleLines,
      metrics.padAngleDeg,
      colors.padAngle,
      policy
    );
  }
  if (Number.isFinite(metrics.flareAngleDeg)) {
    drawFlareAngleGuide(ctx, pad, metrics.flareAngleDeg, colors.flareAngle, policy);
  }
}

/** --- other overlays ------------------------------------------------------ */

function drawIpdMeasurement(ctx, ipd) {
  if (!ipd) return;
  const colors = COLOR_CONFIG.ipd || {};
  const textLift = IPD_OVERLAY_CONFIG.textLift ?? 18;
  const start = { x: ipd.left.x, y: ipd.left.y };
  const end = { x: ipd.right.x, y: ipd.right.y };
  IPD_OVERLAY_CONFIG.rails.forEach(
    ({ key, label, offset, drawRail = true, textAlign }) => {
      const value = ipd[key];
      if (!Number.isFinite(value)) return;
      const color = colors[key] || "#fff";
      drawRailSegment(ctx, start, end, {
        offset,
        color,
        drawRail,
        label: {
          text: `${label} ${value.toFixed(1)} mm`,
          offset: { distance: textLift }, // default: perpendicular to rail
          color,
          align: textAlign || "center",
          alignToRail: true, // align along rail, but kept upright
        },
      });
    }
  );
}

function drawFaceWidthMeasurement(ctx, faceData) {
  if (!faceData) return;
  const color = COLOR_CONFIG.faceWidth || "#fff";
  const spanOffset = FACE_OVERLAY_CONFIG.spanOffset ?? 50;
  const labelLift = FACE_OVERLAY_CONFIG.labelLift ?? 16;
  const label = FACE_OVERLAY_CONFIG.label || "Face";
  // Draw a rail offset from the face segment
  drawRailSegment(ctx, faceData.left, faceData.right, {
    offset: spanOffset,
    color,
    label: {
      text: `${label} ${faceData.valueMm.toFixed(1)} mm`,
      // Perpendicular offset away from the rail; distance in pixels:
      offset: { distance: labelLift },
      color,
      alignToRail: true, // align label with rail but ensure upright rendering
    },
  });
}

/** --- public entry -------------------------------------------------------- */

export function createGraphics(canvasElement, canvasCtx) {
  const ctx = canvasCtx;
  const canvas = canvasElement;
  const eyeWidthColors = COLOR_CONFIG.eyeWidths || {};
  let policy = { ...DEFAULT_RENDER_POLICY };
  let leadersUsed = 0;

  function beginFrame() {
    _drawnBoxes = [];
    leadersUsed = 0;
  }

  function setRenderPolicy(next) {
    policy = { ...policy, ...next, compact: { ...policy.compact, ...(next?.compact || {}) } };
  }

  // helper to mark secondary elements (lower alpha)
  function withAlpha(fn, isSecondary) {
    if (!isSecondary) return fn();
    ctx.save();
    ctx.globalAlpha = policy.compact.alphaSecondary;
    fn();
    ctx.restore();
  }

  function drawMeasurementOverlays(state, { noseOverlayEnabled = false } = {}) {
    const focus = policy.focus;
    const level = policy.detailLevel;

    // FACE (always in minimal/standard/full)
    if (state?.faceWidth && (focus === "global" || focus === "face")) {
      withAlpha(() => drawFaceWidthMeasurement(ctx, state.faceWidth), focus !== "face");
    }

    // IPD (always in minimal/standard/full)
    if (state?.ipd && (focus === "global" || focus === "eyes" || focus === "face")) {
      withAlpha(() => drawIpdMeasurement(ctx, state.ipd), focus !== "eyes" && focus !== "face");
    }

    // EYE WIDTHS (standard/full)
    if (level !== "minimal" && (focus === "global" || focus === "eyes")) {
      if (state?.eyes?.left) {
        const seg = state.eyes.left;
        const start = seg.points?.[0], end = seg.points?.[1];
        if (isFinitePoint(start) && isFinitePoint(end) && Number.isFinite(seg.valueMm)) {
          withAlpha(() => drawRailSegment(ctx, start, end, {
            offset: EYE_WIDTH_OVERLAY_CONFIG.railOffset,
            color: eyeWidthColors.left || "#fff",
            drawRail: EYE_WIDTH_OVERLAY_CONFIG.drawRail !== false,
            __policy: policy,
            label: {
              text: `L ${policy.compact.shortenLabels ? "" : "width "}${seg.valueMm.toFixed(1)} mm`,
              color: eyeWidthColors.left || "#fff",
              offset: {
                orientation: { x: 0, y: Math.sign(EYE_WIDTH_OVERLAY_CONFIG.railOffset || -120) },
                distance: Math.abs(EYE_WIDTH_OVERLAY_CONFIG.textLift ?? 18),
              },
              alignToRail: true,
              leader: (policy.maxLeaders > leadersUsed) ? { from: start, lineWidth: 1.1, color: eyeWidthColors.left } : undefined,
            },
          }), focus !== "eyes");
          if (policy.maxLeaders > leadersUsed) leadersUsed++;
        }
      }
      if (state?.eyes?.right) {
        const seg = state.eyes.right;
        const start = seg.points?.[0], end = seg.points?.[1];
        if (isFinitePoint(start) && isFinitePoint(end) && Number.isFinite(seg.valueMm)) {
          withAlpha(() => drawRailSegment(ctx, start, end, {
            offset: EYE_WIDTH_OVERLAY_CONFIG.railOffset,
            color: eyeWidthColors.right || "#fff",
            drawRail: EYE_WIDTH_OVERLAY_CONFIG.drawRail !== false,
            __policy: policy,
            label: {
              text: `R ${policy.compact.shortenLabels ? "" : "width "}${seg.valueMm.toFixed(1)} mm`,
              color: eyeWidthColors.right || "#fff",
              offset: {
                orientation: { x: 0, y: Math.sign(EYE_WIDTH_OVERLAY_CONFIG.railOffset || -120) },
                distance: Math.abs(EYE_WIDTH_OVERLAY_CONFIG.textLift ?? 18),
              },
              alignToRail: true,
              leader: (policy.maxLeaders > leadersUsed) ? { from: start, lineWidth: 1.1, color: eyeWidthColors.right } : undefined,
            },
          }), focus !== "eyes");
          if (policy.maxLeaders > leadersUsed) leadersUsed++;
        }
      }
    }

    // NOSE (only if toggled; minimal shows rails only; standard/full add labels/angles)
    if (noseOverlayEnabled && (focus === "global" || focus === "nose")) {
      withAlpha(() => drawNoseOverlay(ctx, state.nose, policy), focus !== "nose");
    }
  }

  function drawNoseOverlayPublic(metrics) { drawNoseOverlay(ctx, metrics, policy); }
  function drawNoseGridPublic(landmarks, noseIndices, color, options) {
    drawNoseGrid(ctx, canvas, landmarks, noseIndices, color, options);
  }

  return {
    beginFrame,
    setRenderPolicy,
    drawNoseGrid: drawNoseGridPublic,
    drawMeasurementOverlays,
    drawNoseOverlay: drawNoseOverlayPublic,
  };
}
