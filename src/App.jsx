import { Alert, Button, Container } from 'react-bootstrap'
import MeasurementStage from './components/MeasurementStage.jsx'
import InfoPanel from './components/InfoPanel.jsx'
import { useFaceMeasurement } from './hooks/useFaceMeasurement.js'
import './App.css'

function App() {
  const {
    videoRef,
    stageRef,
    isRunning,
    isInitializing,
    error,
    measurements,
    overlay,
    startCamera,
    stopCamera,
  } = useFaceMeasurement()

  return (
    <Container fluid className="app-shell">
      <div className="page">


        <section className="stage-section">
          <MeasurementStage
            isRunning={isRunning}
            isInitializing={isInitializing}
            onStart={startCamera}
            onStop={() => stopCamera()}
            videoRef={videoRef}
            stageRef={stageRef}
            measurements={measurements}
            overlay={overlay}
          />
          {error ? (
            <Alert variant="warning" className="inline-alert">
              {error}
            </Alert>
          ) : null}
        </section>

        <h2 className="brand">faceSize</h2>
            <p className="tagline">
              Real-time facial measurements using MediaPipe Tasks Vision. Mirror the camera feed, see
              the overlays, and capture consistent head-fit data.
            </p>
        <InfoPanel />


        <section className="footnote">
          <p className="note">
            Tip: grant camera permissions if you do not see a feed. All processing happens locally in
            your browser; nothing is uploaded.
          </p>
        </section>
      </div>
    </Container>
  )
}

export default App
