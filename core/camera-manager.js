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
  }

  /**
   * Find the best front-facing camera (prioritizes wide-angle front cameras)
   * Uses camera priorities from centralized config
   * @returns {Promise<string|null>} Device ID of preferred camera or null
   */
  async findBestFrontCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");

      if (videoDevices.length === 0) return null;

      const priorities = this.config.cameraPreferences.priorities;

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
   */
  async initialize() {
    // Try to find the best front-facing camera
    const deviceId = await this.findBestFrontCamera();

    const facingMode = this.config.cameraPreferences.facingMode;

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
            facingMode: facingMode,
            resizeMode: "none",
          },
    };

    this.video.srcObject = await navigator.mediaDevices.getUserMedia(constraints);
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
   * Apply mirroring to landmarks if enabled
   * @param {Array} landmarks - Original landmarks
   * @returns {Array} Mirrored landmarks if enabled, otherwise original
   */
  applyMirrorIfEnabled(landmarks) {
    return this.mirrorEnabled ? this.mirrorLandmarks(landmarks) : landmarks;
  }
}
