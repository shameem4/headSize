import { FaceLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'

const REAL_IRIS_DIAMETER_MM = 11.7

const uniqueLandmarkIndexes = (connectors) => {
  const set = new Set()
  for (const segment of connectors) {
    set.add(segment.start)
    set.add(segment.end)
  }
  return [...set]
}

const toPixels = (landmark, canvas) => ({
  x: landmark.x * canvas.width,
  y: landmark.y * canvas.height,
})

const irisWidthPx = (landmarks, indexes, canvas) => {
  let minX = Infinity
  let maxX = -Infinity
  for (const index of indexes) {
    const px = landmarks[index].x * canvas.width
    if (px < minX) minX = px
    if (px > maxX) maxX = px
  }
  return Math.max(0, maxX - minX)
}

const irisWidthNorm = (landmarks, indexes) => {
  let minX = Infinity
  let maxX = -Infinity
  for (const index of indexes) {
    const x = landmarks[index].x
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  return Math.max(0, maxX - minX)
}

const center3D = (landmarks, indexes) => {
  let sx = 0
  let sy = 0
  let sz = 0
  const total = Math.max(1, indexes.length)
  for (const index of indexes) {
    sx += landmarks[index].x
    sy += landmarks[index].y
    sz += landmarks[index].z
  }
  return { x: sx / total, y: sy / total, z: sz / total }
}

const angleBetween2D = (u, v) => {
  const dot = u.x * v.x + u.y * v.y
  const cross = u.x * v.y - u.y * v.x
  return Math.atan2(Math.abs(cross), dot)
}

export function drawFaceMeasurements(ctx, canvas, results) {
  if (!ctx || !canvas) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!results?.faceLandmarks?.length) return

  const drawingUtils = new DrawingUtils(ctx)

  for (const landmarks of results.faceLandmarks) {
    const leftIrisIdx = uniqueLandmarkIndexes(FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS)
    const rightIrisIdx = uniqueLandmarkIndexes(FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS)

    const leftIrisCenter = center3D(landmarks, leftIrisIdx)
    const rightIrisCenter = center3D(landmarks, rightIrisIdx)
    const leftIrisPx = toPixels(leftIrisCenter, canvas)
    const rightIrisPx = toPixels(rightIrisCenter, canvas)

    const dxPx = rightIrisPx.x - leftIrisPx.x
    const dyPx = rightIrisPx.y - leftIrisPx.y
    const ipdPx = Math.hypot(dxPx, dyPx)

    const leftIrisWidth = irisWidthPx(landmarks, leftIrisIdx, canvas)
    const rightIrisWidth = irisWidthPx(landmarks, rightIrisIdx, canvas)
    const irisPx = leftIrisWidth && rightIrisWidth
      ? (leftIrisWidth + rightIrisWidth) / 2
      : leftIrisWidth || rightIrisWidth || 0
    const mmPerPx = irisPx > 0 ? REAL_IRIS_DIAMETER_MM / irisPx : 0
    const ipdMM = mmPerPx ? ipdPx * mmPerPx : 0

    const leftFacePoint = landmarks[127]
    const rightFacePoint = landmarks[356]
    const faceBreadthPx = leftFacePoint && rightFacePoint
      ? (rightFacePoint.x - leftFacePoint.x) * canvas.width
      : 0
    const faceBreadthMM = mmPerPx ? faceBreadthPx * mmPerPx : 0
    const leftFacePx = leftFacePoint ? toPixels(leftFacePoint, canvas) : null
    const rightFacePx = rightFacePoint ? toPixels(rightFacePoint, canvas) : null

    const bridge = landmarks[6]
    const bridgePx = toPixels(bridge, canvas)
    const noseTip = landmarks[4]
    const noseTipPx = toPixels(noseTip, canvas)
    const alareLeft = landmarks[64]
    const alareLeftPx = toPixels(alareLeft, canvas)
    const alareRight = landmarks[294]
    const alareRightPx = toPixels(alareRight, canvas)

    const deltaZ = noseTip.z - bridge.z
    const irisNormWidth = irisWidthNorm(landmarks, leftIrisIdx)
    const mmPerNorm = irisNormWidth > 0 ? REAL_IRIS_DIAMETER_MM / irisNormWidth : 0
    const noseArchMM = mmPerNorm ? Math.abs(deltaZ) * mmPerNorm : 0

    const vectorLeft = {
      x: alareLeftPx.x - noseTipPx.x,
      y: alareLeftPx.y - noseTipPx.y,
    }
    const vectorRight = {
      x: alareRightPx.x - noseTipPx.x,
      y: alareRightPx.y - noseTipPx.y,
    }
    const flareDeg = (angleBetween2D(vectorLeft, vectorRight) * 180) / Math.PI

    ctx.save()
    ctx.scale(-1, 1)
    ctx.fillStyle = 'red'
    ctx.font = '30px Arial'
    ctx.fillText(`IPD≈ ${ipdMM.toFixed(1)} mm`, -canvas.width * 0.75, canvas.height - 170)
    ctx.fillStyle = 'green'
    ctx.fillText(`Face breadth≈ ${faceBreadthMM.toFixed(1)} mm`, -canvas.width * 0.75, canvas.height - 130)
    ctx.fillStyle = 'blue'
    ctx.fillText(`Nose arch height≈ ${noseArchMM.toFixed(1)} mm`, -canvas.width * 0.75, canvas.height - 90)
    ctx.fillStyle = 'orange'
    ctx.fillText(`Nose angle≈ ${flareDeg.toFixed(1)} deg`, -canvas.width * 0.75, canvas.height - 50)
    ctx.restore()

    ctx.fillStyle = 'red'
    ctx.strokeStyle = 'red'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(leftIrisPx.x, leftIrisPx.y)
    ctx.lineTo(rightIrisPx.x, rightIrisPx.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(leftIrisPx.x, leftIrisPx.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(rightIrisPx.x, rightIrisPx.y, 4, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'green'
    ctx.strokeStyle = 'green'
    ctx.lineWidth = 1
    if (leftFacePx && rightFacePx) {
      ctx.beginPath()
      ctx.moveTo(leftFacePx.x, leftFacePx.y)
      ctx.lineTo(rightFacePx.x, rightFacePx.y)
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(leftFacePx.x, leftFacePx.y, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(rightFacePx.x, rightFacePx.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'blue'
    ctx.strokeStyle = 'blue'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(bridgePx.x, bridgePx.y)
    ctx.lineTo(noseTipPx.x, noseTipPx.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(bridgePx.x, bridgePx.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(noseTipPx.x, noseTipPx.y, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'orange'
    ctx.beginPath()
    ctx.arc(alareLeftPx.x, alareLeftPx.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(alareRightPx.x, alareRightPx.y, 3, 0, Math.PI * 2)
    ctx.fill()

    const angleLeft = Math.atan2(vectorLeft.y, vectorLeft.x)
    const angleRight = Math.atan2(vectorRight.y, vectorRight.x)
    const radius = Math.max(
      20,
      Math.min(
        80,
        Math.min(Math.hypot(vectorLeft.x, vectorLeft.y), Math.hypot(vectorRight.x, vectorRight.y)) * 0.35,
      ),
    )
    const delta = ((angleRight - angleLeft + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    ctx.beginPath()
    ctx.arc(noseTipPx.x, noseTipPx.y, radius, angleLeft, angleRight, delta < 0)
    ctx.strokeStyle = 'orange'
    ctx.lineWidth = 2
    ctx.stroke()

    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      { lineWidth: 1.5 },
    )
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      { lineWidth: 1.5 },
    )
  }
}
