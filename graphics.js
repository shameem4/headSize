export const NOSE_METRIC_COLORS = {
  bridge: "#FF9F43",
  padSpan: "#00FFC8",
  padHeight: "#FFD166",
  padAngle: "#4DA6FF",
  flareAngle: "#FF6AD5",
};

export const EYE_WIDTH_COLORS = {
  left: "#6AE1FF",
  right: "#FF9BEA",
};

export function createGraphics(canvasElement, canvasCtx) {
  const toDisplayX = (x) => canvasElement.width - x;
  const toDisplayPoint = (pt) => (pt ? { x: toDisplayX(pt.x), y: pt.y } : null);

  function drawRotatedLabel(text, position, angle, color = "#FFFFFF") {
    if (!text || !position) return;
    let rot = angle;
    while (rot > Math.PI) rot -= Math.PI * 2;
    while (rot <= -Math.PI) rot += Math.PI * 2;
    if (rot > Math.PI / 2) rot -= Math.PI;
    if (rot < -Math.PI / 2) rot += Math.PI;

    canvasCtx.save();
    canvasCtx.translate(position.x, position.y);
    canvasCtx.rotate(rot);
    canvasCtx.fillStyle = color;
    canvasCtx.font = "bold 18px 'Segoe UI', sans-serif";
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";
    canvasCtx.fillText(text, 0, 0);
    canvasCtx.restore();
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

  function drawNoseGrid(landmarks, noseIndices, color = "#ffffff63") {
    if (!landmarks?.length || !noseIndices?.length) return;
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
    canvasCtx.lineWidth = 1.5;

    noseIndices.forEach((row) => drawSegments(row));

    const maxCols = Math.max(...noseIndices.map((row) => row.length));
    for (let col = 0; col < maxCols; col++) {
      const column = noseIndices.map((row) => (typeof row[col] === "number" ? row[col] : null));
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
    const offset = 8;
    const lineY =
      direction === -1
        ? Math.min(left.y, right.y) + direction * offset
        : Math.max(left.y, right.y) + direction * offset;

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

    const labelPos = {
      x: (left.x + right.x) / 2,
      y: lineY + direction * 16,
    };
    drawRotatedLabel(`${label} ${value.toFixed(1)} mm`, labelPos, 0, color);
  }

  function drawPadHeightBracket(bridgeRow, padRow, value, color) {
    if (!bridgeRow?.left || !padRow?.left || !Number.isFinite(value)) return;
    const bridgePt = toDisplayPoint(bridgeRow.left);
    const padPt = toDisplayPoint(padRow.left);
    if (!bridgePt || !padPt) return;
    const offsetX = Math.min(bridgePt.x, padPt.x) + 60;

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(bridgePt.x, bridgePt.y);
    canvasCtx.lineTo(offsetX, bridgePt.y);
    canvasCtx.lineTo(offsetX, padPt.y);
    canvasCtx.lineTo(padPt.x, padPt.y);
    canvasCtx.stroke();
    canvasCtx.restore();

    const labelPos = {
      x: offsetX + 90,
      y: (bridgePt.y + padPt.y) / 2,
    };
    drawRotatedLabel(`Pad Height ${value.toFixed(1)} mm`, labelPos, -Math.PI / 2, color);
  }

  function drawPadAngleGuide(lines, value, color) {
    if (!lines || !Number.isFinite(value)) return;
    const origin = toDisplayPoint(lines.origin);
    const endA = toDisplayPoint(lines.lineAEnd);
    const endB = toDisplayPoint(lines.lineBEnd);
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

    const labelPos = {
      x: origin.x + 45,
      y: Math.min(endA.y, endB.y) - 10,
    };
    drawRotatedLabel(`Pad Angle ${value.toFixed(1)}°`, labelPos, 0, color);
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
    const offsetY = Math.max(left.y, right.y) + 12;
    const bottomCenter = { x: vertex.x, y: offsetY };

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(bottomCenter.x, bottomCenter.y);
    canvasCtx.lineTo(left.x, left.y);
    canvasCtx.moveTo(bottomCenter.x, bottomCenter.y);
    canvasCtx.lineTo(right.x, right.y);
    canvasCtx.stroke();
    canvasCtx.restore();

    const labelPos = {
      x: bottomCenter.x,
      y: bottomCenter.y + 18,
    };
    drawRotatedLabel(`Flare Angle ${value.toFixed(1)}°`, labelPos, 0, color);
  }

  function drawEyeWidthRail(segment, label, value, color, offset = 18) {
    if (!segment?.points || !Number.isFinite(value)) return;
    const start = { x: toDisplayX(segment.points[0].x), y: segment.points[0].y };
    const end = { x: toDisplayX(segment.points[1].x), y: segment.points[1].y };
    const vec = { x: end.x - start.x, y: end.y - start.y };
    const len = Math.hypot(vec.x, vec.y) || 1;
    const norm = { x: vec.x / len, y: vec.y / len };
    const perp = { x: -norm.y, y: norm.x };
    const leftLabel = {
      x: start.x + perp.x * offset,
      y: start.y + perp.y * offset,
    };
    const rightLabel = {
      x: end.x + perp.x * offset,
      y: end.y + perp.y * offset,
    };
    const midPoint = {
      x: (leftLabel.x + rightLabel.x) / 2,
      y: (leftLabel.y + rightLabel.y) / 2,
    };

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(leftLabel.x, leftLabel.y);
    canvasCtx.lineTo(rightLabel.x, rightLabel.y);
    canvasCtx.moveTo(leftLabel.x, leftLabel.y);
    canvasCtx.lineTo(start.x, start.y);
    canvasCtx.moveTo(rightLabel.x, rightLabel.y);
    canvasCtx.lineTo(end.x, end.y);
    canvasCtx.stroke();
    canvasCtx.restore();

    drawRotatedLabel(`${label} ${value.toFixed(1)} mm`, midPoint, Math.atan2(vec.y, vec.x), color);
  }

  function drawNoseOverlay(metrics) {
    if (!metrics?.rows) return;
    const { bridge, pad, tip } = metrics.rows;
    if (Number.isFinite(metrics.bridgeWidthMm)) {
      drawHorizontalBracket(bridge, "Bridge width", metrics.bridgeWidthMm, NOSE_METRIC_COLORS.bridge, "top");
    }
    if (Number.isFinite(metrics.padSpanMm)) {
      drawHorizontalBracket(pad, "Pad width", metrics.padSpanMm, NOSE_METRIC_COLORS.padSpan, "top");
    }
    if (Number.isFinite(metrics.padHeightMm)) {
      drawPadHeightBracket(bridge, pad, metrics.padHeightMm, NOSE_METRIC_COLORS.padHeight);
    }
    if (Number.isFinite(metrics.padAngleDeg) && metrics.padAngleLines) {
      drawPadAngleGuide(metrics.padAngleLines, metrics.padAngleDeg, NOSE_METRIC_COLORS.padAngle);
    }
    if (Number.isFinite(metrics.flareAngleDeg)) {
      drawFlareAngleGuide(pad, metrics.flareAngleDeg, NOSE_METRIC_COLORS.flareAngle);
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
    const baseVec = {
      x: rightPupilDisplay.x - leftPupilDisplay.x,
      y: rightPupilDisplay.y - leftPupilDisplay.y,
    };
    const baseLen = Math.hypot(baseVec.x, baseVec.y) || 1;
    const baseNorm = { x: baseVec.x / baseLen, y: baseVec.y / baseLen };
    const perp = { x: -baseNorm.y, y: baseNorm.x };
    const textLift = 18;
    const baseAngle = Math.atan2(baseVec.y, baseVec.x);

    const drawRail = (offset, color, label) => {
      const leftLabel = {
        x: leftPupilDisplay.x + perp.x * offset,
        y: leftPupilDisplay.y + perp.y * offset,
      };
      const rightLabel = {
        x: rightPupilDisplay.x + perp.x * offset,
        y: rightPupilDisplay.y + perp.y * offset,
      };
      const leftTextAnchor = {
        x: leftLabel.x + perp.x * textLift,
        y: leftLabel.y + perp.y * textLift,
      };
      const rightTextAnchor = {
        x: rightLabel.x + perp.x * textLift,
        y: rightLabel.y + perp.y * textLift,
      };
      const midPoint = {
        x: (leftTextAnchor.x + rightTextAnchor.x) / 2,
        y: (leftTextAnchor.y + rightTextAnchor.y) / 2,
      };

      canvasCtx.save();
      canvasCtx.strokeStyle = color;
      canvasCtx.lineWidth = 2;
      canvasCtx.beginPath();
      canvasCtx.moveTo(leftLabel.x, leftLabel.y);
      canvasCtx.lineTo(rightLabel.x, rightLabel.y);
      canvasCtx.moveTo(leftLabel.x, leftLabel.y);
      canvasCtx.lineTo(leftPupilDisplay.x, leftPupilDisplay.y);
      canvasCtx.moveTo(rightLabel.x, rightLabel.y);
      canvasCtx.lineTo(rightPupilDisplay.x, rightPupilDisplay.y);
      canvasCtx.stroke();
      canvasCtx.restore();

      drawRotatedLabel(label, midPoint, baseAngle, color);
    };

    drawRail(55, "#FFFFFF", `Near ${ipdData.near.toFixed(1)} mm`);
    if (Number.isFinite(ipdData.far)) {
      drawRail(85, "#A0FFE6", `Far ${ipdData.far.toFixed(1)} mm`);
    }
  }

  function drawFaceWidthMeasurement(faceData) {
    if (!faceData) return;
    const left = { x: toDisplayX(faceData.left.x), y: faceData.left.y };
    const right = { x: toDisplayX(faceData.right.x), y: faceData.right.y };
    const faceVec = { x: right.x - left.x, y: right.y - left.y };
    const faceLen = Math.hypot(faceVec.x, faceVec.y) || 1;
    const faceNorm = { x: faceVec.x / faceLen, y: faceVec.y / faceLen };
    const facePerp = { x: -faceNorm.y, y: faceNorm.x };
    const spanOffset = 50;
    const labelLift = 16;
    const leftFaceLabel = {
      x: left.x + facePerp.x * spanOffset,
      y: left.y + facePerp.y * spanOffset,
    };
    const rightFaceLabel = {
      x: right.x + facePerp.x * spanOffset,
      y: right.y + facePerp.y * spanOffset,
    };
    const faceMid = {
      x: (leftFaceLabel.x + rightFaceLabel.x) / 2 + facePerp.x * labelLift,
      y: (leftFaceLabel.y + rightFaceLabel.y) / 2 + facePerp.y * labelLift,
    };
    const faceAngle = Math.atan2(faceVec.y, faceVec.x);

    canvasCtx.save();
    canvasCtx.strokeStyle = "#FFFFFF";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(leftFaceLabel.x, leftFaceLabel.y);
    canvasCtx.lineTo(rightFaceLabel.x, rightFaceLabel.y);
    canvasCtx.moveTo(leftFaceLabel.x, leftFaceLabel.y);
    canvasCtx.lineTo(left.x, left.y);
    canvasCtx.moveTo(rightFaceLabel.x, rightFaceLabel.y);
    canvasCtx.lineTo(right.x, right.y);
    canvasCtx.stroke();
    canvasCtx.restore();

    drawRotatedLabel(`Face ${faceData.valueMm.toFixed(1)} mm`, faceMid, faceAngle, "#FFFFFF");
  }

  function drawMeasurementOverlays(state, { noseOverlayEnabled = false } = {}) {
    if (noseOverlayEnabled) {
      if (state.nose) drawNoseOverlay(state.nose);
      return;
    }

    if (state.ipd) drawIpdMeasurement(state.ipd);
    if (state.faceWidth) drawFaceWidthMeasurement(state.faceWidth);
    if (state.eyes?.left) {
      drawEyeWidthRail(state.eyes.left, "Left eye", state.eyes.left.valueMm, EYE_WIDTH_COLORS.left, 20);
    }
    if (state.eyes?.right) {
      drawEyeWidthRail(state.eyes.right, "Right eye", state.eyes.right.valueMm, EYE_WIDTH_COLORS.right, 20);
    }
  }

  return {
    drawNoseGrid,
    drawMeasurementOverlays,
  };
}
