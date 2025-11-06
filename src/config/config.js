export const MODEL_ASSET_PATHS = {
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  face:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
}

export const REAL_IRIS_DIAMETER_MM = 12
export const AVERAGE_PUPIL_DIAMETER_MM = 4.0

export const LEFT_EYE_CORNERS  = [33, 133]
export const RIGHT_EYE_CORNERS = [362, 263]

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


