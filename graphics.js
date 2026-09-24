/**
 * Graphics Module - 2D overlay orchestration
 * @module graphics
 *
 * Public API:
 * - createGraphics(ctx) - Initialize graphics renderer
 * - beginFrame() - Reset state for new frame
 * - setRenderPolicy(policy) - Update render policy
 * - drawMeasurementOverlays(state) - Draw all measurement overlays
 *
 * Helpers live in utils/ (geometry, drawing primitives, collisions) and
 * graphics/ (nose and face/eye overlays).
 */

import { RENDER_POLICY } from "./config.js";
import { CollisionManager } from "./utils/collision-manager.js";
import { drawNoseOverlay } from "./graphics/nose-overlays.js";
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
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @returns {Object} Graphics renderer with public methods
 */
export function createGraphics(ctx) {
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
   * Draw all measurement overlays based on state and focus mode
   *
   * @param {Object} state - Measurement state
   * @param {Object} state.faceWidth - Face width measurement
   * @param {Object} state.ipd - IPD measurements (near/far)
   * @param {Object} state.eyes - Eye width measurements (left/right)
   * @param {Object} state.nose - Nose metrics
   */
  function drawMeasurementOverlays(state) {
    const focus = policy.focus;

    // FACE WIDTH
    if (state?.faceWidth && (focus === "global" || focus === "face")) {
      withAlpha(
        () => drawFaceWidthMeasurement(ctx, state.faceWidth, collisionManager),
        focus !== "face"
      );
    }

    // IPD
    if (state?.ipd && (focus === "global" || focus === "eyes" || focus === "face")) {
      withAlpha(
        () => drawIpdMeasurement(ctx, state.ipd, collisionManager),
        focus !== "eyes" && focus !== "face"
      );
    }

    // EYE WIDTHS
    if (focus === "global" || focus === "eyes") {
      for (const [side, label] of [["left", "L"], ["right", "R"]]) {
        if (!state?.eyes?.[side]) continue;
        withAlpha(() => {
          leadersUsed = drawEyeWidth(
            ctx,
            state.eyes[side],
            side,
            label,
            policy,
            leadersUsed,
            collisionManager
          );
        }, focus !== "eyes");
      }
    }

    // NOSE
    if (focus === "global" || focus === "nose") {
      withAlpha(() => drawNoseOverlay(ctx, state.nose), focus !== "nose");
    }
  }

  return {
    beginFrame,
    setRenderPolicy,
    drawMeasurementOverlays,
  };
}
