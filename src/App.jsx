import { Alert, Container } from 'react-bootstrap'
import MeasurementStage from './components/MeasurementStage.jsx'
import { useFaceMeasurement } from './hooks/useFaceMeasurement.js'
import './App.css'

function App() {
  const {
    videoRef,
    canvasRef,
    stageRef,
    status,
    isRunning,
    isInitializing,
    error,
    startCamera,
    stopCamera,
  } = useFaceMeasurement()

  return (
    <Container fluid className="app-shell">
      <div className="content-wrap">
        <h1 className="app-title">headSize</h1>
        <MeasurementStage
          status={status}
          isRunning={isRunning}
          isInitializing={isInitializing}
          onStart={startCamera}
          onStop={() => stopCamera()}
          videoRef={videoRef}
          canvasRef={canvasRef}
          stageRef={stageRef}
        />
        {error ? (
          <Alert variant="warning" className="error-alert">
            {error}
          </Alert>
        ) : null}
        <p className="note">
          Tip: If nothing appears, ensure camera permissions are granted. Everything runs locally in
          your browser.
        </p>
      </div>
    </Container>
  )
}

export default App
