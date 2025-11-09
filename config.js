export const CAMERA_CONFIG = {
  mediaPipeVersion: "0.10.0",
  runningMode: "VIDEO",
  videoSize: { width: 1280, height: 720 },
  irisDiameterMm: 11.7,
  defaultNorm: { x: 0.8, y: 1.4 },
  focalLengthScale() {
    return {
      x: this.videoSize.width * this.defaultNorm.x,
      y: this.videoSize.height * this.defaultNorm.y,
    };
  },
  distanceSmoothing: 0.18,
  distanceVisibilityTimeout: 1200,
};


export const HEAD_CONFIG = {
  noseGridIndices: {
    rows: [
      [105, 66, 107, 9, 336, 296, 334],
      [52, 65, 55, 8, 285, 295, 282],
      [190, 189, 193, 168, 417, 413, 414],
      [114, 188, 122, 6, 351, 412, 343],
      [217, 174, 196, 197, 419, 399, 437],
      [198, 236, 3, 195, 248, 456, 420],
      [131, 134, 51, 5, 281, 363, 360],
      [115, 220, 45, 4, 275, 440, 344],
    ],
  },
  faceWidthIdx: {
    left: 127,
    right: 356,
  },
  eyeWidthIdx: {
    left: [35, 244],
    right: [464, 265],
  },
  iris: {
    left: {
      iris: [474, 475, 476, 477],
      pupil: 473,
    },
    right: {
      iris: [469, 470, 471, 472],
      pupil: 468,
    },
  },
};

export const COLOR_CONFIG = {
  noseMetrics: {
    bridge: "#FF9F43",
    padSpan: "#00FFC8",
    padHeight: "#FFD166",
    padAngle: "#4DA6FF",
    flareAngle: "#FF6AD5",
  },
  eyeWidths: {
    left: "#6AE1FF",
    right: "#FF9BEA",
  },
  ipd: {
    near: "#FFFFFF",
    far: "#A0FFE6",
  },
  faceWidth: "#FFFFFF",
};

export const LABEL_FONT = "bold 18px 'Segoe UI', sans-serif";

export const NOSE_OVERLAY_OFFSETS = {
  horizontalBracket: { lineOffset: 8, labelPadding: 6 },
  padHeight: { horizontalInset: 60, labelGap: 20 },
  padAngle: { labelOffsetX: 18, labelOffsetY: 6 },
  flareAngle: { baseOffsetY: 12, labelOffsetY: 6 },
};

export const NOSE_GRID_STYLE = {
  color: "#ffffff63",
  lineWidth: 1.5,
};

export const IPD_OVERLAY_CONFIG = {
  textLift: 18,
  rails: [
    { key: "near", label: "Near", offset: 55, drawRail: true },
    { key: "far", label: "Far", offset: 85, drawRail: false },
  ],
};

export const FACE_OVERLAY_CONFIG = {
  label: "Face",
  spanOffset: 50,
  labelLift: 16,
};

export const EYE_OVERLAY_CONFIG = {
  railOffset: 20,
  textLift: 18,
  textAlign: "center",
  drawRail: true,
};
