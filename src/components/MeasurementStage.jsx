import { Badge, Button, Card } from 'react-bootstrap'

function MeasurementStage({
  status,
  isRunning,
  isInitializing,
  onStart,
  onStop,
  videoRef,
  canvasRef,
  stageRef,
}) {
  return (
    <Card className="stage-card border-0 text-white" ref={stageRef}>
      <Card.Body className="stage-body">
        <video ref={videoRef} className="video-layer" playsInline autoPlay muted />
        <canvas ref={canvasRef} className="canvas-layer" />
        <Badge bg="dark" className="status-badge">
          {status}
        </Badge>
        <div className="hud">
          <Button variant="primary" onClick={onStart} disabled={isRunning || isInitializing}>
            {isInitializing ? 'Starting…' : 'Start camera'}
          </Button>
          <Button variant="outline-light" onClick={onStop} disabled={!isRunning}>
            Stop
          </Button>
        </div>
      </Card.Body>
    </Card>
  )
}

export default MeasurementStage
