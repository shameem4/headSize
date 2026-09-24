/**
 * Model Manager - handles MediaPipe model initialization
 * @module core/model-manager
 */

import {
  FilesetResolver,
  FaceLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

/**
 * Manages MediaPipe model loading and inference
 */
export class ModelManager {
  /**
   * @param {Object} faceLandmarker - MediaPipe face landmarker instance
   */
  constructor(faceLandmarker) {
    this.faceLandmarker = faceLandmarker;
    this.lastVideoTime = -1;
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

    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: config.runningMode,
      numFaces: 1,
    });

    return new ModelManager(faceLandmarker);
  }

  /**
   * Process video frame and update detection results
   * @param {HTMLVideoElement} video - Video element to process
   * @returns {{faceResults: Object|null}}
   */
  processFrame(video) {
    // Only process if video time has changed
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      this.faceResults = this.faceLandmarker.detectForVideo(video, Date.now());
    }

    return { faceResults: this.faceResults };
  }
}
