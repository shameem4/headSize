const clipToPercentX = (clipX) => {
  const normalized = (clipX + 1) / 2
  const percent = normalized * 100
  return 100 - percent
}
const clipToPercentY = (clipY) => ((1 - clipY) / 2) * 100

const formatNumber = (value, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : null

const formatWithUnit = (value, unit, digits = 1) => {
  const formatted = formatNumber(value, digits)
  return formatted ? `${formatted} ${unit}` : '—'
}

function FaceOverlayHUD({ overlay, measurements }) {
  const hud = overlay?.hud
  if (!hud?.leftEye || !hud?.rightEye) {
    return null
  }

  const leftEye = hud.leftEye
  const rightEye = hud.rightEye

  const leftEyeX = clipToPercentX(leftEye.iris.x)
  const rightEyeX = clipToPercentX(rightEye.iris.x)
  const pdY = clipToPercentY((leftEye.iris.y + rightEye.iris.y) / 2)

  const leftEyeTop = clipToPercentY(leftEye.top.y)
  const leftEyeBottom = clipToPercentY(leftEye.bottom.y)
  const rightEyeTop = clipToPercentY(rightEye.top.y)
  const rightEyeBottom = clipToPercentY(rightEye.bottom.y)
  const leftEyeCenter = (leftEyeTop + leftEyeBottom) / 2
  const rightEyeCenter = (rightEyeTop + rightEyeBottom) / 2
  const leftEyeHeight = Math.max(0, Math.abs(leftEyeBottom - leftEyeTop))
  const rightEyeHeight = Math.max(0, Math.abs(rightEyeBottom - rightEyeTop))
  const computeCircleSize = (heightPercent) => {
    if (!Number.isFinite(heightPercent) || heightPercent <= 0) return 4
    const scaled = heightPercent * 1.25
    return Math.max(3.5, Math.min(9, scaled))
  }
  const fallbackLeftCircle = computeCircleSize(leftEyeHeight)
  const fallbackRightCircle = computeCircleSize(rightEyeHeight)
  const leftCircleSize = Number.isFinite(leftEye.irisDiameterPercent)
    ? Math.max(3.5, Math.min(12, leftEye.irisDiameterPercent * 1.05))
    : fallbackLeftCircle
  const rightCircleSize = Number.isFinite(rightEye.irisDiameterPercent)
    ? Math.max(3.5, Math.min(12, rightEye.irisDiameterPercent * 1.05))
    : fallbackRightCircle
  const leftPupilSize = Number.isFinite(leftEye.pupilDiameterPercent)
    ? Math.max(2, Math.min(leftCircleSize * 0.9, leftEye.pupilDiameterPercent * 1.05))
    : Math.max(2, leftCircleSize * 0.35)
  const rightPupilSize = Number.isFinite(rightEye.pupilDiameterPercent)
    ? Math.max(2, Math.min(rightCircleSize * 0.9, rightEye.pupilDiameterPercent * 1.05))
    : Math.max(2, rightCircleSize * 0.35)

  const textAnchor = hud.textAnchor
    ? {
        left: clipToPercentX(hud.textAnchor.x),
        top: clipToPercentY(hud.textAnchor.y),
      }
    : null

  const farPd = measurements?.ipdMM ?? null
  const faceWidth = measurements?.faceBreadthMM ?? null
  const distanceToCamera = measurements?.distanceToCameraCM ?? null
  const nearPd = farPd && distanceToCamera
    ? Math.max(0, farPd * ((distanceToCamera - 4) / distanceToCamera))
    : farPd ?? null

  const textLines = [
    `Far PD: ${formatWithUnit(farPd, 'mm')}`,
    `Near PD: ${formatWithUnit(nearPd, 'mm')}`,
    `Face Width: ${formatWithUnit(faceWidth, 'mm')}`,
    distanceToCamera ? `Camera Dist: ${formatWithUnit(distanceToCamera, 'cm')}` : null,
  ].filter(Boolean)

  return (
    <div className="hud-overlay">
      <div
        className="hud-pd-line"
        style={{
          left: `${Math.min(leftEyeX, rightEyeX)}%`,
          width: `${Math.abs(rightEyeX - leftEyeX)}%`,
          top: `${pdY}%`,
        }}
      >
        <span className="hud-pd-label">{formatWithUnit(farPd, 'mm')}</span>
      </div>
      <div
        className="hud-eye-circle"
        style={{
          left: `${leftEyeX}%`,
          top: `${leftEyeCenter}%`,
          width: `${leftCircleSize}%`,
          height: `${leftCircleSize}%`,
        }}
      >
        <span
          className="hud-eye-pupil"
          style={{ width: `${leftPupilSize}%`, height: `${leftPupilSize}%` }}
        />
      </div>
      <div
        className="hud-eye-circle"
        style={{
          left: `${rightEyeX}%`,
          top: `${rightEyeCenter}%`,
          width: `${rightCircleSize}%`,
          height: `${rightCircleSize}%`,
        }}
      >
        <span
          className="hud-eye-pupil"
          style={{ width: `${rightPupilSize}%`, height: `${rightPupilSize}%` }}
        />
      </div>
      {textAnchor ? (
        <div
          className="hud-text-stack"
          style={{ left: `${textAnchor.left}%`, top: `${textAnchor.top}%` }}
        >
          {textLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default FaceOverlayHUD
