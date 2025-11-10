import {
  COLOR_CONFIG,
  LABEL_FONT,
  NOSE_OVERLAY_OFFSETS,
  NOSE_GRID_STYLE,
  IPD_OVERLAY_CONFIG,
  FACE_OVERLAY_CONFIG,
  EYE_WIDTH_OVERLAY_CONFIG,
} from "./config.js";

export function createGraphics(canvasElement, canvasCtx) {
  const noseColors = COLOR_CONFIG.noseMetrics || {};
  const eyeWidthColors = COLOR_CONFIG.eyeWidths || {};
  const ipdColors = COLOR_CONFIG.ipd || {};
  const faceColor = COLOR_CONFIG.faceWidth || "#FFFFFF";
  const toDisplayX = (x) => canvasElement.width - x;
  const toDisplayPoint = (pt) => (pt ? { x: toDisplayX(pt.x), y: pt.y } : null);
  const translatePoint = (point, direction, distance) =>
    point && direction
      ? { x: point.x + direction.x * distance, y: point.y + direction.y * distance }
      : null;
  const normalizeVector = (vec) => {
    if (!vec) return null;
    const length = Math.hypot(vec.x, vec.y);
    if (!length) return null;
    return { x: vec.x / length, y: vec.y / length };
  };

  function measureLabel(text) {
    canvasCtx.save();
    canvasCtx.font = LABEL_FONT;
    const metrics = canvasCtx.measureText(text);
    canvasCtx.restore();
    const height =
      (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0) || 18;
    return { width: metrics.width, height };
  }

  function drawLabel(
    text,
    {
      position,
      angle = 0,
      color = "#FFFFFF",
      baseline = "middle",
      align = "center",
      leader,
    } = {}
  ) {
    if (!text || !position) return;
    if (leader?.from) {
      canvasCtx.save();
      canvasCtx.strokeStyle = leader.color || color;
      canvasCtx.lineWidth = leader.lineWidth ?? 1.5;
      canvasCtx.beginPath();
      canvasCtx.moveTo(leader.from.x, leader.from.y);
      canvasCtx.lineTo(position.x, position.y);
      canvasCtx.stroke();
      canvasCtx.restore();
    }
    let rot = angle;
    while (rot > Math.PI) rot -= Math.PI * 2;
    while (rot <= -Math.PI) rot += Math.PI * 2;
    if (rot > Math.PI / 2) rot -= Math.PI;
    if (rot < -Math.PI / 2) rot += Math.PI;

    canvasCtx.save();
    canvasCtx.translate(position.x, position.y);
    canvasCtx.rotate(rot);
    canvasCtx.fillStyle = color;
    canvasCtx.font = LABEL_FONT;
    canvasCtx.textAlign = align;
    canvasCtx.textBaseline = baseline;
    canvasCtx.fillText(text, 0, 0);
    canvasCtx.restore();
  }

  function normalizeRailOptions(options = {}) {
    return {
      offset: options.offset ?? 0,
      color: options.color ?? "#FFFFFF",
      lineWidth: options.lineWidth ?? 2,
      connectBase: options.connectBase ?? true,
      offsetOrientation: options.offsetOrientation ?? "perpendicular",
      drawRail: options.drawRail ?? true,
      label: options.label ?? null,
    };
  }

  function drawRailSegment(baseStart, baseEnd, options = {}) {
    const { offset, color, lineWidth, connectBase, offsetOrientation, drawRail, label } =
      normalizeRailOptions(options);
    if (!baseStart || !baseEnd) return null;
    const vec = { x: baseEnd.x - baseStart.x, y: baseEnd.y - baseStart.y };
    const length = Math.hypot(vec.x, vec.y) || 1;
    const norm = { x: vec.x / length, y: vec.y / length };
    const perp = { x: -norm.y, y: norm.x };
    const resolveOrientation = (mode) => {
      if (!mode || mode === "perpendicular") return perp;
      if (mode === "parallel") return norm;
      if (mode === "horizontal") return { x: 1, y: 0 };
      if (mode === "vertical") return { x: 0, y: 1 };
      if (typeof mode === "number") {
        return { x: Math.cos(mode), y: Math.sin(mode) };
      }
      if (typeof mode === "object" && mode.x != null && mode.y != null) {
        return normalizeVector(mode) || perp;
      }
      return perp;
    };

    const offsetDir = resolveOrientation(offsetOrientation);
    const offsetVec = { x: offsetDir.x * offset, y: offsetDir.y * offset };
    const offsetStart = {
      x: baseStart.x + offsetVec.x,
      y: baseStart.y + offsetVec.y,
    };
    const offsetEnd = {
      x: baseEnd.x + offsetVec.x,
      y: baseEnd.y + offsetVec.y,
    };

    if (drawRail) {
      canvasCtx.save();
      canvasCtx.strokeStyle = color;
      canvasCtx.lineWidth = lineWidth;
      canvasCtx.beginPath();
      canvasCtx.moveTo(offsetStart.x, offsetStart.y);
      canvasCtx.lineTo(offsetEnd.x, offsetEnd.y);
      if (connectBase) {
        canvasCtx.moveTo(offsetStart.x, offsetStart.y);
        canvasCtx.lineTo(baseStart.x, baseStart.y);
        canvasCtx.moveTo(offsetEnd.x, offsetEnd.y);
        canvasCtx.lineTo(baseEnd.x, baseEnd.y);
      }
      canvasCtx.stroke();
      canvasCtx.restore();
    }

    const geometry = {
      angle: Math.atan2(vec.y, vec.x),
      perp: offsetDir,
      midPoint: {
        x: (offsetStart.x + offsetEnd.x) / 2,
        y: (offsetStart.y + offsetEnd.y) / 2,
      },
      offsetStart,
      offsetEnd,
    };

    if (label?.text) {
      const labelColor = label.color || color;
      let labelPosition = label.position;
      if (!labelPosition) {
        const labelOffset = label.offset || {};
        const labelOrientation = labelOffset.orientation ?? "perpendicular";
        const labelDir = resolveOrientation(labelOrientation);
        const labelDistance = labelOffset.distance ?? 0;
        const referencePoint =
          labelOffset.reference === "start"
            ? geometry.offsetStart
            : labelOffset.reference === "end"
              ? geometry.offsetEnd
              : geometry.midPoint;
        labelPosition = translatePoint(referencePoint, labelDir, labelDistance);
      }

      drawLabel(label.text, {
        position: labelPosition,
        angle: label.angle ?? geometry.angle,
        color: labelColor,
        align: label.align,
        baseline: label.baseline,
        leader: label.leader,
      });
    }

    return geometry;
  }



  function drawSmoothCurve(points) {
    if (points.length < 2) return;
    canvasCtx.beginPath();
    canvasCtx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      canvasCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    canvasCtx.stroke();
  }

  function drawNoseGrid(landmarks, noseIndices, color = NOSE_GRID_STYLE.color) {
    if (!landmarks?.length || !noseIndices) return;
    const rows = (() => {
      if (Array.isArray(noseIndices)) return noseIndices;
      if (Array.isArray(noseIndices.rows)) return noseIndices.rows;
      return Object.values(noseIndices).filter(Array.isArray);
    })();
    if (!rows.length) return;
    const getPoint = (idx) => {
      const lm = landmarks[idx];
      if (!lm) return null;
      return {
        x: lm.x * canvasElement.width,
        y: lm.y * canvasElement.height,
      };
    };

    const drawSegments = (indices) => {
      let segment = [];
      indices.forEach((idx) => {
        const pt = typeof idx === "number" ? getPoint(idx) : null;
        if (pt) {
          segment.push(pt);
        } else if (segment.length) {
          drawSmoothCurve(segment);
          segment = [];
        }
      });
      if (segment.length) drawSmoothCurve(segment);
    };

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = NOSE_GRID_STYLE.lineWidth;

    rows.forEach((row) => drawSegments(row));

    const maxCols = Math.max(...rows.map((row) => row?.length || 0));
    for (let col = 0; col < maxCols; col++) {
      const column = rows.map((row) => (typeof row[col] === "number" ? row[col] : null));
      drawSegments(column);
    }

    canvasCtx.restore();
  }

  function drawHorizontalBracket(row, label, value, color, placement = "top") {
    if (!row?.left || !row?.right || !Number.isFinite(value)) return;
    const left = toDisplayPoint(row.left);
    const right = toDisplayPoint(row.right);
    if (!left || !right) return;
    const direction = placement === "top" ? -1 : 1;
    const bracketOffsets = NOSE_OVERLAY_OFFSETS.horizontalBracket;
    const lineOffset = bracketOffsets.lineOffset;
    const lineY =
      direction === -1
        ? Math.min(left.y, right.y) + direction * lineOffset
        : Math.max(left.y, right.y) + direction * lineOffset;

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(left.x, left.y);
    canvasCtx.lineTo(left.x, lineY);
    canvasCtx.moveTo(right.x, right.y);
    canvasCtx.lineTo(right.x, lineY);
    canvasCtx.moveTo(left.x, lineY);
    canvasCtx.lineTo(right.x, lineY);
    canvasCtx.stroke();
    canvasCtx.restore();

    const labelText = `${label} ${value.toFixed(1)} mm`;
    const labelSize = measureLabel(labelText);
    const labelOffset = labelSize.height / 2 + bracketOffsets.labelPadding;
    const labelPos = {
      x: (left.x + right.x) / 2,
      y: lineY + direction * labelOffset,
    };
    drawLabel(labelText, { position: labelPos, color });
  }

  function drawPadHeightBracket(bridgeRow, padRow, value, color) {
    if (!bridgeRow?.left || !padRow?.left || !Number.isFinite(value)) return;
    const bridgePt = toDisplayPoint(bridgeRow.left);
    const padPt = toDisplayPoint(padRow.left);
    if (!bridgePt || !padPt) return;
    const horizontalInset = NOSE_OVERLAY_OFFSETS.padHeight.horizontalInset;
    const offsetTargetX = Math.min(bridgePt.x, padPt.x) + horizontalInset;
    const offsetValue = offsetTargetX - bridgePt.x;

    const labelText = `Pad Height ${value.toFixed(1)} mm`;
    const labelSize = measureLabel(labelText);
    const labelGap = NOSE_OVERLAY_OFFSETS.padHeight.labelGap + labelSize.height / 2;
    const directionSign = offsetValue >= 0 ? 1 : -1;

    drawRailSegment(bridgePt, padPt, {
      offset: offsetValue,
      offsetOrientation: "horizontal",
      color,
      label: {
        text: labelText,
        angle: -Math.PI / 2,
        offset: {
          orientation: "horizontal",
          distance: labelGap * directionSign,
        },
      },
    });
  }

  function drawAngleGuide({ origin, endA, endB }, { label, color, labelOffset, labelAngle = 0 }) {
    if (!origin || !endA || !endB) return;

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(origin.x, origin.y);
    canvasCtx.lineTo(endA.x, endA.y);
    canvasCtx.moveTo(origin.x, origin.y);
    canvasCtx.lineTo(endB.x, endB.y);
    canvasCtx.stroke();
    canvasCtx.restore();

    if (!label) return;
    const labelSize = measureLabel(label);
    const labelPos = {
      x: origin.x + (labelSize.width / 2 + (labelOffset?.x ?? 0)),
      y: origin.y - (labelSize.height / 2 + (labelOffset?.y ?? 0)),
    };
    drawLabel(label, { position: labelPos, angle: labelAngle, color });
  }

  function drawPadAngleGuide(lines, value, color) {
    if (!lines || !Number.isFinite(value)) return;
    const geometry = {
      origin: toDisplayPoint(lines.origin),
      endA: toDisplayPoint(lines.lineAEnd),
      endB: toDisplayPoint(lines.lineBEnd),
    };
    if (!geometry.origin || !geometry.endA || !geometry.endB) return;
    const { labelOffsetX, labelOffsetY } = NOSE_OVERLAY_OFFSETS.padAngle;
    const label = `Pad Angle ${value.toFixed(1)}°`;
    const topY = Math.min(geometry.endA.y, geometry.endB.y);
    const labelPos = {
      x: geometry.origin.x + labelOffsetX,
      y: topY - labelOffsetY,
    };

    drawAngleGuide(geometry, {
      label,
      color,
      labelOffset: { x: labelOffsetX, y: geometry.origin.y - labelPos.y },
    });
  }

  function drawFlareAngleGuide(padRow, value, color) {
    if (!padRow?.left || !padRow?.right || !Number.isFinite(value)) return;
    const center = {
      x: (padRow.left.x + padRow.right.x) / 2,
      y: padRow.midY,
    };
    const left = toDisplayPoint(padRow.left);
    const right = toDisplayPoint(padRow.right);
    const vertex = toDisplayPoint(center);
    if (!left || !right || !vertex) return;
    const { baseOffsetY, labelOffsetY } = NOSE_OVERLAY_OFFSETS.flareAngle;
    const offsetY = Math.max(left.y, right.y) + baseOffsetY;
    const bottomCenter = { x: vertex.x, y: offsetY };

    drawAngleGuide(
      {
        origin: bottomCenter,
        endA: left,
        endB: right,
      },
      {
        label: `Flare Angle ${value.toFixed(1)}°`,
        color,
        labelOffset: { x: 0, y: -labelOffsetY },
      }
    );
  }

  function drawEyeWidthRail(
    segment,
    label,
    value,
    color,
    {
      offset = EYE_WIDTH_OVERLAY_CONFIG.railOffset,
      textLift = EYE_WIDTH_OVERLAY_CONFIG.textLift ?? 18,
      align = EYE_WIDTH_OVERLAY_CONFIG.textAlign ?? "center",
      drawRail = EYE_WIDTH_OVERLAY_CONFIG.drawRail !== false,
    } = {}
  ) {
    if (!segment?.points || !Number.isFinite(value)) return;
    const start = { x: toDisplayX(segment.points[0].x), y: segment.points[0].y };
    const end = { x: toDisplayX(segment.points[1].x), y: segment.points[1].y };
    drawRailSegment(start, end, {
      offset,
      color,
      drawRail,
      label: {
        text: `${label} ${value.toFixed(1)} mm`,
        offset: { distance: textLift },
        color,
        align,
      },
    });
  }

  function drawNoseOverlay(metrics) {
    if (!metrics?.rows) return;
    const { bridge, pad, tip } = metrics.rows;
    if (Number.isFinite(metrics.bridgeWidthMm)) {
      drawHorizontalBracket(bridge, "Bridge width", metrics.bridgeWidthMm, noseColors.bridge, "top");
    }
    if (Number.isFinite(metrics.padSpanMm)) {
      drawHorizontalBracket(pad, "Pad width", metrics.padSpanMm, noseColors.padSpan, "top");
    }
    if (Number.isFinite(metrics.padHeightMm)) {
      drawPadHeightBracket(bridge, pad, metrics.padHeightMm, noseColors.padHeight);
    }
    if (Number.isFinite(metrics.padAngleDeg) && metrics.padAngleLines) {
      drawPadAngleGuide(metrics.padAngleLines, metrics.padAngleDeg, noseColors.padAngle);
    }
    if (Number.isFinite(metrics.flareAngleDeg)) {
      drawFlareAngleGuide(pad, metrics.flareAngleDeg, noseColors.flareAngle);
    }
  }

  function drawIpdMeasurement(ipdData) {
    if (!ipdData) return;
    const leftPupilDisplay = {
      x: toDisplayX(ipdData.left.x),
      y: ipdData.left.y,
    };
    const rightPupilDisplay = {
      x: toDisplayX(ipdData.right.x),
      y: ipdData.right.y,
    };
    const textLift = IPD_OVERLAY_CONFIG.textLift ?? 18;

    IPD_OVERLAY_CONFIG.rails.forEach(({ key, label, offset, drawRail = true, textAlign }) => {
      const value = ipdData[key];
      if (!Number.isFinite(value)) return;
      const color = ipdColors[key] || "#FFFFFF";
      drawRailSegment(leftPupilDisplay, rightPupilDisplay, {
        offset,
        color,
        drawRail,
        label: {
          text: `${label} ${value.toFixed(1)} mm`,
          offset: { distance: textLift },
          align: textAlign || "center",
          color,
        },
      });
    });
  }

  function drawFaceWidthMeasurement(faceData) {
    if (!faceData) return;
    const left = { x: toDisplayX(faceData.left.x), y: faceData.left.y };
    const right = { x: toDisplayX(faceData.right.x), y: faceData.right.y };
    const spanOffset = FACE_OVERLAY_CONFIG.spanOffset ?? 50;
    const labelLift = FACE_OVERLAY_CONFIG.labelLift ?? 16;
    const faceLabel = FACE_OVERLAY_CONFIG.label || "Face";
    drawRailSegment(left, right, {
      offset: spanOffset,
      color: faceColor,
      label: {
        text: `${faceLabel} ${faceData.valueMm.toFixed(1)} mm`,
        color: faceColor,
        offset: { distance: labelLift },
      },
    });
  }

  function drawMeasurementOverlays(state, { noseOverlayEnabled = false } = {}) {
    if (noseOverlayEnabled) {
      if (state.nose) drawNoseOverlay(state.nose);
      return;
    }

    if (state.ipd) drawIpdMeasurement(state.ipd);
    if (state.faceWidth) drawFaceWidthMeasurement(state.faceWidth);
    if (state.eyes?.left) {
      drawEyeWidthRail(state.eyes.left, "L width", state.eyes.left.valueMm, eyeWidthColors.left);
    }
    if (state.eyes?.right) {
      drawEyeWidthRail(state.eyes.right, "R width", state.eyes.right.valueMm, eyeWidthColors.right);
    }
  }

  return {
    drawNoseGrid,
    drawMeasurementOverlays,
  };
}
