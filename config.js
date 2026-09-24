/**
 * Centralized Configuration for headSize Application
 * @module config
 */

// ============================================================================
// CAMERA & VIDEO SETTINGS
// ============================================================================

/**
 * Camera and MediaPipe configuration
 */
export const CAMERA_CONFIG = {
  // MediaPipe version
  mediaPipeVersion: "0.10.0",
  runningMode: "VIDEO",

  // Video resolution
  videoSize: {
    width: 1280,
    height: 720,
  },

  // Camera selection preferences
  cameraPreferences: {
    // Priority order for camera selection (regex patterns)
    priorities: [
      /front.*wide/i,      // "Front Wide" camera (iPhone, etc.)
      /wide.*front/i,      // Alternative naming
      /front/i,            // Any front camera
      /user/i,             // User-facing camera
    ],
    facingMode: "user",    // Fallback: "user" (front) or "environment" (rear)
  },

  // Physical measurements
  irisDiameterMm: 11.7,    // Average human iris diameter in millimeters

  // Focal length calculation
  defaultNorm: { x: 0.8, y: 1.4 },
  focalLengthScale() {
    return {
      x: this.videoSize.width * this.defaultNorm.x,
      y: this.videoSize.height * this.defaultNorm.y,
    };
  },

  // Distance estimation
  distanceSmoothing: 0.18,           // Exponential smoothing factor (0-1)
  distanceVisibilityTimeout: 1200,   // Hide distance after ms of inactivity

  // Iris measurement stabilization (reduces jitter in measurements)
  irisSmoothing: 0.3,               // Exponential smoothing for iris diameter (0.1-0.3 recommended)
  irisStabilizationThreshold: 1,   // Ignore changes smaller than this many pixels
};

// ============================================================================
// MEDIAPIPE LANDMARKS & FACIAL FEATURE INDICES
// ============================================================================

/**
 * MediaPipe Face Landmarker indices for facial features
 * Reference: https://developers.google.com/mediapipe/solutions/vision/face_landmarker
 */
export const HEAD_CONFIG = {
  // Nose grid for detailed nose measurements (row order matters)
  noseGridIndices: {
    topRow: [105, 66, 107, 9, 336, 296, 334],
    browRow: [52, 65, 55, 8, 285, 295, 282],
    bridgeRow: [190, 189, 193, 168, 417, 413, 414],
    padRow: [114, 188, 122, 6, 351, 412, 343],
    underpadRow: [217, 174, 196, 197, 419, 399, 437],
    flareRow1: [198, 236, 3, 195, 248, 456, 420],
    flareRow2: [131, 134, 51, 5, 281, 363, 360],
    tipRow: [115, 220, 45, 4, 275, 440, 344],
  },

  // Face width measurement points
  faceWidthIdx: {
    left: 127,   // Left edge of face
    right: 356,  // Right edge of face
  },

  // Eye width measurement points
  eyeWidthIdx: {
    left: [35, 244],    // Left eye corners
    right: [464, 265],  // Right eye corners
  },

  // Iris and pupil landmarks for IPD and distance
  iris: {
    left: {
      iris: [474, 475, 476, 477],  // Left iris boundary points
      pupil: 473,                   // Left pupil center
    },
    right: {
      iris: [469, 470, 471, 472],  // Right iris boundary points
      pupil: 468,                   // Right pupil center
    },
  },
};

// ============================================================================
// VISUAL STYLING & COLORS
// ============================================================================

/**
 * Color scheme for measurement overlays
 */
export const COLOR_CONFIG = {
  // Nose measurement colors
  noseMetrics: {
    bridge: "#FF9F43",      // Orange - bridge width
    padSpan: "#00FFC8",     // Cyan - pad width
    padHeight: "#FFD166",   // Yellow - pad height
    padAngle: "#4DA6FF",    // Blue - pad angle
    flareAngle: "#FF6AD5",  // Pink - flare angle
  },

  // Eye measurement colors
  eyeWidths: {
    left: "#FFFFFF",   // White - left eye
    right: "#FFFFFF",  // White - right eye
  },

  // IPD (Interpupillary Distance) colors
  ipd: {
    near: "#FFFFFF",   // White - near IPD
    far: "#A0FFE6",    // Light cyan - far IPD
  },

  // Face measurement color
  faceWidth: "#FFFFFF",  // White - face width
};

export const LABEL_FONT = "bold 18px 'Segoe UI', sans-serif";

// ============================================================================
// OVERLAY & RENDERING SETTINGS
// ============================================================================

/**
 * IPD (Interpupillary Distance) overlay configuration
 */
export const IPD_OVERLAY_CONFIG = {
  textLift: 18,
  rails: [
    { key: "near", label: "Near", offset: 55, drawRail: true },
    { key: "far", label: "Far", offset: 85, drawRail: false },
  ],
};

/**
 * Face width overlay configuration
 */
export const FACE_OVERLAY_CONFIG = {
  label: "Face",
  spanOffset: 50,
  labelLift: 16,
};

/**
 * Eye width overlay configuration
 */
export const EYE_WIDTH_OVERLAY_CONFIG = {
  railOffset: 120,
  textLift: -20,
  drawRail: true,
};

/**
 * Default render policy settings
 */
export const RENDER_POLICY = {
  focus: "face",             // "global" | "face" | "eyes" | "nose"
  maxLeaders: 1,             // Maximum number of leader lines
  compact: {
    alphaSecondary: 0.55,    // Opacity for non-focused elements
    shortenLabels: true,     // Use abbreviated labels
    hideRailConnectors: true, // Hide rail connector lines
  },
};

// ============================================================================
// UI CONFIGURATION
// ============================================================================

/**
 * UI element configuration
 */
export const UI_CONFIG = {
  // Mirror mode (selfie view)
  mirrorEnabled: true,

  // Rendering mode
  renderMode: "canvas2d",  // "canvas2d" | "hybrid"
};

/**
 * Three.js 3D overlay configuration
 */
export const THREEJS_CONFIG = {
  // 3D head model
  headModel: {
    opacity: 0.5,
    wireframe: false,
    color: 0x88ccff,
    emissive: 0x223344,
    emissiveIntensity: 0.2,
    shininess: 30,
  },

  // Landmark visualization
  landmarks: {
    visible: true,
    size: 2.5,
    color: 0xffffff,
    opacity: 0.8,
  },

  // Lighting
  lights: {
    ambient: {
      color: 0xffffff,
      intensity: 0.6,
    },
    directional: {
      color: 0xffffff,
      intensity: 0.8,
      position: { x: 100, y: 100, z: 100 },
    },
    point: {
      color: 0xffffff,
      intensity: 0.5,
      position: { x: -100, y: -100, z: 100 },
    },
  },
};
