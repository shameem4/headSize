import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Form } from 'react-bootstrap'
import { OVERLAY_METADATA } from '../config/measurementConfig'
import FaceOverlayHUD from './FaceOverlayHUD.jsx'
import EyeMagnifier from './EyeMagnifier.jsx'

const EMPTY_VALUE_PLACEHOLDER = '\u00A0\u00A0\u00A0\u00A0\u00A0'

const formatMeasurementValue = (value) => {
  if (!Number.isFinite(value)) {
    return EMPTY_VALUE_PLACEHOLDER
  }

  const str = Math.round(Number(value)).toString()
  return str.padStart(4, ' ')
}

function MeasurementStage({
  isRunning,
  isInitializing,
  onStart,
  onStop,
  videoRef,
  stageRef,
  measurements,
  overlay,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const panelRef = useRef(null)
  const dragState = useRef({ dragging: false, originX: 0, originY: 0, startX: 0, startY: 0 })
  const initializedRef = useRef(false)

  const clampPosition = useCallback((x, y) => {
    const panel = panelRef.current
    const stage = panel?.closest('.stage-card')
    if (!panel || !stage) return { x, y }

    const stageWidth = stage.clientWidth
    const stageHeight = stage.clientHeight
    const panelWidth = panel.offsetWidth
    const panelHeight = panel.offsetHeight

    const maxX = Math.max(16, stageWidth - panelWidth - 16)
    const maxY = Math.max(16, stageHeight - panelHeight - 16)

    return {
      x: Math.min(Math.max(x, 16), maxX),
      y: Math.min(Math.max(y, 16), maxY),
    }
  }, [])

  useEffect(() => {
    if (initializedRef.current) return
    const panel = panelRef.current
    const stage = panel?.closest('.stage-card')
    if (!panel || !stage) return

    const initialX = stage.clientWidth - panel.offsetWidth - 24
    const initialY = stage.clientHeight - panel.offsetHeight - 24
    setPos(clampPosition(initialX, initialY))
    initializedRef.current = true
  }, [clampPosition])

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!dragState.current.dragging) return
      const el = panelRef.current
      if (!el) return

      const deltaX = event.clientX - dragState.current.originX
      const deltaY = event.clientY - dragState.current.originY

      const targetX = dragState.current.startX + deltaX
      const targetY = dragState.current.startY + deltaY

      setPos(clampPosition(targetX, targetY))
    }

    const handleMouseUp = () => {
      dragState.current.dragging = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [clampPosition])

  const startDrag = useCallback(
    (event) => {
      if (
        event.target.closest('button') ||
        event.target.closest('input') ||
        event.target.closest('label')
      ) {
        return
      }
      const el = panelRef.current
      if (!el) return
      event.preventDefault()
      dragState.current = {
        dragging: true,
        originX: event.clientX,
        originY: event.clientY,
        startX: pos.x,
        startY: pos.y,
      }
    },
    [pos.x, pos.y],
  )

  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => clampPosition(prev.x, prev.y))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampPosition])

  useEffect(() => {
    setPos((prev) => clampPosition(prev.x, prev.y))
  }, [collapsed, clampPosition])

  const measurementItems = OVERLAY_METADATA.measurementItems
  const eyeRegionPx = overlay?.hud?.eyeRegionPx ?? null

  const captureChecked = isRunning || isInitializing
  const captureLabel = isInitializing ? 'Starting…' : captureChecked ? 'Capturing' : 'Paused'

  const handleCaptureToggle = useCallback(() => {
    if (isInitializing) return
    if (isRunning) {
      onStop()
    } else {
      onStart()
    }
  }, [isInitializing, isRunning, onStart, onStop])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  return (
    <Card className="stage-card border-0 text-white" ref={stageRef}>
      <Card.Body className="stage-body">
        <video ref={videoRef} className="video-layer" playsInline autoPlay muted />
        <div className="stage-overlay">
          <div className="hud-wrapper">
            <FaceOverlayHUD overlay={overlay} measurements={measurements} />
          </div>
          <EyeMagnifier
            videoRef={videoRef}
            region={eyeRegionPx}
            measurements={measurements}
          />
          <div
            ref={panelRef}
            className={`metrics-panel${collapsed ? ' collapsed' : ''}`}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            onMouseDown={startDrag}
          >
            <div className="metrics-body">
              {!collapsed ? (
                <ul className="metrics-list">
                  {measurementItems.map((item) => (
                    <li key={item.key} className="metrics-row">
                      <div className="metric-label">
                        <span className={`metric-dot ${item.colorClass}`} aria-hidden="true" />
                        <div className="metric-copy">
                          <span className="metric-title">{item.label}</span>
                        </div>
                      </div>
                      <span className="metric-value">
                        <span className="metric-value-number">
                          {formatMeasurementValue(measurements?.[item.key])}
                        </span>
                        <span className="metric-unit">{item.unit}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={`metrics-actions${collapsed ? ' compact' : ''}`}>
                {!collapsed ? (
                  <Form.Check
                    type="switch"
                    id="capture-toggle"
                    className="capture-toggle"
                    label={captureLabel}
                    checked={captureChecked}
                    disabled={isInitializing}
                    onChange={handleCaptureToggle}
                  />
                ) : null}
                <Button
                  className="control-button control-secondary"
                  variant="outline-light"
                  disabled={!isRunning}
                >
                  <span aria-hidden="true">⚙</span>
                  <span className="visually-hidden">Camera settings</span>
                </Button>
                <Button
                  className="control-button control-secondary"
                  variant="outline-light"
                  onClick={toggleCollapsed}
                >
                  <span aria-hidden="true">{collapsed ? '▣' : '▬'}</span>
                  <span className="visually-hidden">
                    {collapsed ? 'Expand measurements' : 'Collapse measurements'}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  )
}

export default MeasurementStage
