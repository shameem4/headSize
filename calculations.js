const EPSILON = 1e-3;

export function pixelsPerMillimeter(pixelLength, irisDiameterMm = 11.7) {
  return pixelLength > 0 ? pixelLength / irisDiameterMm : null;
}

export function millimetersPerPixel(pixelLength, irisDiameterMm = 11.7) {
  const pxPerMm = pixelsPerMillimeter(pixelLength, irisDiameterMm);
  return pxPerMm ? 1 / pxPerMm : null;
}

export function estimateCameraDistanceCm(diameterPx, focalLengthPx, irisDiameterMm = 11.7) {
  const mmPerPx = millimetersPerPixel(diameterPx, irisDiameterMm);
  if (!mmPerPx) return null;
  const distanceX = (focalLengthPx.x * mmPerPx) / 10;
  const distanceY = (focalLengthPx.y * mmPerPx) / 10;
  return (distanceX + distanceY) / 2;
}

function computeRowMetrics(rowPoints) {
  if (!rowPoints) return null;
  const valid = rowPoints.filter(Boolean);
  if (valid.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let sumY = 0;
  let leftPt = null;
  let rightPt = null;
  valid.forEach((pt) => {
    if (pt.x < minX) {
      minX = pt.x;
      leftPt = { x: pt.x, y: pt.y };
    }
    if (pt.x > maxX) {
      maxX = pt.x;
      rightPt = { x: pt.x, y: pt.y };
    }
    sumY += pt.y;
  });
  return {
    widthPx: maxX - minX,
    midY: sumY / valid.length,
    left: leftPt,
    right: rightPt,
  };
}

export function computeNoseMetrics(gridPoints, mmPerPx) {
  if (!gridPoints || !Number.isFinite(mmPerPx) || mmPerPx <= 0) return null;
  const rowCount = gridPoints.length;
  if (!rowCount) return null;
  const bridgeRowIndex = Math.min(2, rowCount - 1);
  const padRowIndex = Math.min(3, rowCount - 1);
  const bridgeRow = computeRowMetrics(gridPoints[bridgeRowIndex]);
  const padRow = computeRowMetrics(gridPoints[padRowIndex]);
  const tipRow = computeRowMetrics(gridPoints[rowCount - 1]);
  const padRowPoints = gridPoints[padRowIndex] || [];
  if (!bridgeRow || !padRow) return null;

  const toMm = (px) => px * mmPerPx;
  const bridgeWidthMm = toMm(bridgeRow.widthPx);
  const padSpanMm = toMm(padRow.widthPx);
  const padHeightMm = Math.abs(padRow.midY - bridgeRow.midY) * mmPerPx;

  const columnCount = gridPoints[0]?.length || 0;
  const midColumn = Math.floor(columnCount / 2);
  const getColumnPoint = (rowIdx, colIdx) => {
    const row = gridPoints[rowIdx];
    if (!row || colIdx < 0 || colIdx >= row.length) return null;
    return row[colIdx];
  };

  let topMid = null;
  let bottomMid = null;
  let topMidRow = 0;
  for (let r = 1; r <= Math.min(rowCount - 1, 3); r++) {
    const pt = getColumnPoint(r, midColumn);
    if (pt && !topMid) {
      topMid = pt;
      topMidRow = r;
    }
    if (pt) bottomMid = pt;
  }

  let diagPoint = topMid;
  let diagCol = midColumn;
  if (topMid) {
    for (let r = topMidRow + 1; r <= Math.min(rowCount - 1, 3); r++) {
      diagCol += 1;
      const candidate = getColumnPoint(r, diagCol);
      if (!candidate) break;
      diagPoint = candidate;
    }
  }

  const padAngleDeg = (() => {
    if (!topMid || !bottomMid || !diagPoint) return null;
    const vecA = { x: bottomMid.x - topMid.x, y: bottomMid.y - topMid.y };
    const vecB = { x: diagPoint.x - topMid.x, y: diagPoint.y - topMid.y };
    const magA = Math.hypot(vecA.x, vecA.y);
    const magB = Math.hypot(vecB.x, vecB.y);
    if (!magA || !magB) return null;
    const cosTheta = (vecA.x * vecB.x + vecA.y * vecB.y) / (magA * magB);
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
    return (theta * 180) / Math.PI;
  })();

  const padAngleLines =
    topMid && bottomMid && diagPoint
      ? {
          origin: topMid,
          lineAEnd: bottomMid,
          lineBEnd: diagPoint,
        }
      : null;

  const flareAngleDeg = (() => {
    if (!padRowPoints.length) return null;
    const midIdx = Math.floor(padRowPoints.length / 2);
    const center = padRowPoints[midIdx];
    const left = padRowPoints[midIdx - 1];
    const right = padRowPoints[midIdx + 1];
    if (!center || !left || !right) return null;
    const leftVec = { x: left.x - center.x, y: left.y - center.y };
    const rightVec = { x: right.x - center.x, y: right.y - center.y };
    const leftMag = Math.hypot(leftVec.x, leftVec.y);
    const rightMag = Math.hypot(rightVec.x, rightVec.y);
    if (!leftMag || !rightMag) return null;
    const cosTheta = (leftVec.x * rightVec.x + leftVec.y * rightVec.y) / (leftMag * rightMag);
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
    return (theta * 180) / Math.PI;
  })();

  return {
    bridgeWidthMm,
    padSpanMm,
    padHeightMm,
    padAngleDeg,
    padAngleLines,
    flareAngleDeg,
    rows: {
      bridge: bridgeRow,
      pad: padRow,
      tip: tipRow,
    },
  };
}

export function extractEyeSegment(landmarks, idxPair, canvasWidth, canvasHeight) {
  const a = landmarks[idxPair[0]];
  const b = landmarks[idxPair[1]];
  if (!a || !b) return null;
  const ax = a.x * canvasWidth;
  const ay = a.y * canvasHeight;
  const bx = b.x * canvasWidth;
  const by = b.y * canvasHeight;
  return {
    pxLength: Math.hypot(ax - bx, ay - by),
    points: [
      { x: ax, y: ay },
      { x: bx, y: by },
    ],
  };
}

export function buildIpdMeasurement(leftIris, rightIris, mmPerPx) {
  if (!leftIris || !rightIris || !Number.isFinite(mmPerPx)) return null;
  const dxPx = rightIris.center.x - leftIris.center.x;
  const dyPx = rightIris.center.y - leftIris.center.y;
  const pupilDistancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  const near = pupilDistancePx * mmPerPx;
  const far = near * 1.05;
  return {
    near,
    far,
    left: { x: leftIris.center.x, y: leftIris.center.y },
    right: { x: rightIris.center.x, y: rightIris.center.y },
  };
}

export function buildFaceWidthMeasurement(points, mmPerPx) {
  if (!points?.left || !points?.right || !Number.isFinite(mmPerPx)) return null;
  const faceWidthPx = Math.hypot(points.right.x - points.left.x, points.right.y - points.left.y);
  const faceWidthMm = faceWidthPx * mmPerPx;
  if (!Number.isFinite(faceWidthMm) || faceWidthMm <= 0) return null;
  return {
    valueMm: faceWidthMm,
    left: { ...points.left },
    right: { ...points.right },
  };
}

export function buildEyeWidthMeasurement(segment, mmPerPx) {
  if (!segment?.pxLength || !Number.isFinite(mmPerPx)) return null;
  return {
    valueMm: segment.pxLength * mmPerPx,
    points: segment.points.map((pt) => ({ ...pt })),
  };
}

function distanceBetweenPoints(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function circleFromTwoPoints(p1, p2) {
  return {
    center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    radius: distanceBetweenPoints(p1, p2) / 2,
  };
}

function circleFromThreePoints(p1, p2, p3) {
  const d =
    2 *
    (p1.x * (p2.y - p3.y) +
      p2.x * (p3.y - p1.y) +
      p3.x * (p1.y - p2.y));
  if (Math.abs(d) < EPSILON) return null;

  const ux =
    ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) +
      (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) +
      (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) /
    d;
  const uy =
    ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) +
      (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) +
      (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) /
    d;
  const center = { x: ux, y: uy };
  return {
    center,
    radius: distanceBetweenPoints(center, p1),
  };
}

function isPointInsideCircle(point, circle) {
  if (!circle) return false;
  return distanceBetweenPoints(point, circle.center) <= circle.radius + EPSILON;
}

export function minEnclosingCircle(points) {
  if (!points?.length) return null;
  let circle = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (circle && isPointInsideCircle(p, circle)) continue;

    circle = { center: { ...p }, radius: 0 };
    for (let j = 0; j < i; j++) {
      const q = points[j];
      if (isPointInsideCircle(q, circle)) continue;

      circle = circleFromTwoPoints(p, q);
      for (let k = 0; k < j; k++) {
        const r = points[k];
        if (isPointInsideCircle(r, circle)) continue;

        const candidate = circleFromThreePoints(p, q, r);
        if (candidate) circle = candidate;
      }
    }
  }
  return circle;
}
