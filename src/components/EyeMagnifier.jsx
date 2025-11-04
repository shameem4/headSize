import { useEffect, useRef } from 'react'

function EyeMagnifier({ videoRef, region, measurements }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(0)

  useEffect(() => {
    if (!region) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = 0
      }
      return undefined
    }

    const draw = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!video || !canvas || !ctx || !region || video.readyState < 2) {
        frameRef.current = requestAnimationFrame(draw)
        return
      }

      const { x, y, width, height } = region
      if (width <= 0 || height <= 0) {
        frameRef.current = requestAnimationFrame(draw)
        return
      }

      const dpr = window.devicePixelRatio || 1
      const targetWidth = canvas.clientWidth * dpr
      const targetHeight = canvas.clientHeight * dpr
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }

      ctx.clearRect(0, 0, targetWidth, targetHeight)
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(
        video,
        x,
        y,
        width,
        height,
        -targetWidth,
        0,
        targetWidth,
        targetHeight,
      )
      ctx.restore()

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [videoRef, region])

  const eyeHeightLeft = measurements?.eyeHeightLeftMM
  const eyeHeightRight = measurements?.eyeHeightRightMM

  if (!region) {
    return null
  }

  return (
    <div className="eye-pip">
      <canvas ref={canvasRef} className="eye-pip-canvas" />
      <div className="eye-pip-overlay">
        <span className="eye-pip-title">Zoom</span>
        <span>SH L: {Number.isFinite(eyeHeightLeft) ? eyeHeightLeft.toFixed(1) : '—'} mm</span>
        <span>SH R: {Number.isFinite(eyeHeightRight) ? eyeHeightRight.toFixed(1) : '—'} mm</span>
      </div>
    </div>
  )
}

export default EyeMagnifier
