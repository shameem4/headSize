import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { drawFaceMeasurements } from '../lib/drawFaceMeasurements'

const WASM_ASSET_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export function useFaceMeasurement(options = { autoStart: true }) {
  const { autoStart = true } = options

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const ctxRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const streamRef = useRef(null)
  const runningRef = useRef(false)

  const [status, setStatus] = useState('loading model…')
  const [isRunning, setIsRunning] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ctxRef.current && canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d')
    }
  }, [])

  const sizeToVideo = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    const ctx = ctxRef.current

    if (!video || !canvas || !stage || !ctx) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    stage.style.aspectRatio = `${width} / ${height}`
    canvas.width = width
    canvas.height = height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [])

  const runDetection = useCallback(() => {
    if (!runningRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    const faceLandmarker = faceLandmarkerRef.current

    if (!video || !canvas || !ctx || !faceLandmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(runDetection)
      return
    }

    const now = performance.now()
    const results = faceLandmarker.detectForVideo(video, now)
    drawFaceMeasurements(ctx, canvas, results)

    animationFrameRef.current = requestAnimationFrame(runDetection)
  }, [])

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

      if (ctxRef.current && canvasRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }

      if (!keepStatus) {
        setStatus('stopped')
      }
    },
    [sizeToVideo],
  )

  const loadModel = useCallback(async () => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current

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
    }
  }, [])

  const startCamera = useCallback(async () => {
    if (runningRef.current) return

    setError('')
    setIsInitializing(true)

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
    canvasRef,
    stageRef,
    status,
    isRunning,
    isInitializing,
    error,
    startCamera,
    stopCamera,
  }
}
