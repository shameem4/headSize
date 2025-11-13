/**
 * Centralized Configuration for headSize Application
 * @module config
 *
 * This file contains all configuration settings organized into logical sections.
 * Modify values here to customize application behavior, appearance, and measurements.
 */

// ============================================================================
// APPLICATION SETTINGS
// ============================================================================

/**
 * Application-wide settings
 */
export const APP_CONFIG = {
  name: "headSize",
  version: "2.0.0",
  debug: false, // Set to true to enable console logging
};

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
  // Nose grid for detailed nose measurements
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

  // UI element colors
  ui: {
    background: "rgba(0, 0, 0, 0.65)",
    border: "rgba(255, 255, 255, 0.2)",
    text: "#FFFFFF",
    accent: "#00FFC8",
  },
};

/**
 * Typography settings
 */
export const TYPOGRAPHY = {
  labelFont: "bold 18px 'Segoe UI', sans-serif",
  titleFont: "600 16px 'Segoe UI', sans-serif",
  bodyFont: "400 14px 'Segoe UI', sans-serif",
};

// Backward compatibility
export const LABEL_FONT = TYPOGRAPHY.labelFont;

// ============================================================================
// OVERLAY & RENDERING SETTINGS
// ============================================================================

/**
 * Nose overlay positioning and styling
 */
export const NOSE_OVERLAY_CONFIG = {
  // Grid styling
  grid: {
    color: "#ffffff63",  // Semi-transparent white
    lineWidth: 1.5,
  },

  // Bracket offsets
  horizontalBracket: {
    lineOffset: 8,
    labelPadding: 6,
  },

  padHeight: {
    horizontalInset: -100,
    labelGap: -15,
  },

  // Angle overlays
  padAngle: {
    radius: 28,
    arcWidth: 2,
    armWidth: 2,
    labelPad: 10,
    leader: true,
    leaderWidth: 1.25,
  },

  flareAngle: {
    baseOffsetY: 12,
    radius: 30,
    arcWidth: 2,
    armWidth: 2,
    labelPad: 12,
    leader: true,
    leaderWidth: 1.25,
  },
};

// Backward compatibility
export const NOSE_OVERLAY_OFFSETS = {
  horizontalBracket: NOSE_OVERLAY_CONFIG.horizontalBracket,
  padHeight: NOSE_OVERLAY_CONFIG.padHeight,
  padAngle: NOSE_OVERLAY_CONFIG.padAngle,
  flareAngle: NOSE_OVERLAY_CONFIG.flareAngle,
};

export const NOSE_GRID_STYLE = NOSE_OVERLAY_CONFIG.grid;

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
  textAlign: "center",
  drawRail: true,
};

/**
 * Default render policy settings
 */
