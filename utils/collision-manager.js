/**
 * Label collision detection and management for overlay rendering
 * @module utils/collision-manager
 */

/** @typedef {{x1: number, y1: number, x2: number, y2: number}} BoundingBox */
/** @typedef {{x: number, y: number}} Point */

/**
 * Manages collision detection for UI labels to prevent overlapping text
 */
export class CollisionManager {
  constructor() {
    /** @type {BoundingBox[]} */
    this.boxes = [];
  }

  /**
   * Reset all registered collision boxes (call at frame start)
   */
  reset() {
    this.boxes = [];
  }

  /**
   * Check if a box would collide with any registered boxes
   * @param {BoundingBox} box - Bounding box to test
   * @returns {boolean} True if collision detected
   */
  wouldCollide(box) {
    return this.boxes.some(
      (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
    );
  }

  /**
   * Register a box in the collision system
   * @param {BoundingBox} box - Bounding box to register
   */
  register(box) {
    this.boxes.push(box);
  }

  /**
   * Measure a text bounding box at a given position
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} text - Text to measure
   * @param {Point} pos - Position of the text
   * @param {string} font - Font string (e.g., "bold 18px sans-serif")
   * @returns {BoundingBox} Bounding box for the text
   */
  measureTextBox(ctx, text, pos, font) {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const height =
      (metrics.actualBoundingBoxAscent || 0) +
      (metrics.actualBoundingBoxDescent || 0) || 18;
    ctx.restore();

    return {
      x1: pos.x - width / 2,
      y1: pos.y - height / 2,
      x2: pos.x + width / 2,
      y2: pos.y + height / 2,
    };
  }

  /**
   * Find first non-colliding position from candidate list
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} text - Text to place
   * @param {Point[]} candidates - Candidate positions to try
   * @param {string} font - Font string
   * @returns {Point|null} First valid position or null if all collide
   */
  findNonCollidingPosition(ctx, text, candidates, font) {
    for (const pos of candidates) {
      const box = this.measureTextBox(ctx, text, pos, font);
      if (!this.wouldCollide(box)) {
        this.register(box);
        return pos;
      }
    }
    return null;
  }
}
