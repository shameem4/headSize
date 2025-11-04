import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { computeFaceMeasurements } from '../lib/measurementProcessor'

const WASM_ASSET_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export function useFaceMeasurement(options = { autoStart: true }) {
  const { autoStart = true } = options

  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const loadPromiseRef = useRef(null)
  const animationFrameRef = useRef(null)
  const streamRef = useRef(null)
  const runningRef = useRef(false)
  const startingRef = useRef(false)
  const lastProcessRef = useRef(0)

  const TARGET_FRAME_INTERVAL_MS = 1000 / 15 // ~15 FPS target for landmark processing

  const [status, setStatus] = useState('loading model…')
  const [isRunning, setIsRunning] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState('')
  const [measurements, setMeasurements] = useState(null)
  const [overlay, setOverlay] = useState(null)

  useEffect(() => {
    if (overlay) {
      // console.log('[FaceMeasurement] overlay update', overlay)
    }
  }, [overlay])

  const sizeToVideo = useCallback(() => {
    const video = videoRef.current
    const stage = stageRef.current

    if (!video || !stage) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    stage.style.aspectRatio = `${width} / ${height}`
  }, [])

  const runDetection = useCallback(() => {
    if (!runningRef.current) return

    const video = videoRef.current
    const faceLandmarker = faceLandmarkerRef.current

    if (!video || !faceLandmarker || video.readyState < 2) {
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
    const results = faceLandmarker.detectForVideo(video, now)
    const processed = computeFaceMeasurements(results, video.videoWidth, video.videoHeight)

    if (processed?.metrics) {
      const metrics = processed.metrics
      const rounded = {
        ipdMM: Number.isFinite(metrics.ipdMM) ? Number(metrics.ipdMM.toFixed(1)) : null,
        faceBreadthMM: Number.isFinite(metrics.faceBreadthMM)
          ? Number(metrics.faceBreadthMM.toFixed(1))
          : null,
        noseArchMM: Number.isFinite(metrics.noseArchMM)
          ? Number(metrics.noseArchMM.toFixed(1))
          : null,
        flareDeg: Number.isFinite(metrics.flareDeg) ? Number(metrics.flareDeg.toFixed(1)) : null,
      }
      setMeasurements((prev) => {
        if (
          prev &&
          prev.ipdMM === rounded.ipdMM &&
          prev.faceBreadthMM === rounded.faceBreadthMM &&
          prev.noseArchMM === rounded.noseArchMM &&
          prev.flareDeg === rounded.flareDeg
        ) {
          return prev
        }
        return rounded
      })
    } else {
      setMeasurements((prev) => (prev ? null : prev))
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

  const loadModel = useCallback(() => {
    if (faceLandmarkerRef.current) {
      return Promise.resolve(faceLandmarkerRef.current)
    }

    if (loadPromiseRef.current) {
      return loadPromiseRef.current
    }

    const loader = (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_ASSET_PATH)
        const faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_PATH },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        })
        faceLandmarkerRef.current = faceLandmarker
        setStatus('model ready')
        return faceLandmarker
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
      const faceLandmarker = await loadModel()
      if (!faceLandmarker) throw new Error('Face landmarker unavailable')

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
  }, [loadModel, runDetection, sizeToVideo, stopCamera])

  useEffect(() => {
    loadModel().catch(() => {
      /* handled inside loadModel */
    })

    if (autoStart) {
      startCamera().catch(() => {
        /* handled inside startCamera */
      })
    }

    return () => {
      stopCamera({ keepStatus: true })
    }
  }, [autoStart, loadModel, startCamera, stopCamera])

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
