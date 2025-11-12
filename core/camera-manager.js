/**
 * Camera Manager - handles webcam access and video mirroring
 * @module core/camera-manager
 */

/**
 * Manages camera access and video stream operations
 */
export class CameraManager {
  /**
   * @param {HTMLVideoElement} videoElement - Video element for camera feed
   * @param {Object} config - Camera configuration
   */
  constructor(videoElement, config) {
    this.video = videoElement;
    this.config = config;
    this.mirrorEnabled = true;
    this.mediaStream = null;
  }

  /**
   * Find the best front-facing camera (prioritizes wide-angle front cameras)
   * @returns {Promise<string|null>} Device ID of preferred camera or null
   */
  async findBestFrontCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");

      if (videoDevices.length === 0) return null;

      // Priority order for camera selection
      const priorities = [
        /front.*wide/i,      // "Front Wide" camera (iPhone, etc.)
        /wide.*front/i,      // Alternative naming
        /front/i,            // Any front camera
        /user/i,             // User-facing camera
      ];

      // Try each priority pattern
      for (const pattern of priorities) {
        const match = videoDevices.find((device) => pattern.test(device.label));
        if (match) {
          console.log(`Selected camera: ${match.label}`);
          return match.deviceId;
        }
      }

      // Fallback: return first video device
      console.log(`Using default camera: ${videoDevices[0].label}`);
      return videoDevices[0].deviceId;
    } catch (error) {
      console.warn("Could not enumerate devices:", error);
      return null;
    }
  }

  /**
   * Initialize camera and request user media
   * @returns {Promise<MediaStream>}
   */
  async initialize() {
    // Try to find the best front-facing camera
    const deviceId = await this.findBestFrontCamera();

    const constraints = {
      audio: false,
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: this.config.videoSize.width,
            height: this.config.videoSize.height,
            resizeMode: "none",
          }
        : {
            width: this.config.videoSize.width,
            height: this.config.videoSize.height,
            facingMode: "user", // Changed from "environment" to "user" for front camera
            resizeMode: "none",
          },
    };

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.mediaStream;

    return this.mediaStream;
  }

  /**
   * Mirror landmarks horizontally (flip x-coordinates)
   * @param {Array} landmarks - MediaPipe landmarks array
   * @returns {Array|null} Mirrored landmarks or null if invalid input
   */
  mirrorLandmarks(landmarks) {
    if (!Array.isArray(landmarks)) return null;
    return landmarks.map((lm) => {
      if (!lm) return lm;
      const mirroredX = Number.isFinite(lm.x) ? 1 - lm.x : lm.x;
      return { ...lm, x: mirroredX };
    });
  }

  /**
   * Set mirror enabled state
   * @param {boolean} enabled - Whether mirroring is enabled
   */
  setMirrorEnabled(enabled) {
    this.mirrorEnabled = Boolean(enabled);
  }

  /**
   * Get current mirror state
   * @returns {boolean} True if mirroring is enabled
   */
  isMirrorEnabled() {
    return this.mirrorEnabled;
  }

  /**
   * Apply mirroring to landmarks if enabled
   * @param {Array} landmarks - Original landmarks
   * @returns {Array} Mirrored landmarks if enabled, otherwise original
   */
  applyMirrorIfEnabled(landmarks) {
    return this.mirrorEnabled ? this.mirrorLandmarks(landmarks) : landmarks;
  }

  /**
   * Stop camera stream
   */
  stop() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * Get video element
   * @returns {HTMLVideoElement}
   */
  getVideoElement() {
    return this.video;
  }
}
