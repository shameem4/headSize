export const MODEL_ASSET_PATHS = {
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  face:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  pose:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
}

export const REAL_IRIS_DIAMETER_MM = 12
export const AVERAGE_PUPIL_DIAMETER_MM = 4.0

export const OVERLAY_METADATA = {
  landmarkIndices: {
    faceLeft: 127,
    faceRight: 356,
    noseBridge: 6,
    noseTip: 4,
    alareLeft: 64,
    alareRight: 294,
  },
  bodyLandmarkIndices: {
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
  },
  ids: {
    lines: {
      ipd: 'ipd',
      faceBreadth: 'face-breadth',
      noseArch: 'nose-arch',
      noseLeft: 'nose-left',
      noseRight: 'nose-right',
      shoulders: 'shoulders',
      leftUpperArm: 'left-upper-arm',
      leftLowerArm: 'left-lower-arm',
      rightUpperArm: 'right-upper-arm',
      rightLowerArm: 'right-lower-arm',
      leftTorso: 'left-torso',
      rightTorso: 'right-torso',
    },
    points: {
      irisLeft: 'iris-left',
      irisRight: 'iris-right',
      faceLeft: 'face-left',
      faceRight: 'face-right',
      bridge: 'bridge',
      noseTip: 'nose-tip',
      alareLeft: 'alare-left',
      alareRight: 'alare-right',
      leftShoulder: 'left-shoulder',
      rightShoulder: 'right-shoulder',
      leftElbow: 'left-elbow',
      rightElbow: 'right-elbow',
      leftWrist: 'left-wrist',
      rightWrist: 'right-wrist',
      leftHip: 'left-hip',
      rightHip: 'right-hip',
    },
  },
  measurementItems: [
    {
      key: 'ipdMM',
      label: 'IPD',
      unit: 'mm',
      description: 'Interpupillary distance between iris centers.',
      colorClass: 'legend-red',
    },
    {
      key: 'faceBreadthMM',
      label: 'Face breadth',
      unit: 'mm',
      description: 'Widest detected span across the face contour.',
      colorClass: 'legend-green',
    },
    {
      key: 'noseArchMM',
      label: 'Nose arch',
      unit: 'mm',
      description: 'Bridge height estimated from tip-to-bridge depth.',
      colorClass: 'legend-blue',
    },
    {
      key: 'flareDeg',
      label: 'Nose angle',
      unit: 'deg',
      description: 'Flare angle formed by alare landmarks.',
      colorClass: 'legend-orange',
    },
    {
      key: 'distanceToCameraCM',
      label: 'Camera distance',
      unit: 'cm',
      description: 'Estimated gap between the camera and face midpoint.',
      colorClass: 'legend-purple',
    },
  ],
}

export const OVERLAY_STYLE = {
  defaultDepth: -0.1,
  lineWidth: 4,
  sphereGeometryArgs: [6, 16, 16],
  materialOpacity: 0.9,
  clearColorHex: 0x000000,
  colors: {
    ipd: '#ff4d4d',
    faceBreadth: '#36ff9a',
    noseArch: '#5ecbff',
    nose: '#ffa24f',
    body: '#ffd166',
  },
}

export const PROCESSING_CONFIG = {
  targetFps: 15,
  fallbackVideoSize: {
    width: 1280,
    height: 720,
  },
  kalmanNoise: {
    ipdMM: { processNoise: 0.2, measurementNoise: 50 },
    faceBreadthMM: { processNoise: 0.5, measurementNoise: 120 },
    noseArchMM: { processNoise: 0.15, measurementNoise: 40 },
    flareDeg: { processNoise: 0.3, measurementNoise: 160 },
    distanceToCameraCM: { processNoise: 0.6, measurementNoise: 400 },
    eyeHeightLeftMM: { processNoise: 0.35, measurementNoise: 180 },
    eyeHeightRightMM: { processNoise: 0.35, measurementNoise: 180 },
    eyeHeightDeltaMM: { processNoise: 0.35, measurementNoise: 200 },
  },
  smoothing: {
    alpha: 0.2,
    defaultThreshold: 0.15,
    thresholds: {
      ipdMM: 0.8,
      faceBreadthMM: 2.0,
      noseArchMM: 0.8,
      flareDeg: 0.8,
      distanceToCameraCM: 1.4,
      eyeHeightLeftMM: 0.6,
      eyeHeightRightMM: 0.6,
      eyeHeightDeltaMM: 0.5,
    },
  },
}

export const CAMERA_CONFIG = {
  position: [0, 0, 0],
  zoom: 1,
  near: -100,
  far: 100,
}

export const DISTANCE_TO_CAMERA = {
  horizontalFovDegrees: 60,
  minReliableIpdPx: 8,
  clampCm: {
    min: 20,
    max: 120,
  },
}
