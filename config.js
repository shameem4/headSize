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

  // Focal length as a fraction of video width (0.8 ≈ 64° horizontal FOV, a
  // typical webcam). Only affects distance; mm values barely depend on it.
  focalLengthNorm: 0.8,

  // Exponential smoothing of iris diameter (0-1, higher = faster response)
  irisSmoothing: 0.3,

  // Pupil-to-eye-rotation-center distance, used to convert the measured
  // (converged) IPD to far IPD
  eyeRotationRadiusMm: 10,
};

// ============================================================================
// MEDIAPIPE LANDMARKS & FACIAL FEATURE INDICES
// ============================================================================

/**
 * MediaPipe Face Landmarker indices for facial features
 * Reference: https://developers.google.com/mediapipe/solutions/vision/face_landmarker
 */
export const HEAD_CONFIG = {
  // Iris boundary points and pupil centers (subject's left/right)
  iris: {
    left: [474, 475, 476, 477],
    right: [469, 470, 471, 472],
  },
  pupil: { left: 473, right: 468 },

  // Eye corners, ordered from the subject's right to left
  eyeCorners: {
    left: [362, 263],
    right: [33, 133],
  },

  // Face edges [right, left]
  faceWidth: [127, 356],

  // Chin -> forehead, defines the face's vertical axis
  faceUp: [152, 10],

  // Nose rows, ordered across the nose
  bridgeRow: [190, 189, 193, 168, 417, 413, 414],
  padRow: [114, 188, 122, 6, 351, 412, 343],

  // Angles as [vertex, armA, armB]
  padAngle: [8, 412, 6],
  flareAngle: [6, 122, 351],
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
