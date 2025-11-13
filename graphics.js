/**
 * Graphics Module - Main Orchestration
 * @module graphics
 *
 * Provides a clean, stable graphics API for the headSize application.
 *
 * Public API:
 * - createGraphics(canvas, ctx) - Initialize graphics renderer
 * - beginFrame() - Reset state for new frame
 * - setRenderPolicy(policy) - Update render policy
 * - drawMeasurementOverlays(state, options) - Draw all measurement overlays
 * - drawNoseGrid(landmarks, indices, color) - Draw nose landmark grid
 * - drawNoseOverlay(metrics) - Draw nose measurement overlay
 *
 * Architecture:
 * This module has been refactored for maximum readability and maintainability:
 * - Math/geometry: utils/graphics-geometry.js
 * - Drawing primitives: utils/drawing-primitives.js
 * - Angle rendering: utils/angle-rendering.js
 * - Nose overlays: graphics/nose-overlays.js
 * - Face/eye overlays: graphics/face-eye-overlays.js
 */

import { RENDER_POLICY } from "./config.js";
import { CollisionManager } from "./utils/collision-manager.js";
import { drawNoseGrid, drawNoseOverlay } from "./graphics/nose-overlays.js";
import {
  drawIpdMeasurement,
  drawFaceWidthMeasurement,
  drawEyeWidth,
} from "./graphics/face-eye-overlays.js";

// ============================================================================
// GRAPHICS FACTORY
// ============================================================================

/**
 * Create a graphics renderer instance
 *
 * @param {HTMLCanvasElement} canvasElement - Canvas DOM element
 * @param {CanvasRenderingContext2D} canvasCtx - Canvas rendering context
 * @returns {Object} Graphics renderer with public methods
 */
export function createGraphics(canvasElement, canvasCtx) {
  const ctx = canvasCtx;
  const canvas = canvasElement;
  const collisionManager = new CollisionManager();

  // Render policy state (mutable)
  let policy = { ...RENDER_POLICY };
  let leadersUsed = 0;

  // ========================================================================
  // FRAME MANAGEMENT
  // ========================================================================

  /**
   * Begin a new rendering frame
   * Resets collision manager and leader count
   */
  function beginFrame() {
    collisionManager.reset();
    leadersUsed = 0;
  }

  /**
   * Update render policy
   * @param {Object} next - Policy updates to merge
   */
  function setRenderPolicy(next) {
    policy = {
      ...policy,
      ...next,
      compact: { ...policy.compact, ...(next?.compact || {}) },
    };
  }

  // ========================================================================
  // RENDERING HELPERS
  // ========================================================================

  /**
   * Execute rendering function with optional alpha for secondary elements
   * @param {Function} fn - Rendering function to execute
   * @param {boolean} isSecondary - Whether this is a secondary element
   */
  function withAlpha(fn, isSecondary) {
    if (!isSecondary) {
      return fn();
    }
    ctx.save();
    ctx.globalAlpha = policy.compact.alphaSecondary;
    fn();
    ctx.restore();
  }

  // ========================================================================
  // MEASUREMENT OVERLAY RENDERING
  // ========================================================================

  /**
   * Draw all measurement overlays based on state and policy
   *
   * Renders measurements based on:
   * - Focus mode (global, face, eyes, nose)
   * - Detail level (minimal, standard, full)
   * - Available measurements in state
   *
   * @param {Object} state - Measurement state
   * @param {Object} state.faceWidth - Face width measurement
   * @param {Object} state.ipd - IPD measurements (near/far)
   * @param {Object} state.eyes - Eye width measurements (left/right)
   * @param {Object} state.nose - Nose metrics
   * @param {Object} options - Rendering options
   * @param {boolean} [options.noseOverlayEnabled=false] - Show nose overlay
   */
  function drawMeasurementOverlays(state, { noseOverlayEnabled = false } = {}) {
    const focus = policy.focus;
    const level = policy.detailLevel;

    // ======================================================================
    // FACE WIDTH (always in minimal/standard/full)
    // ======================================================================
    if (state?.faceWidth && (focus === "global" || focus === "face")) {
      withAlpha(
        () => drawFaceWidthMeasurement(ctx, state.faceWidth, collisionManager),
        focus !== "face"
      );
    }

    // ======================================================================
    // IPD (always in minimal/standard/full)
    // ======================================================================
    if (state?.ipd && (focus === "global" || focus === "eyes" || focus === "face")) {
      withAlpha(
        () => drawIpdMeasurement(ctx, state.ipd, collisionManager),
        focus !== "eyes" && focus !== "face"
      );
    }

    // ======================================================================
    // EYE WIDTHS (standard/full only)
    // ======================================================================
    if (level !== "minimal" && (focus === "global" || focus === "eyes")) {
      // Left eye
      if (state?.eyes?.left) {
        withAlpha(() => {
          leadersUsed = drawEyeWidth(
            ctx,
            state.eyes.left,
            "left",
            "L",
            policy,
            leadersUsed,
            collisionManager
          );
        }, focus !== "eyes");
      }

      // Right eye
      if (state?.eyes?.right) {
        withAlpha(() => {
          leadersUsed = drawEyeWidth(
            ctx,
            state.eyes.right,
            "right",
            "R",
            policy,
            leadersUsed,
            collisionManager
          );
        }, focus !== "eyes");
      }
    }

    // ======================================================================
    // NOSE OVERLAY (only if enabled; respects detail level)
    // ======================================================================
    if (noseOverlayEnabled && (focus === "global" || focus === "nose")) {
      withAlpha(
        () => drawNoseOverlay(ctx, state.nose, policy, collisionManager),
        focus !== "nose"
      );
    }
  }

  // ========================================================================
  // PUBLIC NOSE RENDERING
  // ========================================================================

  /**
   * Draw nose measurement overlay (public API)
   * @param {Object} metrics - Nose metrics object
   */
  function drawNoseOverlayPublic(metrics) {
    drawNoseOverlay(ctx, metrics, policy, collisionManager);
  }

  /**
   * Draw nose landmark grid (public API)
   * @param {Array} landmarks - MediaPipe face landmarks
   * @param {Object|Array} noseIndices - Nose landmark indices
   * @param {string} [color] - Grid color
   */
  function drawNoseGridPublic(landmarks, noseIndices, color) {
    drawNoseGrid(ctx, canvas, landmarks, noseIndices, color);
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  return {
    beginFrame,
    setRenderPolicy,
    drawNoseGrid: drawNoseGridPublic,
    drawMeasurementOverlays,
    drawNoseOverlay: drawNoseOverlayPublic,
  };
}
