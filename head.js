import {
  buildNoseGridPoints,
  buildLandmarkPair,
  computeIrisMeasurement,
  extractEyeSegment,
} from "./calculations.js";

class NoseComponent {
  constructor(indices) {
    this.indices = indices;
    this.grid = null;
  }

  reset() {
    this.grid = null;
  }

  update(landmarks, canvasWidth, canvasHeight) {
    if (!landmarks) {
      this.reset();
      return;
    }
    this.grid = buildNoseGridPoints(landmarks, this.indices, canvasWidth, canvasHeight);
  }
}

class FaceComponent {
  constructor(indexMap) {
    this.indexMap = indexMap;
    this.widthPoints = null;
  }

  reset() {
    this.widthPoints = null;
  }

  update(landmarks, canvasWidth, canvasHeight) {
    if (!landmarks) {
      this.reset();
      return;
    }
    this.widthPoints = buildLandmarkPair(landmarks, this.indexMap, canvasWidth, canvasHeight);
  }
}

class EyeSide {
  constructor({ iris, widthIdx }) {
    this.irisIndices = iris;
    this.widthIdx = widthIdx;
    this.iris = null;
    this.segment = null;
    this.smoothedDiameter = null;
    this.smoothingFactor = 0.3; // Lower = smoother but slower response (0.2-0.4 recommended)
  }

  reset() {
    this.iris = null;
    this.segment = null;
    this.smoothedDiameter = null;
  }

  update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn) {
    if (!landmarks) {
      this.reset();
      return;
    }
    const rawMeasurement = computeIrisMeasurement(
      landmarks,
      this.irisIndices.iris,
      this.irisIndices.pupil,
      canvasWidth,
      canvasHeight
    );

    if (rawMeasurement && rawMeasurement.diameterPx > 0) {
      // Apply exponential moving average smoothing to diameter
      if (this.smoothedDiameter === null) {
        this.smoothedDiameter = rawMeasurement.diameterPx;
      } else {
        this.smoothedDiameter =
          this.smoothingFactor * rawMeasurement.diameterPx +
          (1 - this.smoothingFactor) * this.smoothedDiameter;
      }

      // Calculate distance from smoothed diameter
      const distanceCm = estimateDistanceFn(this.smoothedDiameter);

      // Return measurement with smoothed diameter and calculated distance
      this.iris = {
        ...rawMeasurement,
        diameterPx: this.smoothedDiameter,
        distanceCm
      };
    } else {
      this.iris = rawMeasurement;
    }
    this.segment = extractEyeSegment(landmarks, this.widthIdx, canvasWidth, canvasHeight);
  }
}

class EyesComponent {
  constructor(config) {
    this.left = new EyeSide({ iris: config.leftIris, widthIdx: config.leftWidthIdx });
    this.right = new EyeSide({ iris: config.rightIris, widthIdx: config.rightWidthIdx });
  }

  reset() {
    this.left.reset();
    this.right.reset();
  }

  update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn) {
    this.left.update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn);
    this.right.update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn);
  }
}

class HeadComponent {
  constructor({ noseGridIndices, faceWidthIdx, eyeWidthIdx, iris }) {
    this.nose = new NoseComponent(noseGridIndices);
    this.face = new FaceComponent(faceWidthIdx);
    this.eyes = new EyesComponent({
      leftIris: iris.left,
      rightIris: iris.right,
      leftWidthIdx: eyeWidthIdx.left,
      rightWidthIdx: eyeWidthIdx.right,
    });
  }

  reset() {
    this.nose.reset();
    this.face.reset();
    this.eyes.reset();
  }

  update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn) {
    if (!landmarks) {
      this.reset();
      return;
    }
    this.nose.update(landmarks, canvasWidth, canvasHeight);
    this.face.update(landmarks, canvasWidth, canvasHeight);
    this.eyes.update(landmarks, canvasWidth, canvasHeight, estimateDistanceFn);
  }

  getAverageCameraDistance() {
    const left = this.eyes.left.iris;
    const right = this.eyes.right.iris;
    if (left?.distanceCm && right?.distanceCm) {
      return (left.distanceCm + right.distanceCm) / 2;
    }
    return null;
  }
}

export function createHeadTracker(config) {
  return new HeadComponent(config);
}
