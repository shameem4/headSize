/**
 * Model Manager - handles MediaPipe model initialization
 * @module core/model-manager
 */

import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

/**
 * Manages MediaPipe model loading and inference
 */
export class ModelManager {
  /**
   * @param {Object} gestureRecognizer - MediaPipe gesture recognizer instance
   * @param {Object} faceLandmarker - MediaPipe face landmarker instance
   */
  constructor(gestureRecognizer, faceLandmarker) {
    this.gestureRecognizer = gestureRecognizer;
    this.faceLandmarker = faceLandmarker;
    this.lastVideoTime = -1;
    this.gestureResults = null;
    this.faceResults = null;
  }

  /**
   * Initialize MediaPipe models
   * @param {Object} config - Camera configuration object
   * @returns {Promise<ModelManager>} Initialized ModelManager instance
   */
  static async initialize(config) {
    const vision = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${config.mediaPipeVersion}/wasm`
    );

    const gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "GPU",
      },
      runningMode: config.runningMode,
      numHands: 2,
    });

    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: config.runningMode,
      numFaces: 1,
      refineLandmarks: true, // Enable iris landmarks (468-477)
    });

    return new ModelManager(gestureRecognizer, faceLandmarker);
  }

  /**
   * Process video frame and update detection results
   * @param {HTMLVideoElement} video - Video element to process
   * @returns {{gestureResults: Object|null, faceResults: Object|null}}
   */
  processFrame(video) {
    const nowInMs = Date.now();

    // Only process if video time has changed
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      this.gestureResults = this.gestureRecognizer.recognizeForVideo(video, nowInMs);
      this.faceResults = this.faceLandmarker.detectForVideo(video, nowInMs);
    }

    return {
      gestureResults: this.gestureResults,
      faceResults: this.faceResults,
    };
  }

  /**
   * Get gesture recognizer instance
   * @returns {Object}
   */
  getGestureRecognizer() {
    return this.gestureRecognizer;
  }

  /**
   * Get face landmarker instance
   * @returns {Object}
   */
  getFaceLandmarker() {
    return this.faceLandmarker;
  }

  /**
   * Get last processed results
   * @returns {{gestureResults: Object|null, faceResults: Object|null}}
   */
  getResults() {
    return {
      gestureResults: this.gestureResults,
      faceResults: this.faceResults,
    };
  }
}
