import { FaceLandmarker } from '@mediapipe/tasks-vision'
import {
  OVERLAY_METADATA,
  OVERLAY_STYLE,
  REAL_IRIS_DIAMETER_MM,
  AVERAGE_PUPIL_DIAMETER_MM,
  DISTANCE_TO_CAMERA,
} from '../config/measurementConfig'

const {
  landmarkIndices: FACIAL_LANDMARK_INDICES,
  bodyLandmarkIndices: BODY_LANDMARK_INDICES,
  ids: OVERLAY_IDS,
} = OVERLAY_METADATA

const uniqueLandmarkIndexes = (connectors) => {
  const set = new Set()
  for (const segment of connectors) {
    set.add(segment.start)
    set.add(segment.end)
  }
  return [...set]
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
  return {
    x: sx / total,
    y: sy / total,
    z: sz / total,
  }
}

const irisWidthPx = (landmarks, indexes, width) => {
  let minX = Infinity
  let maxX = -Infinity
  for (const index of indexes) {
    const px = landmarks[index].x * width
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

const angleBetween2D = (u, v) => {
  const dot = u.x * v.x + u.y * v.y
  const cross = u.x * v.y - u.y * v.x
  return Math.atan2(Math.abs(cross), dot)
}

const toPixels = (landmark, width, height) => ({
  x: landmark.x * width,
  y: landmark.y * height,
})

const toClipSpace = ({ x, y }, width, height) => {
  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
    return null
  }

  return {
    x: (x / width) * 2 - 1,
    y: -((y / height) * 2 - 1),
    z: OVERLAY_STYLE.defaultDepth,
  }
}

const toPercentWidth = (px, width) => (width > 0 ? (px / width) * 100 : null)

export function computeFaceMeasurements(results, frameWidth, frameHeight, options = {}) {
  if (!results?.faceLandmarks?.length || !frameWidth || !frameHeight) {
    return null
  }

  const landmarks = results.faceLandmarks[0]
  if (!landmarks) return null
  const leftIrisIdx = uniqueLandmarkIndexes(FaceLandmarker?.FACE_LANDMARKS_LEFT_IRIS ?? [])
  const rightIrisIdx = uniqueLandmarkIndexes(FaceLandmarker?.FACE_LANDMARKS_RIGHT_IRIS ?? [])
  const leftEyeLidIdx = uniqueLandmarkIndexes(FaceLandmarker?.FACE_LANDMARKS_LEFT_EYE ?? [])
  const rightEyeLidIdx = uniqueLandmarkIndexes(FaceLandmarker?.FACE_LANDMARKS_RIGHT_EYE ?? [])

  const leftIrisCenter = center3D(landmarks, leftIrisIdx)
  const rightIrisCenter = center3D(landmarks, rightIrisIdx)
  const leftIrisPx = toPixels(leftIrisCenter, frameWidth, frameHeight)
  const rightIrisPx = toPixels(rightIrisCenter, frameWidth, frameHeight)
  const leftIrisClip = toClipSpace(leftIrisPx, frameWidth, frameHeight)
  const rightIrisClip = toClipSpace(rightIrisPx, frameWidth, frameHeight)

  const dxPx = rightIrisPx.x - leftIrisPx.x
  const dyPx = rightIrisPx.y - leftIrisPx.y
  const ipdPx = Math.hypot(dxPx, dyPx)

  const leftIrisWidth = irisWidthPx(landmarks, leftIrisIdx, frameWidth)
  const rightIrisWidth = irisWidthPx(landmarks, rightIrisIdx, frameWidth)
  const irisPx = leftIrisWidth && rightIrisWidth
    ? (leftIrisWidth + rightIrisWidth) / 2
    : leftIrisWidth || rightIrisWidth || 0
  const mmPerPx = irisPx > 0 ? REAL_IRIS_DIAMETER_MM / irisPx : 0
  const ipdMM = mmPerPx ? ipdPx * mmPerPx : 0
  const estimatePupilPx = (irisWidthPxValue) => {
    if (irisWidthPxValue && mmPerPx) {
      const px = AVERAGE_PUPIL_DIAMETER_MM / mmPerPx
      if (Number.isFinite(px) && px > 0) return px
    }
    return irisWidthPxValue ? irisWidthPxValue * 0.35 : null
  }
  const leftPupilPx = estimatePupilPx(leftIrisWidth)
  const rightPupilPx = estimatePupilPx(rightIrisWidth)

const computeEyeBounds = (indexes) => {
  if (!indexes?.length) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const index of indexes) {
    const landmark = landmarks[index]
    if (!landmark) continue
    const px = toPixels(landmark, frameWidth, frameHeight)
    if (px.x < minX) minX = px.x
    if (px.x > maxX) maxX = px.x
    if (px.y < minY) minY = px.y
    if (px.y > maxY) maxY = px.y
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY) ||
    maxY <= minY ||
    maxX <= minX
  ) {
    return null
  }
  return { minX, maxX, minY, maxY }
}

  const leftEyeBounds = computeEyeBounds(leftEyeLidIdx)
  const rightEyeBounds = computeEyeBounds(rightEyeLidIdx)
  const eyeHeightLeftPx = leftEyeBounds ? leftEyeBounds.maxY - leftEyeBounds.minY : null
  const eyeHeightRightPx = rightEyeBounds ? rightEyeBounds.maxY - rightEyeBounds.minY : null
  const eyeHeightLeftMM = eyeHeightLeftPx && mmPerPx ? eyeHeightLeftPx * mmPerPx : null
  const eyeHeightRightMM = eyeHeightRightPx && mmPerPx ? eyeHeightRightPx * mmPerPx : null
  const eyeHeightDeltaMM =
    Number.isFinite(eyeHeightLeftMM) && Number.isFinite(eyeHeightRightMM)
      ? eyeHeightRightMM - eyeHeightLeftMM
      : null
  const leftIrisDiameterPercent = Number.isFinite(leftIrisWidth)
    ? toPercentWidth(leftIrisWidth, frameWidth)
    : null
  const rightIrisDiameterPercent = Number.isFinite(rightIrisWidth)
    ? toPercentWidth(rightIrisWidth, frameWidth)
    : null
  const leftPupilDiameterPercent = Number.isFinite(leftPupilPx)
    ? toPercentWidth(leftPupilPx, frameWidth)
    : null
  const rightPupilDiameterPercent = Number.isFinite(rightPupilPx)
    ? toPercentWidth(rightPupilPx, frameWidth)
    : null

  const { poseLandmarks } = options ?? {}

  let distanceToCameraCM = null
  const { minReliableIpdPx, clampCm } = DISTANCE_TO_CAMERA
  const horizontalFovDegrees =
    typeof options?.horizontalFovDegrees === 'number'
      ? options.horizontalFovDegrees
      : DISTANCE_TO_CAMERA.horizontalFovDegrees
  if (
    mmPerPx > 0 &&
    Number.isFinite(horizontalFovDegrees) &&
    frameWidth > 0 &&
    ipdPx > (minReliableIpdPx ?? 0)
  ) {
    const fovRadians = (horizontalFovDegrees * Math.PI) / 180
    const focalPx = Math.tan(fovRadians / 2) > 0 ? (frameWidth / 2) / Math.tan(fovRadians / 2) : 0
    if (focalPx > 0) {
      const distanceMM = focalPx * mmPerPx
      if (Number.isFinite(distanceMM) && distanceMM > 0) {
        let cm = distanceMM / 10
        if (clampCm) {
          if (Number.isFinite(clampCm.min)) {
            cm = Math.max(clampCm.min, cm)
          }
          if (Number.isFinite(clampCm.max)) {
            cm = Math.min(clampCm.max, cm)
          }
        }
        distanceToCameraCM = cm
      }
    }
  }

  const {
    faceLeft: FACE_LEFT_INDEX,
    faceRight: FACE_RIGHT_INDEX,
    noseBridge: NOSE_BRIDGE_INDEX,
    noseTip: NOSE_TIP_INDEX,
    alareLeft: ALARE_LEFT_INDEX,
    alareRight: ALARE_RIGHT_INDEX,
  } = FACIAL_LANDMARK_INDICES

  const leftFacePoint = landmarks[FACE_LEFT_INDEX]
  const rightFacePoint = landmarks[FACE_RIGHT_INDEX]
  const leftFacePx = leftFacePoint ? toPixels(leftFacePoint, frameWidth, frameHeight) : null
  const rightFacePx = rightFacePoint ? toPixels(rightFacePoint, frameWidth, frameHeight) : null
  const faceBreadthPx = leftFacePx && rightFacePx ? rightFacePx.x - leftFacePx.x : 0
  const faceBreadthMM = mmPerPx ? faceBreadthPx * mmPerPx : 0

  const bridge = landmarks[NOSE_BRIDGE_INDEX]
  const noseTip = landmarks[NOSE_TIP_INDEX]
  const alareLeft = landmarks[ALARE_LEFT_INDEX]
  const alareRight = landmarks[ALARE_RIGHT_INDEX]

  const bridgePx = toPixels(bridge, frameWidth, frameHeight)
  const noseTipPx = toPixels(noseTip, frameWidth, frameHeight)
  const alareLeftPx = toPixels(alareLeft, frameWidth, frameHeight)
  const alareRightPx = toPixels(alareRight, frameWidth, frameHeight)

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

  const buildPoint = (point, color, id) => {
    if (!point) return null
    const clip = toClipSpace(point, frameWidth, frameHeight)
    if (!clip) return null
    return { id, color, position: clip }
  }

  const buildLine = (from, to, color, id) => {
    if (!from || !to) return null
    const clipFrom = toClipSpace(from, frameWidth, frameHeight)
    const clipTo = toClipSpace(to, frameWidth, frameHeight)
    if (!clipFrom || !clipTo) return null
    return { id, color, points: [clipFrom, clipTo] }
  }

  const overlayLines = [
    buildLine(leftIrisPx, rightIrisPx, OVERLAY_STYLE.colors.ipd, OVERLAY_IDS.lines.ipd),
    leftFacePx && rightFacePx
      ? buildLine(
          leftFacePx,
          rightFacePx,
          OVERLAY_STYLE.colors.faceBreadth,
          OVERLAY_IDS.lines.faceBreadth,
        )
      : null,
    buildLine(bridgePx, noseTipPx, OVERLAY_STYLE.colors.noseArch, OVERLAY_IDS.lines.noseArch),
    buildLine(noseTipPx, alareLeftPx, OVERLAY_STYLE.colors.nose, OVERLAY_IDS.lines.noseLeft),
    buildLine(noseTipPx, alareRightPx, OVERLAY_STYLE.colors.nose, OVERLAY_IDS.lines.noseRight),
  ].filter(Boolean)

  const overlayPoints = [
    buildPoint(leftIrisPx, OVERLAY_STYLE.colors.ipd, OVERLAY_IDS.points.irisLeft),
    buildPoint(rightIrisPx, OVERLAY_STYLE.colors.ipd, OVERLAY_IDS.points.irisRight),
    leftFacePx
      ? buildPoint(leftFacePx, OVERLAY_STYLE.colors.faceBreadth, OVERLAY_IDS.points.faceLeft)
      : null,
    rightFacePx
      ? buildPoint(rightFacePx, OVERLAY_STYLE.colors.faceBreadth, OVERLAY_IDS.points.faceRight)
      : null,
    buildPoint(bridgePx, OVERLAY_STYLE.colors.noseArch, OVERLAY_IDS.points.bridge),
    buildPoint(noseTipPx, OVERLAY_STYLE.colors.noseArch, OVERLAY_IDS.points.noseTip),
    buildPoint(alareLeftPx, OVERLAY_STYLE.colors.nose, OVERLAY_IDS.points.alareLeft),
    buildPoint(alareRightPx, OVERLAY_STYLE.colors.nose, OVERLAY_IDS.points.alareRight),
  ].filter(Boolean)

  const leftEyeTopClip = leftEyeBounds && leftIrisPx
    ? toClipSpace({ x: leftIrisPx.x, y: leftEyeBounds.minY }, frameWidth, frameHeight)
    : null
  const leftEyeBottomClip = leftEyeBounds && leftIrisPx
    ? toClipSpace({ x: leftIrisPx.x, y: leftEyeBounds.maxY }, frameWidth, frameHeight)
    : null
  const rightEyeTopClip = rightEyeBounds && rightIrisPx
    ? toClipSpace({ x: rightIrisPx.x, y: rightEyeBounds.minY }, frameWidth, frameHeight)
    : null
  const rightEyeBottomClip = rightEyeBounds && rightIrisPx
    ? toClipSpace({ x: rightIrisPx.x, y: rightEyeBounds.maxY }, frameWidth, frameHeight)
    : null

  const overlayHud = {
    leftEye:
      leftIrisClip && leftEyeTopClip && leftEyeBottomClip
        ? {
            iris: leftIrisClip,
            top: leftEyeTopClip,
            bottom: leftEyeBottomClip,
            irisDiameterPercent: leftIrisDiameterPercent,
            pupilDiameterPercent: leftPupilDiameterPercent,
          }
        : null,
    rightEye:
      rightIrisClip && rightEyeTopClip && rightEyeBottomClip
        ? {
            iris: rightIrisClip,
            top: rightEyeTopClip,
            bottom: rightEyeBottomClip,
            irisDiameterPercent: rightIrisDiameterPercent,
            pupilDiameterPercent: rightPupilDiameterPercent,
          }
        : null,
    textAnchor:
      leftIrisClip && rightIrisClip
        ? {
            x: (leftIrisClip.x + rightIrisClip.x) / 2,
            y: Math.min(leftIrisClip.y ?? 0, rightIrisClip.y ?? 0) - 0.15,
          }
        : null,
  }

  if (overlayHud.textAnchor) {
    overlayHud.textAnchor.y = Math.min(0.95, Math.max(-0.95, overlayHud.textAnchor.y))
  }

  if (leftEyeBounds || rightEyeBounds) {
    const minX = Math.max(
      0,
      Math.min(
        leftEyeBounds?.minX ?? Infinity,
        rightEyeBounds?.minX ?? Infinity,
        leftIrisPx?.x ?? Infinity,
        rightIrisPx?.x ?? Infinity,
      ),
    )
    const maxX = Math.min(
      frameWidth,
      Math.max(
        leftEyeBounds?.maxX ?? -Infinity,
        rightEyeBounds?.maxX ?? -Infinity,
        leftIrisPx?.x ?? -Infinity,
        rightIrisPx?.x ?? -Infinity,
      ),
    )
    const minY = Math.max(
      0,
      Math.min(leftEyeBounds?.minY ?? Infinity, rightEyeBounds?.minY ?? Infinity),
    )
    const maxY = Math.min(
      frameHeight,
      Math.max(leftEyeBounds?.maxY ?? -Infinity, rightEyeBounds?.maxY ?? -Infinity),
    )
    if (maxX > minX && maxY > minY) {
      const marginX = Math.min(60, (maxX - minX) * 0.45)
      const marginY = Math.min(50, (maxY - minY) * 0.9)
      const regionX = Math.max(0, minX - marginX)
      const regionY = Math.max(0, minY - marginY)
      const regionWidth = Math.min(frameWidth - regionX, maxX - minX + marginX * 2)
      const regionHeight = Math.min(frameHeight - regionY, maxY - minY + marginY * 2)
      if (regionWidth > 10 && regionHeight > 10) {
        overlayHud.eyeRegionPx = {
          x: regionX,
          y: regionY,
          width: regionWidth,
          height: regionHeight,
        }
      }
    }
  }

  if (poseLandmarks?.length) {
    const pose = poseLandmarks[0]
    const visibilityThreshold = 0.3
    const resolveLandmark = (index) => {
      const landmark = pose?.[index]
      if (!landmark) return null
      if (Number.isFinite(landmark.visibility) && landmark.visibility < visibilityThreshold) {
        return null
      }
      return landmark
    }

    const leftShoulder = resolveLandmark(BODY_LANDMARK_INDICES.leftShoulder)
    const rightShoulder = resolveLandmark(BODY_LANDMARK_INDICES.rightShoulder)
    const leftElbow = resolveLandmark(BODY_LANDMARK_INDICES.leftElbow)
    const rightElbow = resolveLandmark(BODY_LANDMARK_INDICES.rightElbow)
    const leftWrist = resolveLandmark(BODY_LANDMARK_INDICES.leftWrist)
    const rightWrist = resolveLandmark(BODY_LANDMARK_INDICES.rightWrist)
    const leftHip = resolveLandmark(BODY_LANDMARK_INDICES.leftHip)
    const rightHip = resolveLandmark(BODY_LANDMARK_INDICES.rightHip)

    const leftShoulderPx = leftShoulder ? toPixels(leftShoulder, frameWidth, frameHeight) : null
    const rightShoulderPx = rightShoulder ? toPixels(rightShoulder, frameWidth, frameHeight) : null
    const leftElbowPx = leftElbow ? toPixels(leftElbow, frameWidth, frameHeight) : null
    const rightElbowPx = rightElbow ? toPixels(rightElbow, frameWidth, frameHeight) : null
    const leftWristPx = leftWrist ? toPixels(leftWrist, frameWidth, frameHeight) : null
    const rightWristPx = rightWrist ? toPixels(rightWrist, frameWidth, frameHeight) : null
    const leftHipPx = leftHip ? toPixels(leftHip, frameWidth, frameHeight) : null
    const rightHipPx = rightHip ? toPixels(rightHip, frameWidth, frameHeight) : null

    overlayPoints.push(
      buildPoint(leftShoulderPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.leftShoulder),
      buildPoint(rightShoulderPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.rightShoulder),
      buildPoint(leftElbowPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.leftElbow),
      buildPoint(rightElbowPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.rightElbow),
      buildPoint(leftWristPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.leftWrist),
      buildPoint(rightWristPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.rightWrist),
      buildPoint(leftHipPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.leftHip),
      buildPoint(rightHipPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.points.rightHip),
    )

    overlayLines.push(
      buildLine(leftShoulderPx, rightShoulderPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.shoulders),
      buildLine(leftShoulderPx, leftElbowPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.leftUpperArm),
      buildLine(leftElbowPx, leftWristPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.leftLowerArm),
      buildLine(rightShoulderPx, rightElbowPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.rightUpperArm),
      buildLine(rightElbowPx, rightWristPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.rightLowerArm),
      buildLine(leftShoulderPx, leftHipPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.leftTorso),
      buildLine(rightShoulderPx, rightHipPx, OVERLAY_STYLE.colors.body, OVERLAY_IDS.lines.rightTorso),
    )
  }

  const overlay = {
    lines: overlayLines.filter(Boolean),
    points: overlayPoints.filter(Boolean),
    hud: overlayHud,
  }

  const metrics = {
    ipdMM,
    faceBreadthMM,
    noseArchMM,
    flareDeg,
    distanceToCameraCM,
    eyeHeightLeftMM,
    eyeHeightRightMM,
    eyeHeightDeltaMM,
  }

  return { metrics, overlay }
}
