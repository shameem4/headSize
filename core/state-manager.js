/**
 * State Manager - manages measurement state and distance tracking
 * @module core/state-manager
 */

import { MeasurementBuilders } from "../calculations.js";

const {
  buildIpdMeasurement,
  buildFaceWidthMeasurement,
  buildEyeWidthMeasurement,
  computeNoseMetrics,
} = MeasurementBuilders;

/**
 * @typedef {Object} MeasurementState
 * @property {Object|null} ipd - IPD measurements (near, far)
 * @property {Object|null} faceWidth - Face width measurement
 * @property {Object} eyes - Eye width measurements
 * @property {Object|null} nose - Nose metrics
 */

/**
 * Manages the application's measurement state with stabilization
 */
export class StateManager {
  constructor(config) {
    this.config = config;
    this.smoothedDistance = null;
    this.lastDistanceUpdate = 0;

    // Iris diameter smoothing for stable measurements (configurable)
    this.smoothedIrisDiameterPx = null;
    this.smoothingFactor = config.irisSmoothing ?? 0.15;
    this.stabilizationThreshold = config.irisStabilizationThreshold ?? 0.5;

    /** @type {MeasurementState} */
    this.measurements = {
      ipd: null,
      faceWidth: null,
      eyes: { left: null, right: null },
      nose: null,
    };
  }

  /**
   * Reset all measurements to null
   */
  reset() {
    this.measurements.ipd = null;
    this.measurements.faceWidth = null;
    this.measurements.eyes = { left: null, right: null };
    this.measurements.nose = null;
    // Don't reset smoothed iris diameter - maintain stability across brief interruptions
  }

  /**
   * Smooth iris diameter with exponential smoothing and stabilization threshold
   * @param {number} rawDiameterPx - Raw iris diameter in pixels
   * @returns {number} Smoothed iris diameter
   */
  smoothIrisDiameter(rawDiameterPx) {
    // Initialize on first call
    if (this.smoothedIrisDiameterPx === null) {
      this.smoothedIrisDiameterPx = rawDiameterPx;
      return rawDiameterPx;
    }

    // Calculate difference
    const diff = Math.abs(rawDiameterPx - this.smoothedIrisDiameterPx);

    // Ignore tiny changes (stabilization threshold)
    if (diff < this.stabilizationThreshold) {
      return this.smoothedIrisDiameterPx; // No change
    }

    // Apply exponential smoothing for larger changes
    this.smoothedIrisDiameterPx += (rawDiameterPx - this.smoothedIrisDiameterPx) * this.smoothingFactor;

    return this.smoothedIrisDiameterPx;
  }

  /**
   * Update measurements from head tracking data with iris diameter stabilization
   * @param {Object} head - Head tracker instance
   * @param {number} irisDiameterMm - Expected iris diameter in mm
   */
  updateMeasurements(head, irisDiameterMm) {
    const leftIris = head.eyes.left.iris;
    const rightIris = head.eyes.right.iris;

    if (!leftIris || !rightIris) {
      this.reset();
      return;
    }

    // Calculate raw average iris diameter
    const rawAvgDiameterPx = (rightIris.diameterPx + leftIris.diameterPx) / 2;
    if (!Number.isFinite(rawAvgDiameterPx) || rawAvgDiameterPx <= 0) {
      this.reset();
      return;
    }

    // Apply smoothing to reduce jitter
    const smoothedDiameterPx = this.smoothIrisDiameter(rawAvgDiameterPx);

    // Calculate mmPerPx using smoothed diameter for stable measurements
    const mmPerPx = irisDiameterMm / smoothedDiameterPx;

    this.measurements.ipd = buildIpdMeasurement(leftIris, rightIris, mmPerPx);
    this.measurements.faceWidth = buildFaceWidthMeasurement(head.face.widthPoints, mmPerPx);
    this.measurements.eyes = {
      left: buildEyeWidthMeasurement(head.eyes.left.segment, mmPerPx),
      right: buildEyeWidthMeasurement(head.eyes.right.segment, mmPerPx),
    };

    const noseMetrics = computeNoseMetrics(head.nose.grid, mmPerPx);
    this.measurements.nose = noseMetrics;
  }

  /**
   * Update smoothed distance with exponential smoothing
   * @param {number} distanceCm - Raw distance measurement in cm
   * @returns {number} Smoothed distance
   */
  updateDistance(distanceCm) {
    if (this.smoothedDistance == null) {
      this.smoothedDistance = distanceCm;
    } else {
      const smoothingFactor = this.config.distanceSmoothing || 0.18;
      this.smoothedDistance += (distanceCm - this.smoothedDistance) * smoothingFactor;
    }

    this.lastDistanceUpdate = performance.now();
    return this.smoothedDistance;
  }

  /**
   * Check if distance should be hidden due to timeout
   * @returns {boolean} True if distance should be decayed
   */
  shouldDecayDistance() {
    if (!this.lastDistanceUpdate) return false;
    const timeout = this.config.distanceVisibilityTimeout || 1200;
    return performance.now() - this.lastDistanceUpdate > timeout;
  }

  /**
   * Decay (reset) distance when timeout expires
   */
  decayDistance() {
    if (this.shouldDecayDistance()) {
      this.smoothedDistance = null;
      this.lastDistanceUpdate = 0;
    }
  }

  /**
   * Get current smoothed distance
   * @returns {number|null} Smoothed distance in cm or null
   */
  getSmoothedDistance() {
    return this.smoothedDistance;
  }

  /**
   * Get current measurement state
   * @returns {MeasurementState}
   */
  getMeasurements() {
    return this.measurements;
  }
}
