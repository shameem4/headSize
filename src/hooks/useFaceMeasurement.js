import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { computeFaceMeasurements } from '../lib/measurementProcessor'
import { MODEL_ASSET_PATHS, PROCESSING_CONFIG } from '../config/measurementConfig'

// const SMOOTHING_WINDOW = 60

const createKalmanFilter = ({ processNoise = 1, measurementNoise = 100 } = {}) => {
  let estimate = null
  let errorCovariance = 1

  const update = (measurement) => {
    if (!Number.isFinite(measurement)) return estimate

    if (estimate === null) {
      estimate = measurement
      errorCovariance = 1
      return estimate
    }

    errorCovariance += processNoise
    const gain = errorCovariance / (errorCovariance + measurementNoise)
    estimate = estimate + gain * (measurement - estimate)
    errorCovariance = (1 - gain) * errorCovariance
    return estimate
  }

  const reset = () => {
    estimate = null
    errorCovariance = 1
  }

  return { update, reset }
}

export function useFaceMeasurement(options = { autoStart: true }) {
  const { autoStart = true } = options

  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const poseLandmarkerRef = useRef(null)
  const loadPromiseRef = useRef(null)
  const animationFrameRef = useRef(null)
  const streamRef = useRef(null)
  const runningRef = useRef(false)
  const startingRef = useRef(false)
  const lastProcessRef = useRef(0)

  const TARGET_FRAME_INTERVAL_MS = 1000 / PROCESSING_CONFIG.targetFps

  const [status, setStatus] = useState('loading model…')
  const [isRunning, setIsRunning] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState('')
  const [measurements, setMeasurements] = useState(null)
  const [overlay, setOverlay] = useState(null)
  const filterRef = useRef(
    Object.fromEntries(
      Object.entries(PROCESSING_CONFIG.kalmanNoise).map(([key, noiseConfig]) => [
        key,
        createKalmanFilter(noiseConfig),
      ]),
    ),
  )
  const emaRef = useRef({
    ipdMM: null,
    faceBreadthMM: null,
    noseArchMM: null,
    flareDeg: null,
    distanceToCameraCM: null,
    eyeHeightLeftMM: null,
    eyeHeightRightMM: null,
    eyeHeightDeltaMM: null,
  })

  const stabiliseValue = (
    key,
    value,
    threshold = PROCESSING_CONFIG.smoothing.defaultThreshold,
  ) => {
    if (!Number.isFinite(value)) {
      emaRef.current[key] = null
      return null
    }

    const alpha = PROCESSING_CONFIG.smoothing.alpha
    const prev = emaRef.current[key]
    const next = prev == null ? value : prev + alpha * (value - prev)
    emaRef.current[key] = next

    if (prev != null && Math.abs(next - prev) < threshold) {
      return prev
    }

    return next
  }

  useEffect(() => {
    if (overlay) {
      // console.log('[FaceMeasurement] overlay update', overlay)
    }
  }, [overlay])

  const sizeToVideo = useCallback(() => {
    const video = videoRef.current
    const stage = stageRef.current

    if (!video || !stage) return

    const width = video.videoWidth || PROCESSING_CONFIG.fallbackVideoSize.width
    const height = video.videoHeight || PROCESSING_CONFIG.fallbackVideoSize.height

    stage.style.aspectRatio = `${width} / ${height}`
  }, [])

  const runDetection = useCallback(() => {
    if (!runningRef.current) return

    const video = videoRef.current
    const faceLandmarker = faceLandmarkerRef.current
    const poseLandmarker = poseLandmarkerRef.current

    if (!video || !faceLandmarker || !poseLandmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(runDetection)
      return
    }

    const now = performance.now()
    const elapsed = now - lastProcessRef.current
    if (elapsed < TARGET_FRAME_INTERVAL_MS) {
      animationFrameRef.current = requestAnimationFrame(runDetection)
      return
    }
    lastProcessRef.current = now
    const faceResults = faceLandmarker.detectForVideo(video, now)
    const poseResults = poseLandmarker.detectForVideo(video, now)
    const processed = computeFaceMeasurements(faceResults, video.videoWidth, video.videoHeight, {
      poseLandmarks: poseResults?.poseLandmarks,
    })

    if (processed?.metrics) {
      const { metrics } = processed
      const filters = filterRef.current

      const filtered = {
        ipdMM: Number.isFinite(metrics.ipdMM) ? filters.ipdMM.update(metrics.ipdMM) : null,
        faceBreadthMM: Number.isFinite(metrics.faceBreadthMM)
          ? filters.faceBreadthMM.update(metrics.faceBreadthMM)
          : null,
        noseArchMM: Number.isFinite(metrics.noseArchMM)
          ? filters.noseArchMM.update(metrics.noseArchMM)
          : null,
        flareDeg: Number.isFinite(metrics.flareDeg) ? filters.flareDeg.update(metrics.flareDeg) : null,
        distanceToCameraCM: Number.isFinite(metrics.distanceToCameraCM)
          ? filters.distanceToCameraCM.update(metrics.distanceToCameraCM)
          : null,
        eyeHeightLeftMM: Number.isFinite(metrics.eyeHeightLeftMM)
          ? filters.eyeHeightLeftMM.update(metrics.eyeHeightLeftMM)
          : null,
        eyeHeightRightMM: Number.isFinite(metrics.eyeHeightRightMM)
          ? filters.eyeHeightRightMM.update(metrics.eyeHeightRightMM)
          : null,
        eyeHeightDeltaMM: Number.isFinite(metrics.eyeHeightDeltaMM)
          ? filters.eyeHeightDeltaMM.update(metrics.eyeHeightDeltaMM)
          : null,
      }

      const stabilised = {
        ipdMM: stabiliseValue(
          'ipdMM',
          filtered.ipdMM,
          PROCESSING_CONFIG.smoothing.thresholds.ipdMM,
        ),
        faceBreadthMM: stabiliseValue(
          'faceBreadthMM',
          filtered.faceBreadthMM,
          PROCESSING_CONFIG.smoothing.thresholds.faceBreadthMM,
        ),
        noseArchMM: stabiliseValue(
          'noseArchMM',
          filtered.noseArchMM,
          PROCESSING_CONFIG.smoothing.thresholds.noseArchMM,
        ),
        flareDeg: stabiliseValue(
          'flareDeg',
          filtered.flareDeg,
          PROCESSING_CONFIG.smoothing.thresholds.flareDeg,
        ),
        distanceToCameraCM: stabiliseValue(
          'distanceToCameraCM',
          filtered.distanceToCameraCM,
          PROCESSING_CONFIG.smoothing.thresholds.distanceToCameraCM,
        ),
        eyeHeightLeftMM: stabiliseValue(
          'eyeHeightLeftMM',
          filtered.eyeHeightLeftMM,
          PROCESSING_CONFIG.smoothing.thresholds.eyeHeightLeftMM,
        ),
        eyeHeightRightMM: stabiliseValue(
          'eyeHeightRightMM',
          filtered.eyeHeightRightMM,
          PROCESSING_CONFIG.smoothing.thresholds.eyeHeightRightMM,
        ),
        eyeHeightDeltaMM: stabiliseValue(
          'eyeHeightDeltaMM',
          filtered.eyeHeightDeltaMM,
          PROCESSING_CONFIG.smoothing.thresholds.eyeHeightDeltaMM,
        ),
      }

      setMeasurements((prev) => {
        if (
          prev &&
          prev.ipdMM === stabilised.ipdMM &&
          prev.faceBreadthMM === stabilised.faceBreadthMM &&
          prev.noseArchMM === stabilised.noseArchMM &&
          prev.flareDeg === stabilised.flareDeg &&
          prev.distanceToCameraCM === stabilised.distanceToCameraCM &&
          prev.eyeHeightLeftMM === stabilised.eyeHeightLeftMM &&
          prev.eyeHeightRightMM === stabilised.eyeHeightRightMM &&
          prev.eyeHeightDeltaMM === stabilised.eyeHeightDeltaMM
        ) {
          return prev
        }
        return stabilised
      })
    } else {
      setMeasurements((prev) => (prev ? null : prev))
      Object.values(filterRef.current).forEach((filter) => filter.reset())
      Object.keys(emaRef.current).forEach((key) => {
        emaRef.current[key] = null
      })
    }

    setOverlay(processed?.overlay || null)

    animationFrameRef.current = requestAnimationFrame(runDetection)
  }, [TARGET_FRAME_INTERVAL_MS])

  const stopCamera = useCallback(
    (opts = { keepStatus: false }) => {
      const { keepStatus = false } = opts

      runningRef.current = false
      setIsRunning(false)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      window.removeEventListener('resize', sizeToVideo)

      if (!keepStatus) {
        setStatus('stopped')
      }
    },
    [sizeToVideo],
  )

  const loadModels = useCallback(() => {
    if (faceLandmarkerRef.current && poseLandmarkerRef.current) {
      return Promise.resolve({
        face: faceLandmarkerRef.current,
        pose: poseLandmarkerRef.current,
      })
    }

    if (loadPromiseRef.current) {
      return loadPromiseRef.current
    }

    const loader = (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(MODEL_ASSET_PATHS.wasm)
        const [faceLandmarker, poseLandmarker] = await Promise.all([
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_ASSET_PATHS.face },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          }),
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_ASSET_PATHS.pose },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
        ])
        faceLandmarkerRef.current = faceLandmarker
        poseLandmarkerRef.current = poseLandmarker
        setStatus('model ready')
        return { face: faceLandmarker, pose: poseLandmarker }
      } catch (err) {
        console.error(err)
        setStatus('failed to load model')
        setError(err instanceof Error ? err.message : 'Failed to load model')
        throw err
      } finally {
        loadPromiseRef.current = null
      }
    })()

    loadPromiseRef.current = loader
    return loader
  }, [])

  const startCamera = useCallback(async () => {
    if (runningRef.current || startingRef.current) return

    setError('')
    setIsInitializing(true)
    startingRef.current = true

    try {
      const models = await loadModels()
      if (!models?.face || !models?.pose) throw new Error('Vision models unavailable')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })

      const video = videoRef.current
      if (!video) throw new Error('Video element unavailable')

      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      if (video.readyState < 2) {
        await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }))
      }

      sizeToVideo()
      window.addEventListener('resize', sizeToVideo)

      runningRef.current = true
      setIsRunning(true)
      setStatus('running')

      animationFrameRef.current = requestAnimationFrame(runDetection)
    } catch (err) {
      console.error(err)
      stopCamera({ keepStatus: true })
      setStatus('camera error (check permissions)')
      setError(err instanceof Error ? err.message : 'Unable to access camera')
    } finally {
      setIsInitializing(false)
      startingRef.current = false
    }
  }, [loadModels, runDetection, sizeToVideo, stopCamera])

  useEffect(() => {
    loadModels().catch(() => {
      /* handled inside loadModels */
    })

    if (autoStart) {
      startCamera().catch(() => {
        /* handled inside startCamera */
      })
    }

    return () => {
      stopCamera({ keepStatus: true })
    }
  }, [autoStart, loadModels, startCamera, stopCamera])

  return {
    videoRef,
    stageRef,
    status,
    isRunning,
    isInitializing,
    error,
    measurements,
    overlay,
    startCamera,
    stopCamera,
  }
}