export const RENDER_POLICY = {
  detailLevel: "standard",   // "minimal" | "standard" | "full"
  focus: "face",             // "global" | "face" | "eyes" | "nose"
  maxLeaders: 1,             // Maximum number of leader lines
  minAngleDeg: 8,            // Minimum angle to display (reduces clutter)
  compact: {
    alphaSecondary: 0.55,    // Opacity for non-focused elements
    shortenLabels: true,     // Use abbreviated labels
    hideRailConnectors: true, // Hide rail connector lines
    showAngleArms: false,    // Hide angle arm lines
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

  // Nose overlay visibility
  noseOverlayEnabled: true,

  // Rendering mode
  renderMode: "canvas2d",  // "canvas2d" | "threejs" | "hybrid"

  // Metrics panel
  metricsPanel: {
    enabled: true,
    position: "right",  // "left" | "right"
  },

  // Video display
  video: {
    borderRadius: "24px",
    maxWidth: "100vw",
    maxHeight: "100vh",
  },
};

/**
 * Three.js 3D visualization configuration
 */
export const THREEJS_CONFIG = {
  // Enable 3D visualization
  enabled: true,

  // 3D head model
  headModel: {
    enabled: true,
    opacity: 0.85,
    wireframe: false,
    color: 0x88ccff,
    emissive: 0x223344,
    emissiveIntensity: 0.2,
    shininess: 30,
  },

  // Landmark visualization
  landmarks: {
    enabled: true,
    size: 2.5,
    color: 0xffffff,
    opacity: 0.8,
  },

  // Camera controls
  camera: {
    fov: 45,
    near: 0.1,
    far: 2000,
    position: { x: 0, y: 0, z: 500 },
    controls: {
      enabled: true,
      enableDamping: true,
      dampingFactor: 0.05,
      rotateSpeed: 0.5,
      zoomSpeed: 1.2,
      panSpeed: 0.8,
      minDistance: 100,
      maxDistance: 1000,
    },
  },

  // Lighting
  lights: {
    ambient: {
      enabled: true,
      color: 0xffffff,
      intensity: 0.6,
    },
    directional: {
      enabled: true,
      color: 0xffffff,
      intensity: 0.8,
      position: { x: 100, y: 100, z: 100 },
    },
    point: {
      enabled: true,
      color: 0xffffff,
      intensity: 0.5,
      position: { x: -100, y: -100, z: 100 },
    },
  },

  // Scene
  scene: {
    background: 0x1a1a1a,
    fog: {
      enabled: false,
      color: 0x1a1a1a,
      near: 500,
      far: 1500,
    },
  },

  // Grid helper
  grid: {
    enabled: true,
    size: 500,
    divisions: 20,
    colorCenterLine: 0x444444,
    colorGrid: 0x222222,
  },

  // Axes helper
  axes: {
    enabled: true,
    size: 100,
  },

  // Measurement overlays in 3D
  measurements3D: {
    enabled: true,
    scale: 1.0,
    depthTest: false,  // Always visible on top
  },
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate all configuration objects
 * @throws {Error} If any configuration is invalid
 * @returns {boolean} True if all validations pass
 */
export function validateConfig() {
  const errors = [];

  // Validate APP_CONFIG
  if (!APP_CONFIG.name || typeof APP_CONFIG.name !== "string") {
    errors.push("APP_CONFIG.name must be a non-empty string");
  }
  if (!APP_CONFIG.version || typeof APP_CONFIG.version !== "string") {
    errors.push("APP_CONFIG.version must be a non-empty string");
  }

  // Validate CAMERA_CONFIG
  if (!CAMERA_CONFIG.videoSize || typeof CAMERA_CONFIG.videoSize !== "object") {
    errors.push("CAMERA_CONFIG.videoSize must be an object");
  } else {
    if (CAMERA_CONFIG.videoSize.width <= 0 || CAMERA_CONFIG.videoSize.height <= 0) {
      errors.push("CAMERA_CONFIG.videoSize dimensions must be positive");
    }
  }

  if (CAMERA_CONFIG.irisDiameterMm <= 0) {
    errors.push("CAMERA_CONFIG.irisDiameterMm must be positive");
  }

  if (typeof CAMERA_CONFIG.focalLengthScale !== "function") {
    errors.push("CAMERA_CONFIG.focalLengthScale must be a function");
  }

  if (CAMERA_CONFIG.distanceSmoothing < 0 || CAMERA_CONFIG.distanceSmoothing > 1) {
    errors.push("CAMERA_CONFIG.distanceSmoothing must be between 0 and 1");
  }

  // Validate HEAD_CONFIG
  if (!HEAD_CONFIG.noseGridIndices || typeof HEAD_CONFIG.noseGridIndices !== "object") {
    errors.push("HEAD_CONFIG.noseGridIndices must be an object");
  }

  if (!HEAD_CONFIG.faceWidthIdx ||
      typeof HEAD_CONFIG.faceWidthIdx.left !== "number" ||
      typeof HEAD_CONFIG.faceWidthIdx.right !== "number") {
    errors.push("HEAD_CONFIG.faceWidthIdx must have numeric left and right properties");
  }

  if (!HEAD_CONFIG.iris || !HEAD_CONFIG.iris.left || !HEAD_CONFIG.iris.right) {
    errors.push("HEAD_CONFIG.iris must have left and right iris configurations");
  }

  // Validate COLOR_CONFIG
  if (!COLOR_CONFIG || typeof COLOR_CONFIG !== "object") {
    errors.push("COLOR_CONFIG must be an object");
  }

  // Validate RENDER_POLICY
  const validDetailLevels = ["minimal", "standard", "full"];
  if (!validDetailLevels.includes(RENDER_POLICY.detailLevel)) {
    errors.push(`RENDER_POLICY.detailLevel must be one of: ${validDetailLevels.join(", ")}`);
  }

  const validFocusModes = ["global", "face", "eyes", "nose"];
  if (!validFocusModes.includes(RENDER_POLICY.focus)) {
    errors.push(`RENDER_POLICY.focus must be one of: ${validFocusModes.join(", ")}`);
  }

  // Throw combined error if any validations failed
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n- ${errors.join("\n- ")}`);
  }

  return true;
}

/**
 * Get a configuration value by path (e.g., "CAMERA_CONFIG.videoSize.width")
 * @param {string} path - Dot-separated path to configuration value
 * @returns {*} Configuration value or undefined if not found
 */
export function getConfig(path) {
  const parts = path.split(".");
  let current = {
    APP_CONFIG,
    CAMERA_CONFIG,
    HEAD_CONFIG,
    COLOR_CONFIG,
    TYPOGRAPHY,
    NOSE_OVERLAY_CONFIG,
    IPD_OVERLAY_CONFIG,
    FACE_OVERLAY_CONFIG,
    EYE_WIDTH_OVERLAY_CONFIG,
    RENDER_POLICY,
    UI_CONFIG,
    THREEJS_CONFIG,
  };

  for (const part of parts) {
    if (current[part] === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Export all configuration as a single object for debugging
 */
export const ALL_CONFIG = {
  APP_CONFIG,
  CAMERA_CONFIG,
  HEAD_CONFIG,
  COLOR_CONFIG,
  TYPOGRAPHY,
  NOSE_OVERLAY_CONFIG,
  IPD_OVERLAY_CONFIG,
  FACE_OVERLAY_CONFIG,
  EYE_WIDTH_OVERLAY_CONFIG,
  RENDER_POLICY,
  UI_CONFIG,
  THREEJS_CONFIG,
};

// Log configuration in debug mode
if (APP_CONFIG.debug) {
  console.log("Configuration loaded:", ALL_CONFIG);
}
